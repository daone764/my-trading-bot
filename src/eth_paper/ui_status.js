const fs = require('fs');
const path = require('path');
const cronParser = require('cron-parser');

const CcxtTrader = require('./ccxt_trader');

const coinbaseBalanceCache = {
  fetchedAtMs: 0,
  ttlMs: 30 * 1000,
  value: null,
  error: null,
  fetchedAtIso: null
};

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function tailFile(filePath, maxBytes = 64 * 1024) {
  try {
    if (!fs.existsSync(filePath)) {
      return '';
    }
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const len = stat.size - start;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch (e) {
    return '';
  }
}

function parseDotEnv(raw) {
  const map = {};
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    // Strip surrounding quotes.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function toBool(v) {
  if (v === null || typeof v === 'undefined') return null;
  return String(v).trim().toLowerCase() === 'true';
}

function toNum(v) {
  if (v === null || typeof v === 'undefined' || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseFeeRate(v) {
  const n = toNum(v);
  if (n === null) return null;
  // Accept either fraction (0.006) or percent (0.5 meaning 0.5%).
  if (n > 0.2) return n / 100;
  return n;
}

function readEnvSnapshot(projectDir, envFile = '.env') {
  try {
    const envPath = path.join(projectDir, envFile);
    if (!fs.existsSync(envPath)) {
      return {
        envPath,
        present: false,
        flags: { paperTrading: null, enableLiveTrading: null, mode: 'UNKNOWN', showCoinbaseBalances: null },
        credentials: { coinbase: { present: null } },
        config: {}
      };
    }

    const raw = fs.readFileSync(envPath, 'utf8');
    const env = parseDotEnv(raw);

    const paperTrading = toBool(env.PAPER_TRADING);
    const enableLiveTrading = toBool(env.ENABLE_LIVE_TRADING);
    const mode = paperTrading === false && enableLiveTrading === true ? 'LIVE' : 'PAPER';

    const showCoinbaseBalances = toBool(env.SHOW_COINBASE_BALANCES);
    const hasCoinbaseCreds = Boolean(env.COINBASE_API_KEY && env.COINBASE_API_SECRET);

    const config = {
      pair: env.PAIR_WHITELIST || 'ETH/USD',
      scheduleCron: env.SCHEDULE_CRON || '*/15 * * * *',
      totalCapitalUsd: toNum(env.TOTAL_CAPITAL_USD),
      stakeAmountUsd: toNum(env.STAKE_AMOUNT_USD),
      minOrderUsd: toNum(env.MIN_ORDER_USD),
      minUsdBalance: toNum(env.MIN_USD_BALANCE),
      emaShort: toNum(env.EMA_SHORT),
      emaLong: toNum(env.EMA_LONG),
      rsiOversold: toNum(env.RSI_OVERSOLD),
      rsiOverbought: toNum(env.RSI_OVERBOUGHT),
      stopLossPercent: toNum(env.STOP_LOSS_PERCENT),
      takeProfitPercent: toNum(env.TAKE_PROFIT_PERCENT),
      trailingStopPercent: toNum(env.TRAILING_STOP_PERCENT),
      feeRate: parseFeeRate(env.FEE_RATE),
      exchange: env.EXCHANGE || 'coinbase',
      orderType: env.ORDER_TYPE || 'market',
      tradingMode: env.TRADING_MODE || 'spot',
      weeklySummary: toBool(env.WEEKLY_SUMMARY),
      dryRunVerbose: toBool(env.DRY_RUN_VERBOSE)
    };

    // Safety: do NOT include any API keys/secrets.
    return {
      envPath,
      present: true,
      flags: { paperTrading, enableLiveTrading, mode, showCoinbaseBalances },
      credentials: { coinbase: { present: hasCoinbaseCreds } },
      config
    };
  } catch (e) {
    return {
      envPath: path.join(projectDir, envFile),
      present: null,
      flags: { paperTrading: null, enableLiveTrading: null, mode: 'UNKNOWN', showCoinbaseBalances: null },
      credentials: { coinbase: { present: null } },
      config: {}
    };
  }
}

function pctToFrac(pct) {
  if (pct === null || typeof pct === 'undefined') return null;
  return Number(pct) / 100;
}

function computeTradeStats(tradeHistory = []) {
  const sells = tradeHistory.filter(t => t.action === 'SELL');
  const pnls = sells.map(s => Number(s.pnlUsd || 0));
  const totalTrades = sells.length;

  const wins = pnls.filter(p => p > 0).length;
  const losses = pnls.filter(p => p < 0).length;
  const breakeven = pnls.filter(p => p === 0).length;
  const realizedPnlUsd = pnls.reduce((a, b) => a + b, 0);
  const avgPnlUsd = totalTrades ? realizedPnlUsd / totalTrades : 0;

  const bestPnlUsd = totalTrades ? Math.max(...pnls) : 0;
  const worstPnlUsd = totalTrades ? Math.min(...pnls) : 0;

  const feesPaidUsd = tradeHistory.reduce((acc, t) => acc + Number(t.feeUsd || 0), 0);

  return {
    sells: totalTrades,
    wins,
    losses,
    breakeven,
    winRate: totalTrades ? wins / totalTrades : null,
    realizedPnlUsd,
    avgPnlUsd,
    bestPnlUsd,
    worstPnlUsd,
    feesPaidUsd
  };
}

function computePositionRisk(openPosition, price, cfg) {
  if (!openPosition || price === null || typeof price === 'undefined') {
    return null;
  }

  const stopLossFrac = pctToFrac(cfg.stopLossPercent);
  const takeProfitFrac = pctToFrac(cfg.takeProfitPercent);
  const trailingFrac = pctToFrac(cfg.trailingStopPercent);

  const entry = Number(openPosition.entryPrice);
  const peak = Number(openPosition.peakPrice || openPosition.entryPrice);

  const stopLossPrice = stopLossFrac === null ? null : entry * (1 - stopLossFrac);
  const takeProfitPrice = takeProfitFrac === null ? null : entry * (1 + takeProfitFrac);
  const trailingStopPrice = trailingFrac === null ? null : peak * (1 - trailingFrac);

  const qtyEth = Number(openPosition.qtyEth);
  const grossValueUsd = qtyEth * Number(price);

  const costUsd = Number(openPosition.costUsd || 0);
  const entryFeeUsd = Number(openPosition.feeUsd || 0);
  const unrealizedPnlUsd = grossValueUsd - costUsd - entryFeeUsd;
  const unrealizedPnlPct = costUsd ? unrealizedPnlUsd / costUsd : null;

  return {
    stopLossPrice,
    takeProfitPrice,
    trailingStopPrice,
    grossValueUsd,
    unrealizedPnlUsd,
    unrealizedPnlPct
  };
}

function computeNextRunAt(scheduleCron) {
  try {
    let expr = null;
    if (typeof cronParser.parseExpression === 'function') {
      expr = cronParser.parseExpression(scheduleCron, { currentDate: new Date() });
    } else if (cronParser.CronExpressionParser?.parse) {
      expr = cronParser.CronExpressionParser.parse(scheduleCron, { currentDate: new Date() });
    }

    return expr ? expr.next().toISOString() : null;
  } catch (e) {
    return null;
  }
}

function buildStatus({ projectDir, envFile, statePath, logPath, maxLogBytes } = {}) {
  const resolvedProjectDir = projectDir || process.cwd();

  const defaultStatePath = path.join(resolvedProjectDir, 'var', 'eth_paper_state.json');
  const defaultLogPath = path.join(resolvedProjectDir, 'logs', 'eth_trades.log');

  const env = readEnvSnapshot(resolvedProjectDir, envFile);
  const state = safeReadJson(statePath || defaultStatePath);

  const lastPrice = state?.lastTick?.close ?? state?.lastTick?.lastClose ?? null;
  const price = lastPrice !== null ? Number(lastPrice) : null;

  const tradeStats = computeTradeStats(state?.tradeHistory || []);
  const open = state?.openPosition || null;
  const positionRisk = computePositionRisk(open, price, env.config || {});

  const equityUsd = state && price !== null ? Number(state.wallet.usd || 0) + Number(state.wallet.eth || 0) * price : null;

  const unrealizedPnlUsd = open && price !== null ? Number(open.qtyEth || 0) * price - Number(open.costUsd || 0) - Number(open.feeUsd || 0) : null;

  const health = (() => {
    const lastTickAt = state?.lastTick?.at || null;
    if (!lastTickAt) return { lastTickAt: null, secondsSinceLastTick: null, stale: null };
    const ageSec = Math.round((Date.now() - Date.parse(lastTickAt)) / 1000);
    return {
      lastTickAt,
      secondsSinceLastTick: Number.isFinite(ageSec) ? ageSec : null,
      stale: Number.isFinite(ageSec) ? ageSec > 60 * 20 : null
    };
  })();

  const scheduleCron = env.config?.scheduleCron || '*/15 * * * *';

  const recentTrades = (state?.tradeHistory || []).slice(-10).reverse();

  return {
    now: new Date().toISOString(),
    flags: env.flags,
    env: {
      present: env.present,
      envPath: env.envPath,
      credentials: env.credentials,
      config: env.config,
      nextRunAt: computeNextRunAt(scheduleCron)
    },
    health,
    state,
    derived: {
      price,
      walletSource: env.flags?.mode === 'LIVE' ? 'COINBASE_ACCOUNT' : 'PAPER_STATE',
      equityUsd,
      unrealizedPnlUsd,
      tradeStats,
      positionRisk,
      recentTrades
    },
    files: {
      statePath: statePath || defaultStatePath,
      logPath: logPath || defaultLogPath
    },
    logTail: tailFile(logPath || defaultLogPath, maxLogBytes)
  };
}

async function maybeFetchCoinbaseBalances({ projectDir, envSnapshot, envFile } = {}) {
  // Default behavior: if credentials exist, show balances automatically.
  // Allow an explicit opt-out via SHOW_COINBASE_BALANCES=false.
  const show = envSnapshot?.flags?.showCoinbaseBalances !== false;
  const hasCreds = envSnapshot?.credentials?.coinbase?.present === true;

  if (!show || !hasCreds) {
    return null;
  }

  const nowMs = Date.now();
  if (coinbaseBalanceCache.value && nowMs - coinbaseBalanceCache.fetchedAtMs < coinbaseBalanceCache.ttlMs) {
    if (coinbaseBalanceCache.error) {
      return { fetchedAt: coinbaseBalanceCache.fetchedAtIso, error: coinbaseBalanceCache.error };
    }
    return { fetchedAt: coinbaseBalanceCache.fetchedAtIso, free: coinbaseBalanceCache.value };
  }

  // Re-read .env to get credentials without returning them.
  const envPath = path.join(projectDir || process.cwd(), envFile || '.env');
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const env = parseDotEnv(raw);

  const fetchedAtIso = new Date().toISOString();
  try {
    const trader = new CcxtTrader('coinbase', {
      apiKey: env.COINBASE_API_KEY,
      secret: env.COINBASE_API_SECRET,
      password: env.COINBASE_API_PASSWORD
    });

    const balances = await trader.fetchFreeBalances();

    coinbaseBalanceCache.fetchedAtMs = nowMs;
    coinbaseBalanceCache.fetchedAtIso = fetchedAtIso;
    coinbaseBalanceCache.value = balances;
    coinbaseBalanceCache.error = null;

    return { fetchedAt: fetchedAtIso, free: balances };
  } catch (e) {
    coinbaseBalanceCache.fetchedAtMs = nowMs;
    coinbaseBalanceCache.fetchedAtIso = fetchedAtIso;
    coinbaseBalanceCache.value = null;
    coinbaseBalanceCache.error = e?.message || String(e);

    return { fetchedAt: fetchedAtIso, error: coinbaseBalanceCache.error };
  }
}

async function buildStatusAsync({ projectDir, envFile, statePath, logPath, maxLogBytes } = {}) {
  const resolvedProjectDir = projectDir || process.cwd();
  const status = buildStatus({ projectDir: resolvedProjectDir, envFile, statePath, logPath, maxLogBytes });

  const envSnapshot = {
    flags: status.flags,
    credentials: status.env?.credentials
  };

  const coinbaseBalances = await maybeFetchCoinbaseBalances({ projectDir: resolvedProjectDir, envSnapshot, envFile });
  if (coinbaseBalances) {
    status.derived.coinbaseBalances = coinbaseBalances;
  }

  return status;
}

module.exports = {
  buildStatus,
  buildStatusAsync
};
