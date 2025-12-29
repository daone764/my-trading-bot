const cron = require('node-cron');
const { EMA, RSI } = require('technicalindicators');
const cronParser = require('cron-parser');

const EthPaperLogger = require('./logger');
const { loadJson, saveJson } = require('./state_store');
const CcxtMarketData = require('./ccxt_marketdata');
const CcxtTrader = require('./ccxt_trader');

function pctToFrac(pct) {
  return Number(pct) / 100;
}

function nowIso() {
  return new Date().toISOString();
}

function validateConfig(cfg) {
  if (!cfg.pairWhitelist || cfg.pairWhitelist.length !== 1) {
    throw new Error('PAIR_WHITELIST must contain exactly 1 pair (e.g. ETH/USD or BTC/USD).');
  }

  if (cfg.maxOpenTrades !== 1) {
    throw new Error('MAX_OPEN_TRADES must be 1.');
  }

  if (cfg.stakeAmountUsd < cfg.minOrderUsd) {
    throw new Error('STAKE_AMOUNT_USD must be >= MIN_ORDER_USD.');
  }

  if (!cron.validate(cfg.scheduleCron)) {
    throw new Error(`Invalid SCHEDULE_CRON: ${cfg.scheduleCron}`);
  }

  if (cfg.feeRate < 0 || cfg.feeRate >= 0.2) {
    throw new Error('FEE_RATE looks invalid (expected 0 <= fee < 0.2).');
  }

  if (cfg.exchange !== 'coinbase') {
    throw new Error('Only EXCHANGE=coinbase is supported by this paper bot right now.');
  }

  // Two-switch live trading gate.
  if (cfg.paperTrading === false && cfg.enableLiveTrading !== true) {
    throw new Error('Live trading disabled: set ENABLE_LIVE_TRADING=true (two-switch safety).');
  }
}

function defaultState(totalCapitalUsd) {
  return {
    createdAt: nowIso(),
    wallet: {
      usd: Number(totalCapitalUsd),
      eth: 0
    },
    openPosition: null,
    tradeHistory: [],
    lastWeeklySummaryAt: null,
    lastTick: null
  };
}

