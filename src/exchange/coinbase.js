const ccxt = require('ccxt');
const moment = require('moment');

const ExchangeCandlestick = require('../dict/exchange_candlestick');
const Ticker = require('../dict/ticker');
const TickerEvent = require('../event/ticker_event');
const Position = require('../dict/position');
const CcxtExchangeOrder = require('./ccxt/ccxt_exchange_order');

module.exports = class Coinbase {
  constructor(eventEmitter, logger, candlestickResample, queue, candleImporter) {
    this.eventEmitter = eventEmitter;
    this.logger = logger;
    this.candlestickResample = candlestickResample;
    this.queue = queue;
    this.candleImporter = candleImporter;

    this.ccxtClientRaw = undefined;
    this.ccxtClient = undefined;
    this.ccxtExchangeOrder = CcxtExchangeOrder.createEmpty(logger);

    this.symbols = [];
    this.tickers = {};
    this.fills = {};
    this.balances = [];
    this.exchangePairs = {};

    this.symbolMapBotToCcxt = {};
    this.symbolMapCcxtToBot = {};

    this.intervals = [];
  }

  getName() {
    return 'coinbase';
  }

  async backfill(symbol, period, start) {
    // Initialize ccxt client if not already done
    if (!this.ccxtClient) {
      const clientRaw = new ccxt.coinbase({
        enableRateLimit: true
      });
      this.ccxtClient = this.createCcxtProxy(clientRaw);
    }

    const ccxtSymbol = this.toCcxtSymbol(symbol);
    const since = moment(start).valueOf();
    
    try {
      const ohlcvs = await this.ccxtClient.fetchOHLCV(ccxtSymbol, period, since, 500);
      
      return ohlcvs.map(candle => ({
        time: Math.round(candle[0] / 1000),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
    } catch (e) {
      this.logger.error(`Coinbase: backfill error for ${symbol} ${period}: ${String(e)}`);
      return [];
    }
  }

  async autoBackfillGaps(symbol, period) {
    try {
      // Get latest candle from database
      const lastCandle = await this.candleImporter.getLastCandleForSymbol(this.getName(), symbol, period);
      
      if (!lastCandle) {
        // No data in DB, backfill initial dataset
        const daysToBackfill = period === '1h' ? 10 : 3;
        this.logger.info(`Coinbase: No historical data for ${symbol} ${period}, backfilling ${daysToBackfill} days...`);
        
        const start = moment().subtract(daysToBackfill, 'days');
        const candles = await this.backfill(symbol, period, start);
        
        if (candles.length > 0) {
          const exchangeCandlesticks = candles.map(candle => {
            return ExchangeCandlestick.createFromCandle(this.getName(), symbol, period, candle);
          });
          await this.candleImporter.insertCandles(exchangeCandlesticks);
          this.logger.info(`Coinbase: Backfilled ${candles.length} candles for ${symbol} ${period}`);
        }
        return;
      }

      // Calculate gap between last candle and now
      const lastCandleTime = moment.unix(lastCandle.time);
      const now = moment();
      const hoursDiff = now.diff(lastCandleTime, 'hours');
      
      // If gap is > 2 hours, backfill it
      if (hoursDiff > 2) {
        const daysToBackfill = Math.ceil(hoursDiff / 24) + 1; // Add 1 day buffer
        this.logger.info(`Coinbase: Gap detected for ${symbol} ${period} (${hoursDiff}h), backfilling ${daysToBackfill} days...`);
        
        const candles = await this.backfill(symbol, period, lastCandleTime);
        
        if (candles.length > 0) {
          const exchangeCandlesticks = candles.map(candle => {
            return ExchangeCandlestick.createFromCandle(this.getName(), symbol, period, candle);
          });
          await this.candleImporter.insertCandles(exchangeCandlesticks);
          this.logger.info(`Coinbase: Backfilled ${candles.length} candles to close gap for ${symbol} ${period}`);
        }
      } else {
        this.logger.info(`Coinbase: Data up to date for ${symbol} ${period} (last: ${lastCandleTime.fromNow()})`);
      }
    } catch (e) {
      this.logger.error(`Coinbase: Auto-backfill error for ${symbol} ${period}: ${String(e)}`);
    }
  }

  isInverseSymbol(symbol) {
    return false;
  }

  toCcxtSymbol(botSymbol) {
    if (!botSymbol) {
      return botSymbol;
    }

    if (this.symbolMapBotToCcxt[botSymbol]) {
      return this.symbolMapBotToCcxt[botSymbol];
    }

    // Most historic configs used "BTC-USD".
    if (botSymbol.includes('/')) {
      return botSymbol;
    }

    if (botSymbol.includes('-')) {
      return botSymbol.replace('-', '/');
    }

    return botSymbol;
  }

  fromCcxtSymbol(ccxtSymbol) {
    if (!ccxtSymbol) {
      return ccxtSymbol;
    }

    if (this.symbolMapCcxtToBot[ccxtSymbol]) {
      return this.symbolMapCcxtToBot[ccxtSymbol];
    }

    return ccxtSymbol.replace('/', '-');
  }

  createCcxtProxy(ccxtClient) {
    const me = this;

    return new Proxy(ccxtClient, {
      get(target, prop) {
        if (prop === 'createOrder') {
          return async (symbol, type, side, amount, price = undefined, params = undefined) => {
            return target.createOrder(me.toCcxtSymbol(symbol), type, side, amount, price, params);
          };
        }

        if (prop === 'cancelOrder') {
          return async (id, symbol, params = undefined) => {
            return target.cancelOrder(id, me.toCcxtSymbol(symbol), params);
          };
        }

        if (prop === 'fetchOpenOrders') {
          return async (symbol = undefined, since = undefined, limit = undefined, params = undefined) => {
            const result = await target.fetchOpenOrders(
              symbol ? me.toCcxtSymbol(symbol) : undefined,
              since,
              limit,
              params
            );

            if (Array.isArray(result)) {
              result.forEach(o => {
                if (o && o.symbol) {
                  o.symbol = me.fromCcxtSymbol(o.symbol);
                }
              });
            }

            return result;
          };
        }

        if (prop === 'fetchTicker') {
          return async (symbol, params = undefined) => {
            return target.fetchTicker(me.toCcxtSymbol(symbol), params);
          };
        }

        if (prop === 'fetchOHLCV') {
          return async (symbol, timeframe = '1m', since = undefined, limit = undefined, params = undefined) => {
            return target.fetchOHLCV(me.toCcxtSymbol(symbol), timeframe, since, limit, params);
          };
        }

        if (prop === 'fetchMyTrades') {
          return async (symbol, since = undefined, limit = undefined, params = undefined) => {
            return target.fetchMyTrades(me.toCcxtSymbol(symbol), since, limit, params);
          };
        }

        if (prop === 'market') {
          return symbol => {
            return target.market(me.toCcxtSymbol(symbol));
          };
        }

        if (prop === 'amountToPrecision') {
          return (symbol, amount) => {
            return target.amountToPrecision(me.toCcxtSymbol(symbol), amount);
          };
        }

        if (prop === 'priceToPrecision') {
          return (symbol, price) => {
            return target.priceToPrecision(me.toCcxtSymbol(symbol), price);
          };
        }

        return Reflect.get(target, prop);
      }
    });
  }

  start(config, symbols) {
    this.symbols = symbols;
    this.tickers = {};
    this.fills = {};
    this.balances = [];
    this.exchangePairs = {};
    this.intervals = [];

    this.symbolMapBotToCcxt = {};
    this.symbolMapCcxtToBot = {};

    symbols.forEach(s => {
      const botSymbol = s.symbol;
      const ccxtSymbol = this.toCcxtSymbol(botSymbol);
      this.symbolMapBotToCcxt[botSymbol] = ccxtSymbol;
      this.symbolMapCcxtToBot[ccxtSymbol] = botSymbol;
    });

    const apiKey = config.apiKey || config.key;
    const secret = config.apiSecret || config.secret;

    const clientRaw = (this.ccxtClientRaw = new ccxt.coinbase({
      apiKey: apiKey,
      secret: secret,
      enableRateLimit: true,
      options: { warnOnFetchOpenOrdersWithoutSymbol: false }
    }));

    this.ccxtClient = this.createCcxtProxy(clientRaw);
    this.ccxtExchangeOrder = new CcxtExchangeOrder(this.ccxtClient, symbols, this.logger, {
      convertOrder: (ccxtClient, ccxtOrder) => {
        if (ccxtOrder && ccxtOrder.symbol) {
          ccxtOrder.symbol = this.fromCcxtSymbol(ccxtOrder.symbol);
        }
      },
      cancelOrder: (ccxtClient, args) => {
        // args.symbol in our orderbag is bot format; convert to ccxt format for cancel.
        return {
          symbol: this.toCcxtSymbol(args.symbol)
        };
      }
    });

    const me = this;

    // Load markets/pair info (used for precision + min sizes).
    this.queue.add(async () => {
      try {
        await me.ccxtClient.loadMarkets();
        await me.syncPairInfo();
      } catch (e) {
        me.logger.error(`Coinbase: market load error: ${String(e)}`);
      }
    });

    // Always start public ticker polling so strategies can run.
    const tickerInterval = setInterval(() => {
      me.queue.add(async () => {
        await me.syncTickers();
      });
    }, 1000 * 10);
    this.intervals.push(tickerInterval);

    // Auto-detect gaps and backfill missing data for each configured timeframe.
    symbols.forEach(symbol => {
      symbol.periods.forEach(period => {
        me.queue.add(async () => {
          await me.autoBackfillGaps(symbol.symbol, period);
        });
      });
    });

    // Initial candles prefill for each configured timeframe.
    symbols.forEach(symbol => {
      symbol.periods.forEach(period => {
        me.queue.add(async () => {
          let ohlcvs;
          try {
            ohlcvs = await me.ccxtClient.fetchOHLCV(symbol.symbol, period, undefined, 500);
          } catch (e) {
            me.logger.info(`Coinbase: candles fetch error: ${JSON.stringify([symbol.symbol, period, String(e)])}`);
            return;
          }

          const ourCandles = ohlcvs.map(candle => {
            return new ExchangeCandlestick(
              me.getName(),
              symbol.symbol,
              period,
              Math.round(candle[0] / 1000),
              candle[1],
              candle[2],
              candle[3],
              candle[4],
              candle[5]
            );
          });

          await me.candleImporter.insertThrottledCandles(ourCandles);
        });
      });
    });

    // If we have keys, enable periodic balance/trade/order sync.
    if (apiKey && secret && apiKey.length > 0 && secret.length > 0) {
      const orderInterval = setInterval(() => {
        me.queue.add(async () => {
          await me.ccxtExchangeOrder.syncOrders();
        });
      }, 1000 * 30);
      this.intervals.push(orderInterval);

      const balanceInterval = setInterval(() => {
        me.queue.add(async () => {
          await me.syncBalances();
        });
      }, 1000 * 45);
      this.intervals.push(balanceInterval);

      const fillsInterval = setInterval(() => {
        me.queue.add(async () => {
          await me.syncFills();
        });
      }, 1000 * 90);
      this.intervals.push(fillsInterval);

      // Kick initial sync quickly.
      this.queue.add(async () => {
        await me.syncBalances();
        await me.ccxtExchangeOrder.syncOrders();
        await me.syncFills();
      });
    } else {
      me.logger.info('Coinbase: Starting as anonymous; no trading possible');
    }
  }

  async syncTickers() {
    const me = this;

    for (const symbol of this.symbols) {
      const botSymbol = symbol.symbol;

      let ticker;
      try {
        ticker = await this.ccxtClient.fetchTicker(botSymbol);
      } catch (e) {
        me.logger.debug(`Coinbase: ticker fetch error: ${JSON.stringify([botSymbol, String(e)])}`);
        continue;
      }

      const bid = ticker && ticker.bid ? ticker.bid : ticker && ticker.last ? ticker.last : undefined;
      const ask = ticker && ticker.ask ? ticker.ask : ticker && ticker.last ? ticker.last : undefined;

      if (!bid || !ask) {
        continue;
      }

      const t = (me.tickers[botSymbol] = new Ticker(me.getName(), botSymbol, moment().format('X'), bid, ask));

      me.eventEmitter.emit('ticker', new TickerEvent(me.getName(), botSymbol, t));
    }
  }

  async syncBalances() {
    let balance;
    try {
      balance = await this.ccxtClient.fetchBalance();
    } catch (e) {
      this.logger.error(`Coinbase: balances ${String(e)}`);
      return;
    }

    if (!balance) {
      return;
    }

    const balances = [];

    if (balance.total && typeof balance.total === 'object') {
      Object.keys(balance.total).forEach(currency => {
        const total = balance.total[currency];
        if (!total || total <= 0) {
          return;
        }

        balances.push({
          currency: currency,
          balance: total
        });
      });
    }

    this.balances = balances;
  }

  async syncFills() {
    for (const symbol of this.symbols) {
      const botSymbol = symbol.symbol;

      let trades;
      try {
        trades = await this.ccxtClient.fetchMyTrades(botSymbol, undefined, 200);
      } catch (e) {
        this.logger.debug(`Coinbase: trades fetch error: ${JSON.stringify([botSymbol, String(e)])}`);
        continue;
      }

      if (!Array.isArray(trades)) {
        continue;
      }

      // Sort newest-first.
      trades.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      this.fills[botSymbol] = trades.map(t => {
        return {
          created_at: new Date(t.timestamp || Date.now()).toISOString(),
          product_id: botSymbol,
          price: String(t.price),
          size: String(t.amount),
          fee: String((t.fee && t.fee.cost) || 0),
          side: t.side
        };
      });
    }
  }

  async syncPairInfo() {
    const exchangePairs = {};

    for (const symbol of this.symbols) {
      const botSymbol = symbol.symbol;

      let market;
      try {
        market = this.ccxtClient.market(botSymbol);
      } catch (e) {
        continue;
      }

      if (!market) {
        continue;
      }

      const info = market.info || {};

      // Coinbase "info" may include quote_increment/base_min_size (or similar).
      let tickSize = parseFloat(info.quote_increment || info.price_increment);
      let lotSize = parseFloat(info.base_min_size || (market.limits && market.limits.amount && market.limits.amount.min));

      if (!tickSize && market.precision && typeof market.precision.price === 'number') {
        tickSize = 1 / Math.pow(10, market.precision.price);
      }

      if (!lotSize && market.precision && typeof market.precision.amount === 'number') {
        lotSize = 1 / Math.pow(10, market.precision.amount);
      }

      exchangePairs[botSymbol] = {
        tick_size: tickSize,
        lot_size: lotSize
      };
    }

    this.exchangePairs = exchangePairs;
  }

  calculatePrice(price, symbol) {
    if (!this.ccxtClient) {
      return price;
    }

    try {
      return parseFloat(this.ccxtClient.priceToPrecision(symbol, price));
    } catch (e) {
      return price;
    }
  }

  calculateAmount(amount, symbol) {
    if (!this.ccxtClient) {
      return amount;
    }

    try {
      return parseFloat(this.ccxtClient.amountToPrecision(symbol, amount));
    } catch (e) {
      return amount;
    }
  }

  async getOrders() {
    return this.ccxtExchangeOrder.getOrders();
  }

  async findOrderById(id) {
    return this.ccxtExchangeOrder.findOrderById(id);
  }

  async getOrdersForSymbol(symbol) {
    return this.ccxtExchangeOrder.getOrdersForSymbol(symbol);
  }

  async order(order) {
    return this.ccxtExchangeOrder.createOrder(order);
  }

  async cancelOrder(id) {
    const result = this.ccxtExchangeOrder.cancelOrder(id);
    await this.ccxtExchangeOrder.syncOrders();
    return result;
  }

  async cancelAll(symbol) {
    const result = this.ccxtExchangeOrder.cancelAll(symbol);
    await this.ccxtExchangeOrder.syncOrders();
    return result;
  }

  async updateOrder(id, order) {
    const result = this.ccxtExchangeOrder.updateOrder(id, order);
    await this.ccxtExchangeOrder.syncOrders();
    return result;
  }

  async getPositions() {
    const capitals = {};
    this.symbols
      .filter(
        s =>
          s.trade &&
          ((s.trade.capital && s.trade.capital > 0) || (s.trade.currency_capital && s.trade.currency_capital > 0))
      )
      .forEach(s => {
        if (s.trade.capital > 0) {
          capitals[s.symbol] = s.trade.capital;
        } else if (s.trade.currency_capital > 0 && this.tickers[s.symbol] && this.tickers[s.symbol].bid) {
          capitals[s.symbol] = s.trade.currency_capital / this.tickers[s.symbol].bid;
        }
      });

    const positions = [];

    for (const balance of this.balances) {
      const asset = balance.currency;

      for (const pair in capitals) {
        if (!pair.startsWith(asset)) {
          continue;
        }

        const capital = capitals[pair];
        const balanceUsed = parseFloat(balance.balance);

        // 1% balance left indicate open position
        if (Math.abs(balanceUsed / capital) <= 0.1) {
          continue;
        }

        // coin dust: which is smaller then the allowed order size should not be shown
        const exchangePairInfo = this.exchangePairs[pair];
        if (exchangePairInfo && exchangePairInfo.lot_size && balanceUsed < exchangePairInfo.lot_size) {
          continue;
        }

        let entry;
        let createdAt = new Date();
        let profit;

        // try to find a entry price, based on trade history
        if (this.fills[pair] && this.fills[pair][0]) {
          const result = Coinbase.calculateEntryOnFills(this.fills[pair], balanceUsed);
          if (result) {
            createdAt = new Date(result.created_at);
            entry = result.average_price;

            // calculate profit based on the ticket price
            if (this.tickers[pair] && this.tickers[pair].bid) {
              profit = (this.tickers[pair].bid / result.average_price - 1) * 100;
            }
          }
        }

        positions.push(new Position(pair, 'long', balanceUsed, profit, new Date(), entry, createdAt));
      }
    }

    return positions;
  }

  async getPositionForSymbol(symbol) {
    return (await this.getPositions()).find(position => {
      return position.symbol === symbol;
    });
  }

  static calculateEntryOnFills(fills, balance = undefined) {
    const result = {
      size: 0,
      costs: 0
    };

    const maxBalanceWindow = balance ? balance * 1.15 : undefined;

    for (const fill of fills) {
      // stop if last fill is a sell
      if (fill.side !== 'buy') {
        break;
      }

      // stop if price out of range window
      const number = result.size + parseFloat(fill.size);
      if (maxBalanceWindow && number > maxBalanceWindow) {
        break;
      }

      // stop on old fills
      if (result.created_at) {
        const secDiff = Math.abs(new Date(fill.created_at).getTime() - new Date(result.created_at).getTime());

        // out of 7 day range
        if (secDiff > 60 * 60 * 24 * 7 * 1000) {
          break;
        }
      }

      result.size += parseFloat(fill.size);
      result.costs += parseFloat(fill.size) * parseFloat(fill.price) + parseFloat(fill.fee || 0);

      result.created_at = fill.created_at;
    }

    result.average_price = result.costs / result.size;

    if (result.size === 0 || result.costs === 0) {
      return undefined;
    }

    return result;
  }

  getTradableBalance() {
    // Used only for balance_percent configs. Default to USD if present.
    const usd = this.balances.find(b => b.currency === 'USD');
    return usd ? parseFloat(usd.balance) : undefined;
  }
};
