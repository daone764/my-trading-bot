// Backtest for CCI strategy
// Run: node test/backtest/cci_backtest.js

const fs = require('fs');
const CCI = require('../../src/modules/strategy/strategies/cci');
const IndicatorPeriod = require('../../src/modules/strategy/dict/indicator_period');
const IndicatorBuilder = require('../../src/modules/strategy/dict/indicator_builder');
const Indicators = require('../../src/utils/indicators');

const STRAT_NAME = 'cci';

function main() {
  // Load real candle data from fixture
  const fixtureData = JSON.parse(fs.readFileSync(`${__dirname}/../utils/fixtures/xbt-usd-5m.json`, 'utf8'));
  const candles = fixtureData.map(c => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));

  console.log(`Loaded ${candles.length} candles for backtesting\n`);

  const backtest = runBacktest(candles);
  report('CCI Strategy Backtest', backtest);
}

function runBacktest(candles) {
  const strategy = new CCI();
  const stats = initStats();
  let lastSignal = undefined;
  let openTrade = null;
  const equity = [1];
  const trades = [];

  // Build indicators using strategy's configuration
  const builder = new IndicatorBuilder();
  strategy.buildIndicator(builder, strategy.getOptions());

  // Calculate all indicator values using strategy options
  const opts = strategy.getOptions();
  console.log(`Strategy options: ${JSON.stringify(opts)}\n`);

  // Calculate CCI and EMA200 for all candles
  const cciValues = calculateCCI(candles, opts.period);
  const emaValues = calculateEMA(candles, 200);

  console.log(`Indicators calculated. CCI: ${cciValues.length}, EMA200: ${emaValues.length}\n`);

  // Start backtesting after we have enough history (200+ candles for EMA + 20 for CCI)
  const startIdx = 250; // Safe start after all indicators initialized
  console.log(`Starting backtest at candle ${startIdx}\n`);

  let signals = { long: 0, short: 0, close: 0, empty: 0 };
  let debugCount = 0;
  let maxCCI = -Infinity, minCCI = Infinity;

  for (let t = startIdx; t < candles.length; t++) {
    const candle = candles[t];
    
    // Get indicator values - must include enough lookback
    const cciSlice = cciValues.slice(Math.max(0, t - 20), t + 1);
    const emaSlice = emaValues.slice(Math.max(0, t - 20), t + 1);
    
    // Both must be valid and have enough data
    if (!cciSlice || cciSlice.some(v => v === undefined) || cciSlice.length < 11) {
      continue;
    }
    if (!emaSlice || emaSlice.some(v => v === undefined) || emaSlice.length < 2) {
      continue;
    }
    
    // Track CCI range
    cciSlice.forEach(v => {
      if (v < minCCI) minCCI = v;
      if (v > maxCCI) maxCCI = v;
    });
    
    // Build indicator period mock
    const mockContext = {
      bid: candle.close,
      getLastSignal: () => lastSignal,
      getProfit: () => 0,
      getLookbacks: () => candles.slice(Math.max(0, t - 100), t + 1)
    };

    const indicatorMap = {
      cci: cciSlice,
      ema200: emaSlice
    };

    // Debug first iteration
    if (debugCount === 0) {
      console.log(`Debug at candle ${t}:`);
      console.log(`  CCI slice length: ${cciSlice.length}`);
      console.log(`  EMA200 slice length: ${emaSlice.length}`);
      console.log(`  CCI values (last 5): ${cciSlice.slice(-5).map(v => typeof v === 'number' ? v.toFixed(1) : 'undefined')}`);
      console.log(`  EMA200 values (last 5): ${emaSlice.slice(-5).map(v => typeof v === 'number' ? v.toFixed(1) : 'undefined')}`);
      console.log(`  Current price: ${candle.close.toFixed(2)}\n`);
      debugCount++;
    }

    const indicatorPeriod = new IndicatorPeriod(mockContext, indicatorMap);
    const signal = strategy.period(indicatorPeriod);

    if (!signal) {
      signals.empty++;
      continue;
    }

    const signalType = signal.getSignal();
    if (!signalType) {
      signals.empty++;
      continue;
    }

    signals[signalType] = (signals[signalType] || 0) + 1;

    // Process entry signals
    if (!openTrade && (signalType === 'long' || signalType === 'short')) {
      openTrade = {
        side: signalType,
        entry: candle.close,
        time: candle.time
      };
      lastSignal = signalType;
      stats.entries += 1;
    }
    // Process exit signals
    else if (openTrade && signalType === 'close') {
      const ret = openTrade.side === 'long'
        ? (candle.close - openTrade.entry) / openTrade.entry
        : (openTrade.entry - candle.close) / openTrade.entry;
      
      stats.trades += 1;
      if (ret > 0) stats.wins += 1; else stats.losses += 1;
      stats.returns.push(ret);
      equity.push(equity[equity.length - 1] * (1 + ret));
      
      trades.push({
        side: openTrade.side,
        entry: openTrade.entry.toFixed(2),
        exit: candle.close.toFixed(2),
        return: (ret * 100).toFixed(2) + '%'
      });

      openTrade = null;
      lastSignal = undefined;
    }
  }

  console.log(`\nSignal Summary:`);
  console.log(`  Long signals: ${signals.long}`);
  console.log(`  Short signals: ${signals.short}`);
  console.log(`  Close signals: ${signals.close}`);
  console.log(`  Empty signals: ${signals.empty}`);
  console.log(`  CCI range: ${minCCI.toFixed(2)} to ${maxCCI.toFixed(2)}\n`);

  // Close any open trade at end of data
  if (openTrade && equity.length > 1) {
    const lastCandle = candles[candles.length - 1];
    const ret = openTrade.side === 'long'
      ? (lastCandle.close - openTrade.entry) / openTrade.entry
      : (openTrade.entry - lastCandle.close) / openTrade.entry;
    stats.trades += 1;
    if (ret > 0) stats.wins += 1; else stats.losses += 1;
    stats.returns.push(ret);
    equity.push(equity[equity.length - 1] * (1 + ret));
  }

  // Calculate total return
  const finalEquity = equity[equity.length - 1];
  stats.totalReturn = (finalEquity - 1) * 100;
  stats.winRate = stats.trades > 0 ? (stats.wins / stats.trades * 100).toFixed(1) : 0;
  stats.maxDD = calculateMaxDD(equity);
  stats.sharpe = calculateSharpe(stats.returns);

  return { stats, trades };
}

