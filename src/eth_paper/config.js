const path = require('path');

function envBool(value, fallback) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
}

function envNum(value, fallback) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return fallback;
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return fallback;
  }
  return n;
}

function envStr(value, fallback) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return fallback;
  }
  return String(value);
}

function envFirst(...values) {
  for (const v of values) {
    if (typeof v !== 'undefined' && v !== null && String(v) !== '') {
      return v;
    }
  }
  return undefined;
}

function parseFeeRate(rawValue, fallbackFraction) {
  const raw = envNum(rawValue, null);
  if (raw === null) {
    return fallbackFraction;
  }

  // Accept either fraction (0.006) or percent (0.5 meaning 0.5%).
  // Heuristic: values > 0.2 are treated as percent.
  if (raw > 0.2) {
    return raw / 100;
  }
  return raw;
}

module.exports = function loadConfig(projectDir) {
  const pair = envStr(process.env.PAIR_WHITELIST, 'ETH/USD');
  const candleTimeframe = envStr(process.env.CANDLE_TIMEFRAME, '15m');

  const scheduleCronDefault = (() => {
    // If user explicitly sets a schedule, honor it.
    if (typeof process.env.SCHEDULE_CRON !== 'undefined' && String(process.env.SCHEDULE_CRON) !== '') {
      return null;
    }

    // Simple heuristic: if timeframe is in minutes (e.g., 1m, 5m, 15m), default the cron to that cadence.
    const m = /^([1-9]\d*)m$/i.exec(String(candleTimeframe).trim());
    if (m) {
      const minutes = Number(m[1]);
      if (minutes === 1) {
        return '* * * * *';
      }
      if (minutes >= 2 && minutes <= 59) {
        return `*/${minutes} * * * *`;
      }
    }

    return '*/15 * * * *';
  })();

  return {
    projectDir,
    pairWhitelist: [pair],
    maxOpenTrades: envNum(process.env.MAX_OPEN_TRADES, 1),

    candleTimeframe,

    totalCapitalUsd: envNum(process.env.TOTAL_CAPITAL_USD, 100),
    stakeAmountUsd: envNum(process.env.STAKE_AMOUNT_USD, 25),
    minOrderUsd: envNum(process.env.MIN_ORDER_USD, 20),
    minUsdBalance: envNum(process.env.MIN_USD_BALANCE, envNum(process.env.TOTAL_CAPITAL_USD, 100)),

    entryStrategy: envStr(process.env.ENTRY_STRATEGY, 'ema_crossover'),
    emaShort: envNum(envFirst(process.env.EMA_SHORT, process.env.EMA_SHORT_PERIOD), 12),
    emaLong: envNum(envFirst(process.env.EMA_LONG, process.env.EMA_LONG_PERIOD), 26),
    rsiOverbought: envNum(process.env.RSI_OVERBOUGHT, 70),
    rsiOversold: envNum(process.env.RSI_OVERSOLD, 30),

    stopLossPercent: envNum(process.env.STOP_LOSS_PERCENT, 12),
    takeProfitPercent: envNum(process.env.TAKE_PROFIT_PERCENT, 20),
    trailingStopPercent: envNum(process.env.TRAILING_STOP_PERCENT, 5),

    scheduleCron: envStr(process.env.SCHEDULE_CRON, scheduleCronDefault || '*/15 * * * *'),

    logLevel: envStr(process.env.LOG_LEVEL, 'info'),
    logFile: envStr(process.env.LOG_FILE, 'logs/eth_trades.log'),
    logConsole: envBool(process.env.LOG_CONSOLE, true),
    weeklySummary: envBool(process.env.WEEKLY_SUMMARY, true),

    exchange: envStr(process.env.EXCHANGE, 'coinbase'),
    orderType: envStr(process.env.ORDER_TYPE, 'market'),
    tradingMode: envStr(process.env.TRADING_MODE, 'spot'),

    paperTrading: envBool(process.env.PAPER_TRADING, true),
    enableLiveTrading: envBool(process.env.ENABLE_LIVE_TRADING, false),
    dryRunVerbose: envBool(process.env.DRY_RUN_VERBOSE, true),

    feeRate: parseFeeRate(process.env.FEE_RATE, 0.006),

    // CCXT credentials (required only when live trading is enabled)
    coinbaseApiKey: envStr(process.env.COINBASE_API_KEY, ''),
    coinbaseApiSecret: envStr(process.env.COINBASE_API_SECRET, ''),
    coinbaseApiPassword: envStr(process.env.COINBASE_API_PASSWORD, ''),

    stateFile: path.isAbsolute(envStr(process.env.STATE_FILE, 'var/eth_paper_state.json'))
      ? envStr(process.env.STATE_FILE, 'var/eth_paper_state.json')
      : path.join(projectDir, envStr(process.env.STATE_FILE, 'var/eth_paper_state.json'))
  };
};