module.exports = class EthPaperBot {
  constructor(config) {
    this.config = config;
    validateConfig(this.config);

    this.logger = new EthPaperLogger({
      logFile: this.config.logFile,
      logLevel: this.config.logLevel,
      logToConsole: this.config.logConsole
    });

    this.marketData = new CcxtMarketData('coinbase');

    this.isLiveTrading = this.config.paperTrading === false && this.config.enableLiveTrading === true;
    this.trader = this.isLiveTrading
      ? new CcxtTrader('coinbase', {
          apiKey: this.config.coinbaseApiKey,
          secret: this.config.coinbaseApiSecret,
          password: this.config.coinbaseApiPassword
        })
      : null;

    this.task = null;
    this.isRunning = false;
  }

  logStartup(context = {}) {
    const mode = this.isLiveTrading ? 'LIVE' : 'PAPER';
    this.logger.warn(`Mode: ${mode}`, {
      paperTrading: this.config.paperTrading,
      enableLiveTrading: this.config.enableLiveTrading,
      ...context
    });

    let nextRunAt = null;
    try {
      let expr = null;
      if (typeof cronParser.parseExpression === 'function') {
        expr = cronParser.parseExpression(this.config.scheduleCron, { currentDate: new Date() });
      } else if (cronParser.CronExpressionParser && typeof cronParser.CronExpressionParser.parse === 'function') {
        expr = cronParser.CronExpressionParser.parse(this.config.scheduleCron, { currentDate: new Date() });
      }

      nextRunAt = expr ? expr.next().toISOString() : null;
    } catch (e) {
      // Leave nextRunAt null if parsing fails.
    }

    this.logger.info('ETH paper bot starting', {
      mode,
      pair: this.config.pairWhitelist[0],
      candleTimeframe: this.config.candleTimeframe || '15m',
      scheduleCron: this.config.scheduleCron,
      nextRunAt,
      totalCapitalUsd: this.config.totalCapitalUsd,
      stakeAmountUsd: this.config.stakeAmountUsd,
      minOrderUsd: this.config.minOrderUsd,
      feeRate: this.config.feeRate,
      entry: {
        strategy: this.config.entryStrategy,
        emaShort: this.config.emaShort,
        emaLong: this.config.emaLong,
        rsiOversold: this.config.rsiOversold,
        rsiOverbought: this.config.rsiOverbought
      },
      exit: {
        stopLossPercent: this.config.stopLossPercent,
        takeProfitPercent: this.config.takeProfitPercent,
        trailingStopPercent: this.config.trailingStopPercent
      }
    });
  }

  async runOnce() {
    this.logStartup({ once: true });
    await this.tick();
  }

  loadState() {
    const loaded = loadJson(this.config.stateFile);
    if (loaded) {
      return loaded;
    }

    const created = defaultState(this.config.totalCapitalUsd);
    saveJson(this.config.stateFile, created);
    return created;
  }

  saveState(state) {
    saveJson(this.config.stateFile, state);
  }

  start() {
    if (this.isRunning) {
      this.logger.warn('ETH paper bot already running');
      return;
    }

    this.logStartup({ once: false });

    this.task = cron.schedule(this.config.scheduleCron, async () => {
      await this.tick();
    });

    this.isRunning = true;
    this.logger.info('ETH paper bot started');

    // Run immediately on startup too.
    this.tick().catch(err => {
      this.logger.error('Initial tick failed', { error: err.message, stack: err.stack });
    });
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    this.isRunning = false;
    this.logger.info('ETH paper bot stopped');
  }

  async tick() {
    try {
      const cfg = this.config;
      const pair = cfg.pairWhitelist[0];

      const state = this.loadState();

      const recordTick = patch => {
        state.lastTick = {
          ...(state.lastTick || {}),
          at: nowIso(),
          pair,
          ...patch
        };
      };

      recordTick({ status: 'START' });

      // Safety: skip trades if USD balance is below minimum order and no position exists.
      if (!state.openPosition && state.wallet.usd < cfg.minOrderUsd) {
        this.logger.warn('Skipping tick: wallet below MIN_ORDER_USD', {
          usd: state.wallet.usd,
          minOrderUsd: cfg.minOrderUsd
        });
        recordTick({ status: 'SKIP', decision: { action: 'SKIP', reason: 'WALLET_BELOW_MIN_ORDER_USD' } });
        this.saveState(state);
        return;
      }

      const candleTimeframe = cfg.candleTimeframe || '15m';
      const candles = await this.marketData.fetchCandles(pair, candleTimeframe, 500);
      if (!candles || candles.length < Math.max(cfg.emaLong, 50)) {
        this.logger.warn('Skipping tick: not enough candle data', { candles: candles ? candles.length : 0 });
        recordTick({ status: 'SKIP', decision: { action: 'SKIP', reason: 'NOT_ENOUGH_CANDLE_DATA' }, candles: candles ? candles.length : 0 });
        this.saveState(state);
        return;
      }

      const closes = candles.map(c => c.close);

      const emaShortArr = EMA.calculate({ period: cfg.emaShort, values: closes });
      const emaLongArr = EMA.calculate({ period: cfg.emaLong, values: closes });
      const rsiArr = RSI.calculate({ period: 14, values: closes });

      if (emaShortArr.length < 2 || emaLongArr.length < 2 || rsiArr.length < 1) {
        this.logger.warn('Skipping tick: indicators not ready', {
          emaShortLen: emaShortArr.length,
          emaLongLen: emaLongArr.length,
          rsiLen: rsiArr.length
        });
        recordTick({
          status: 'SKIP',
          decision: { action: 'SKIP', reason: 'INDICATORS_NOT_READY' },
          indicators: { emaShortLen: emaShortArr.length, emaLongLen: emaLongArr.length, rsiLen: rsiArr.length }
        });
        this.saveState(state);
        return;
      }

      const lastClose = closes[closes.length - 1];
      const lastCandleTime = candles[candles.length - 1].time;

      const emaShort = emaShortArr[emaShortArr.length - 1];
      const emaLong = emaLongArr[emaLongArr.length - 1];
      const prevEmaShort = emaShortArr[emaShortArr.length - 2];
      const prevEmaLong = emaLongArr[emaLongArr.length - 2];
      const rsi = rsiArr[rsiArr.length - 1];

      const crossedUp = prevEmaShort <= prevEmaLong && emaShort > emaLong;

      const inRsiBand = rsi >= cfg.rsiOversold && rsi <= cfg.rsiOverbought;

      recordTick({
        status: 'EVALUATE',
        candleTime: new Date(lastCandleTime).toISOString(),
        close: lastClose,
        indicators: {
          emaShort,
          emaLong,
          prevEmaShort,
          prevEmaLong,
          rsi
        },
        signals: {
          crossedUp,
          inRsiBand
        }
      });

      if (!state.openPosition) {
        // Entry
        if (!crossedUp) {
          if (cfg.dryRunVerbose) {
            this.logger.info('No entry: no EMA crossover', {
              pair,
              time: new Date(lastCandleTime).toISOString(),
              close: lastClose,
              emaShort,
              emaLong,
              rsi
            });
          }

          recordTick({ status: 'NO_ENTRY', decision: { action: 'HOLD', reason: 'NO_EMA_CROSSOVER' } });
          this.saveState(state);
          await this.maybeWeeklySummary(state, lastClose);
          return;
        }

        if (!inRsiBand) {
          this.logger.info('No entry: RSI outside band', {
            pair,
            time: new Date(lastCandleTime).toISOString(),
            close: lastClose,
            emaShort,
            emaLong,
            rsi,
            rsiOversold: cfg.rsiOversold,
            rsiOverbought: cfg.rsiOverbought
          });

          recordTick({ status: 'NO_ENTRY', decision: { action: 'HOLD', reason: 'RSI_OUTSIDE_BAND' } });
          this.saveState(state);
          await this.maybeWeeklySummary(state, lastClose);
          return;
        }

        if (state.wallet.usd < cfg.minUsdBalance) {
          this.logger.warn('No entry: USD balance below MIN_USD_BALANCE', {
            usd: state.wallet.usd,
            minUsdBalance: cfg.minUsdBalance
          });

          recordTick({ status: 'NO_ENTRY', decision: { action: 'HOLD', reason: 'USD_BELOW_MIN_USD_BALANCE' } });
          this.saveState(state);
          await this.maybeWeeklySummary(state, lastClose);
          return;
        }

        // In live mode, use exchange balance for sizing.
        if (this.isLiveTrading) {
          const balances = await this.trader.fetchFreeBalances();
          state.wallet.usd = Number((balances.usd ?? state.wallet.usd).toFixed(8));
          state.wallet.eth = Number((balances.eth ?? state.wallet.eth).toFixed(12));
        }

        const maxAffordable = state.wallet.usd / (1 + cfg.feeRate);
        const orderUsd = Math.min(cfg.stakeAmountUsd, maxAffordable);

        if (orderUsd < cfg.minOrderUsd) {
          this.logger.warn('No entry: order below MIN_ORDER_USD after fee cap', {
            usd: state.wallet.usd,
            feeRate: cfg.feeRate,
            intendedStake: cfg.stakeAmountUsd,
            computedOrderUsd: orderUsd,
            minOrderUsd: cfg.minOrderUsd
          });

          recordTick({
            status: 'NO_ENTRY',
            decision: { action: 'HOLD', reason: 'ORDER_BELOW_MIN_ORDER_AFTER_FEES' },
            orderUsd
          });
          this.saveState(state);
          await this.maybeWeeklySummary(state, lastClose);
          return;
        }

        const qtyEth = orderUsd / lastClose;
        const feeUsd = orderUsd * cfg.feeRate;
        const totalUsd = orderUsd + feeUsd;

        let liveOrder = null;
        if (this.isLiveTrading) {
          if (cfg.orderType !== 'market') {
            throw new Error('Live trading currently supports only ORDER_TYPE=market.');
          }
          liveOrder = await this.trader.buyMarket(pair, qtyEth);
        }

        // Update simulated wallet (paper) or local snapshot (live).
        state.wallet.usd = Number((state.wallet.usd - totalUsd).toFixed(8));
        state.wallet.eth = Number((state.wallet.eth + qtyEth).toFixed(12));

        state.openPosition = {
          pair,
          entryTime: nowIso(),
          entryCandleTime: new Date(lastCandleTime).toISOString(),
          entryPrice: lastClose,
          qtyEth,
          costUsd: orderUsd,
          feeUsd,
          peakPrice: lastClose,
          liveOrderId: liveOrder ? liveOrder.id : null
        };

        state.tradeHistory.push({
          time: nowIso(),
          action: 'BUY',
          pair,
          price: lastClose,
          qtyEth,
          grossUsd: orderUsd,
          feeUsd,
          netUsd: totalUsd
        });

        recordTick({
          status: 'BUY',
          decision: { action: 'BUY', reason: 'EMA_CROSSOVER_AND_RSI_IN_BAND' },
          orderUsd,
          qtyEth,
          feeUsd
        });

        this.saveState(state);

        this.logger.info(this.isLiveTrading ? 'BUY executed (live)' : 'BUY executed (paper)', {
          pair,
          price: lastClose,
          qtyEth,
          orderUsd,
          feeUsd,
          liveOrderId: liveOrder ? liveOrder.id : null,
          wallet: state.wallet
        });

        await this.maybeWeeklySummary(state, lastClose);
        return;
      }

      // Exit / position management
      const pos = state.openPosition;

      // Track peak for trailing
      if (lastClose > pos.peakPrice) {
        pos.peakPrice = lastClose;
      }

      const stopLossPrice = pos.entryPrice * (1 - pctToFrac(cfg.stopLossPercent));
      const takeProfitPrice = pos.entryPrice * (1 + pctToFrac(cfg.takeProfitPercent));
      const trailingStopPrice = pos.peakPrice * (1 - pctToFrac(cfg.trailingStopPercent));

      let exitReason = null;
      if (lastClose <= stopLossPrice) {
        exitReason = 'STOP_LOSS';
      } else if (lastClose >= takeProfitPrice) {
        exitReason = 'TAKE_PROFIT';
      } else if (cfg.trailingStopPercent > 0 && pos.peakPrice > pos.entryPrice && lastClose <= trailingStopPrice) {
        exitReason = 'TRAILING_STOP';
      }

      if (!exitReason) {
        if (cfg.dryRunVerbose) {
          this.logger.info('Holding position', {
            pair,
            time: new Date(lastCandleTime).toISOString(),
            close: lastClose,
            entryPrice: pos.entryPrice,
            peakPrice: pos.peakPrice,
            stopLossPrice,
            takeProfitPrice,
            trailingStopPrice,
            wallet: state.wallet
          });
        }

        recordTick({
          status: 'HOLD',
          decision: { action: 'HOLD', reason: 'POSITION_OPEN_NO_EXIT' },
          risk: { stopLossPrice, takeProfitPrice, trailingStopPrice },
          position: {
            entryPrice: pos.entryPrice,
            peakPrice: pos.peakPrice,
            qtyEth: pos.qtyEth
          }
        });

        this.saveState(state);
        await this.maybeWeeklySummary(state, lastClose);
        return;
      }

      // Sell all ETH
      const { qtyEth } = pos;
      const grossUsd = qtyEth * lastClose;
      const feeUsd = grossUsd * cfg.feeRate;
      const netUsd = grossUsd - feeUsd;

      let liveSellOrder = null;
      if (this.isLiveTrading) {
        if (cfg.orderType !== 'market') {
          throw new Error('Live trading currently supports only ORDER_TYPE=market.');
        }
        liveSellOrder = await this.trader.sellMarket(pair, qtyEth);
      }

      state.wallet.eth = Number((state.wallet.eth - qtyEth).toFixed(12));
      state.wallet.usd = Number((state.wallet.usd + netUsd).toFixed(8));

      const pnlUsd = netUsd - pos.costUsd - pos.feeUsd;

      state.tradeHistory.push({
        time: nowIso(),
        action: 'SELL',
        reason: exitReason,
        pair,
        price: lastClose,
        qtyEth,
        grossUsd,
        feeUsd,
        netUsd,
        pnlUsd
      });

      recordTick({
        status: 'SELL',
        decision: { action: 'SELL', reason: exitReason },
        risk: { stopLossPrice, takeProfitPrice, trailingStopPrice },
        pnlUsd,
        feeUsd,
        grossUsd,
        netUsd
      });

      state.openPosition = null;

      this.saveState(state);

      this.logger.info(this.isLiveTrading ? 'SELL executed (live)' : 'SELL executed (paper)', {
        pair,
        reason: exitReason,
        price: lastClose,
        qtyEth,
        grossUsd,
        feeUsd,
        netUsd,
        pnlUsd,
        liveOrderId: liveSellOrder ? liveSellOrder.id : null,
        wallet: state.wallet
      });

      await this.maybeWeeklySummary(state, lastClose);
    } catch (err) {
      try {
        const state = this.loadState();
        state.lastTick = {
          ...(state.lastTick || {}),
          at: nowIso(),
          status: 'ERROR',
          error: err.message
        };
        this.saveState(state);
      } catch (e) {
        // ignore state write failures
      }
      this.logger.error('Tick failed', { error: err.message, stack: err.stack });
    }
  }

  async maybeWeeklySummary(state, currentPrice) {
    if (!this.config.weeklySummary) {
      return;
    }

    const now = Date.now();
    const last = state.lastWeeklySummaryAt ? Date.parse(state.lastWeeklySummaryAt) : null;

    if (last && now - last < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    const realized = state.tradeHistory.filter(t => t.action === 'SELL').reduce((acc, t) => acc + Number(t.pnlUsd || 0), 0);

    const open = state.openPosition;
    const unrealized = open ? open.qtyEth * currentPrice - open.costUsd - open.feeUsd : 0;

    const summary = {
      time: nowIso(),
      realizedPnlUsd: realized,
      unrealizedPnlUsd: unrealized,
      wallet: state.wallet,
      openPosition: open
        ? {
            pair: open.pair,
            entryTime: open.entryTime,
            entryPrice: open.entryPrice,
            qtyEth: open.qtyEth,
            peakPrice: open.peakPrice
          }
        : null,
      trades: {
        buys: state.tradeHistory.filter(t => t.action === 'BUY').length,
        sells: state.tradeHistory.filter(t => t.action === 'SELL').length
      }
    };

    state.lastWeeklySummaryAt = nowIso();
    this.saveState(state);

    this.logger.info('WEEKLY SUMMARY', summary);
  }
};