// Simple CCI calculation
function calculateCCI(candles, period = '15m') {
  const length = 20; // CCI period
  const result = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < length) {
      result.push(undefined);
      continue;
    }
    
    const lookback = candles.slice(i - length + 1, i + 1);
    const typicalPrices = lookback.map(c => (c.high + c.low + c.close) / 3);
    const sma = typicalPrices.reduce((a, b) => a + b) / typicalPrices.length;
    const mad = typicalPrices.reduce((a, b) => a + Math.abs(b - sma), 0) / typicalPrices.length;
    
    const cci = mad === 0 ? 0 : (typicalPrices[typicalPrices.length - 1] - sma) / (0.015 * mad);
    result.push(cci);
  }
  
  return result;
}

// Simple EMA calculation
function calculateEMA(candles, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(candles[0].close);
    } else {
      ema = candles[i].close * k + ema * (1 - k);
      result.push(ema);
    }
  }
  
  return result;
}

function runPaperSim(candles, indicators) {
  const stats = initStats();
  let lastSignal = undefined;
  let openTrade = null;
  let overtrading = false;

  for (let t = 210; t < candles.length; t++) {
    const candle = candles[t];

    if (openTrade) {
      overtrading = true;
    }

    openTrade = null;
    lastSignal = undefined;
  }

  return { ...stats, overtrading };
}

function checkExit(openTrade, candle) {
  // Simple exit: close on opposite signal or after 20 candles
  return { price: candle.close };
}

function initStats() {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    returns: [],
    entries: 0,
    totalReturn: 0,
    winRate: 0,
    maxDD: 0,
    sharpe: 0
  };
}

function calculateMaxDD(equity) {
  let maxDD = 0;
  let peak = equity[0];
  for (let i = 1; i < equity.length; i++) {
    if (equity[i] > peak) {
      peak = equity[i];
    }
    const dd = (peak - equity[i]) / peak;
    if (dd > maxDD) {
      maxDD = dd;
    }
  }
  return maxDD * 100;
}

function calculateSharpe(returns) {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2)) / returns.length;
  const stdDev = Math.sqrt(variance);
  return stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;
}

function report(name, result) {
  const { stats, trades } = result;
  console.log(`${name} Summary:`);
  console.log(
    `  Trades: ${stats.trades}, Win Rate: ${stats.winRate}%, ` +
    `Total Return: ${stats.totalReturn.toFixed(2)}%, Max DD: ${stats.maxDD.toFixed(2)}%, ` +
    `Sharpe: ${stats.sharpe.toFixed(2)}`
  );
  
  if (trades && trades.length > 0) {
    console.log(`\nFirst 10 trades:`);
    trades.slice(0, 10).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.side.toUpperCase()}: Entry=${t.entry}, Exit=${t.exit}, Return=${t.return}`);
    });
  }
  console.log('');
}

main();
