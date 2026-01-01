const assert = require('assert');
const CandleReversalScored = require('../../var/strategies/candle_reversal_scored');
const IndicatorPeriod = require('../../src/modules/strategy/dict/indicator_period');
const StrategyContext = require('../../src/dict/strategy_context');
const Ticker = require('../../src/dict/ticker');

const MIN_LEN = 211; // enough to survive forming-candle trim

describe('#candle_reversal_scored unit patterns', () => {
  it('detects bullish engulfing', () => {
    const strategy = new CandleReversalScored();
    const candles = sampleCandles();
    const avgBody20 = 1;
    const res = strategy.detectPattern({
      current: bullishEngulfing().current,
      prev: bullishEngulfing().prev,
      prev2: candles[candles.length - 3],
      closed: candles,
      avgBody20
    });
    assert.equal(res.primary.name, 'Bullish Engulfing');
    assert.equal(res.primary.direction, 'bullish');
    assert.equal(res.primary.strength, 40);
  });

  it('detects bearish engulfing', () => {
    const strategy = new CandleReversalScored();
    const res = strategy.detectPattern({
      current: bearishEngulfing().current,
      prev: bearishEngulfing().prev,
      prev2: bearishEngulfing().prev2,
      closed: sampleCandles(),
      avgBody20: 1
    });
    assert.equal(res.primary.name, 'Bearish Engulfing');
    assert.equal(res.primary.direction, 'bearish');
    assert.equal(res.primary.strength, 40);
  });

  it('detects hammer', () => {
    const strategy = new CandleReversalScored();
    const res = strategy.detectPattern({
      current: hammer(),
      prev: sampleCandles()[0],
      prev2: sampleCandles()[1],
      closed: sampleCandles(),
      avgBody20: 1
    });
    assert.equal(res.primary.name, 'Hammer');
    assert.equal(res.primary.direction, 'bullish');
    assert.equal(res.primary.strength, 30);
  });

  it('detects shooting star', () => {
    const strategy = new CandleReversalScored();
    const res = strategy.detectPattern({
      current: shootingStar(),
      prev: sampleCandles()[0],
      prev2: sampleCandles()[1],
      closed: sampleCandles(),
      avgBody20: 1
    });
    assert.equal(res.primary.name, 'Shooting Star');
    assert.equal(res.primary.direction, 'bearish');
    assert.equal(res.primary.strength, 30);
  });

  it('detects morning star with avg body guard', () => {
    const strategy = new CandleReversalScored();
    const pattern = morningStar();
    const res = strategy.detectPattern({
      current: pattern.c0,
      prev: pattern.c1,
      prev2: pattern.c2,
      closed: sampleCandles(),
      avgBody20: 1
    });
    assert.equal(res.primary.name, 'Morning Star');
    assert.equal(res.primary.direction, 'bullish');
    assert.equal(res.primary.strength, 35);
  });

  it('detects evening star with avg body guard', () => {
    const strategy = new CandleReversalScored();
    const pattern = eveningStar();
    const res = strategy.detectPattern({
      current: pattern.c0,
      prev: pattern.c1,
      prev2: pattern.c2,
      closed: sampleCandles(),
      avgBody20: 1
    });
    assert.equal(res.primary.name, 'Evening Star');
    assert.equal(res.primary.direction, 'bearish');
    assert.equal(res.primary.strength, 35);
  });

  it('detects piercing line', () => {
    const strategy = new CandleReversalScored();
    const p = piercingLine();
    const res = strategy.detectPattern({ current: p.c0, prev: p.c1, prev2: p.c2, closed: sampleCandles(), avgBody20: 1 });
    assert.equal(res.primary.name, 'Piercing Line');
    assert.equal(res.primary.direction, 'bullish');
    assert.equal(res.primary.strength, 25);
  });

  it('detects dark cloud cover', () => {
    const strategy = new CandleReversalScored();
    const p = darkCloud();
    const res = strategy.detectPattern({ current: p.c0, prev: p.c1, prev2: p.c2, closed: sampleCandles(), avgBody20: 1 });
    assert.equal(res.primary.name, 'Dark Cloud Cover');
    assert.equal(res.primary.direction, 'bearish');
    assert.equal(res.primary.strength, 25);
  });

  it('returns none when engulfing body too small', () => {
    const strategy = new CandleReversalScored();
    const tiny = bullishEngulfing();
    tiny.current.open = tiny.prev.close - 0.05;
    tiny.current.close = tiny.prev.open + 0.05;
    const res = strategy.detectPattern({
      current: tiny.current,
      prev: tiny.prev,
      prev2: tiny.prev2,
      closed: sampleCandles(),
      avgBody20: 1
    });
    assert.equal(res.primary.name, 'None');
    assert.equal(res.primary.strength, 0);
  });

  it('ignores 3-candle patterns when avg body is zero', () => {
    const strategy = new CandleReversalScored();
    const pattern = morningStar();
    const res = strategy.detectPattern({
      current: pattern.c0,
      prev: pattern.c1,
      prev2: pattern.c2,
      closed: sampleCandles(),
      avgBody20: 0
    });
    assert.equal(res.primary.name, 'None');
  });

  it('handles zero-range candle safely', () => {
    const strategy = new CandleReversalScored();
    const flat = { open: 100, close: 100, high: 100, low: 100 };
    const res = strategy.detectPattern({ current: flat, prev: flat, prev2: flat, closed: sampleCandles(), avgBody20: 1 });
    assert.equal(res.primary.name, 'None');
  });
});

describe('#candle_reversal_scored scoring + integration', () => {
  it('rejects when insufficient candles', async () => {
    const strategy = new CandleReversalScored();
    const shortCandles = buildBase(50, 100);
    const period = makeIndicatorPeriod({ candles: shortCandles, cci: fill(shortCandles.length, 0), sma: fill(shortCandles.length, 100), atr: fill(shortCandles.length, 1) });
    const res = await strategy.period(period, {});
    assert.equal(res.getSignal(), undefined);
    assert.equal(res.getDebug().reason, 'insufficient_candles');
  });

  it('scores and emits long with full components', async () => {
    const { candles, cci, sma, atr } = bullishScenario();
    const period = makeIndicatorPeriod({ candles, cci, sma, atr });
    const strategy = new CandleReversalScored();
    const log = captureLogs();
    const res = await strategy.period(period, {});
    restoreLogs(log.restore);
    assert.equal(res.getSignal(), 'long');
    const dbg = res.getDebug();
    assert.equal(dbg.finalScore, 100);
    assert.equal(dbg.pattern, 'Bullish Engulfing');
    assert.ok(Math.abs(dbg.stopLoss - 97.7) < 1e-9);
    assert.ok(log.messages.some(m => m.includes('entry long')));
  });

  it('rejects when pattern strength below 25', async () => {
    const { candles, cci, sma, atr } = bullishScenario();
    const strategy = new CandleReversalScored();
    const stub = strategy.detectPattern;
    strategy.detectPattern = () => ({ primary: { name: 'Weak', direction: 'bullish', strength: 20 }, all: [] });
    const res = await strategy.period(makeIndicatorPeriod({ candles, cci, sma, atr }), {});
    strategy.detectPattern = stub;
    const dbg = res.getDebug();
    assert.equal(res.getSignal(), undefined);
    assert.equal(dbg.rejection, 'pattern_strength_below_25');
    assert.equal(dbg.finalScore, 0);
  });

  it('rejects when score below 65', async () => {
    const { candles, cci, sma, atr } = bearishLowScore();
    const strategy = new CandleReversalScored();
    const res = await strategy.period(makeIndicatorPeriod({ candles, cci, sma, atr }), { allowShort: true });
    const dbg = res.getDebug();
    assert.equal(res.getSignal(), undefined);
    assert.equal(dbg.rejection, 'score_below_threshold');
    assert.ok(dbg.finalScore < 65);
  });

  it('rejects when position already open', async () => {
    const { candles, cci, sma, atr } = bullishScenario();
    const period = makeIndicatorPeriod({ candles, cci, sma, atr, lastSignal: 'long' });
    const strategy = new CandleReversalScored();
    const res = await strategy.period(period, {});
    assert.equal(res.getSignal(), undefined);
    assert.equal(res.getDebug().reason, 'position_already_open');
  });

  it('emits short when allowed and high scoring bearish pattern', async () => {
    const { candles, cci, sma, atr } = bearishScenario();
    const strategy = new CandleReversalScored();
    const res = await strategy.period(makeIndicatorPeriod({ candles, cci, sma, atr }), { allowShort: true });
    assert.equal(res.getSignal(), 'short');
    const dbg = res.getDebug();
    assert.equal(dbg.pattern, 'Bearish Engulfing');
    assert.equal(dbg.finalScore, 100);
  });

  it('rejects short when disabled even if scoring is high', async () => {
    const { candles, cci, sma, atr } = bearishScenario();
    const strategy = new CandleReversalScored();
    const res = await strategy.period(makeIndicatorPeriod({ candles, cci, sma, atr }), {});
    const dbg = res.getDebug();
    assert.equal(res.getSignal(), undefined);
    assert.equal(dbg.rejection, 'shorting_not_allowed');
    assert.equal(dbg.finalScore, 100);
  });

  it('logs rejection reason', async () => {
    const { candles, cci, sma, atr } = bearishLowScore();
    const strategy = new CandleReversalScored();
    const log = captureLogs();
    await strategy.period(makeIndicatorPeriod({ candles, cci, sma, atr }), { allowShort: true });
    restoreLogs(log.restore);
    assert.ok(log.messages.some(m => m.includes('rejected')));
  });
});

function makeIndicatorPeriod({ candles, cci, sma, atr, lastSignal }) {
  const forming = candles[candles.length - 1];
  const ticker = new Ticker('test', 'TEST-USD', Date.now(), forming.close, forming.close + 0.1);
  const ctx = new StrategyContext({}, ticker);
  ctx.lastSignal = lastSignal;
  return new IndicatorPeriod(ctx, {
    candles_5m: candles,
    cci_14_5m: cci,
    sma200_5m: sma,
    atr14_5m: atr
  });
}

function sampleCandles() {
  return [
    { open: 100, close: 101, high: 101.5, low: 99.5 },
    { open: 101, close: 100.2, high: 101.2, low: 99.8 },
    { open: 99.8, close: 100.1, high: 100.5, low: 99.5 }
  ];
}

function bullishEngulfing() {
  return {
    prev2: { open: 100, close: 100.4, high: 100.8, low: 99.8 },
    prev: { open: 101, close: 99, high: 101.4, low: 98.6 },
    current: { open: 98.8, close: 101.5, high: 102, low: 98.5 }
  };
}

function bearishEngulfing() {
  return {
    prev2: { open: 100.5, close: 101.2, high: 101.6, low: 100.1 },
    prev: { open: 99.5, close: 101, high: 101.5, low: 99.1 },
    current: { open: 101.4, close: 99.2, high: 101.6, low: 99 }
  };
}

function hammer() {
  return { open: 100, close: 100.2, high: 100.22, low: 99.5 };
}

function shootingStar() {
  return { open: 100.2, close: 100, high: 100.72, low: 99.95 };
}

function morningStar() {
  const c2 = { open: 102, close: 100.5, high: 102.5, low: 100.2 }; // long bear body
  const c1 = { open: 100.6, close: 100.8, high: 101, low: 100.4 }; // small
  const c0 = { open: 100.7, close: 102.2, high: 102.5, low: 100.6 }; // closes above midpoint
  return { c2, c1, c0 };
}

function eveningStar() {
  const c2 = { open: 99, close: 100.7, high: 101, low: 98.8 }; // long bull body
  const c1 = { open: 100.6, close: 100.8, high: 100.9, low: 100.3 }; // small
  const c0 = { open: 100.7, close: 99.1, high: 100.9, low: 99 }; // closes below midpoint
  return { c2, c1, c0 };
}

function piercingLine() {
  const c1 = { open: 101.5, close: 100, high: 101.6, low: 99.6 };
  const c0 = { open: 99.5, close: 100.9, high: 101.2, low: 99.4 };
  const c2 = { open: 100, close: 100.2, high: 100.5, low: 99.8 };
  return { c0, c1, c2 };
}

function darkCloud() {
  const c1 = { open: 99.5, close: 101.5, high: 102, low: 99.4 };
  const c0 = { open: 102.2, close: 100.2, high: 102.5, low: 100.1 };
  const c2 = { open: 100, close: 100.1, high: 100.4, low: 99.8 };
  return { c0, c1, c2 };
}

function buildBase(length, price) {
  const arr = [];
  for (let i = 0; i < length; i++) {
    const open = price + 0.01 * (i % 3);
    const close = open + 0.05;
    arr.push({ open, close, high: close + 0.2, low: open - 0.2 });
  }
  return arr;
}

function fill(length, value) {
  return Array.from({ length }, () => value);
}

function bullishScenario() {
  const candles = buildBase(MIN_LEN, 100);
  const idxCurrent = MIN_LEN - 2;
  const idxPrev = idxCurrent - 1;
  const idxPrev2 = idxCurrent - 1 - 1;
  candles[idxPrev2] = { open: 100.2, close: 99.6, high: 100.5, low: 99.3 };
  candles[idxPrev] = { open: 101.8, close: 100.6, high: 102, low: 100.3 };
  candles[idxCurrent] = { open: 100.4, close: 101.9, high: 102.4, low: 100.3 };
  const cci = fill(MIN_LEN, -50);
  cci[idxCurrent] = -220;
  const sma = fill(MIN_LEN, 95);
  const atr = fill(MIN_LEN, 3.5);
  return { candles, cci, sma, atr };
}

function bearishScenario() {
  const candles = buildBase(MIN_LEN, 100);
  const idxCurrent = MIN_LEN - 2;
  const idxPrev = idxCurrent - 1;
  const idxPrev2 = idxCurrent - 1 - 1;
  candles[idxPrev2] = { open: 99.4, close: 100.2, high: 100.5, low: 99.1 };
  candles[idxPrev] = { open: 99.5, close: 100.5, high: 100.8, low: 99.2 };
  candles[idxCurrent] = { open: 100.5, close: 98.8, high: 101, low: 98.7 };
  const cci = fill(MIN_LEN, 0);
  cci[idxCurrent] = 220;
  const sma = fill(MIN_LEN, 105);
  const atr = fill(MIN_LEN, 3.5);
  return { candles, cci, sma, atr };
}

function bearishLowScore() {
  const candles = buildBase(MIN_LEN, 100);
  const idxCurrent = MIN_LEN - 2;
  const idxPrev = idxCurrent - 1;
  candles[idxPrev] = { open: 100, close: 101, high: 101.2, low: 99.8 };
  candles[idxCurrent] = { open: 101.5, close: 100.4, high: 101.7, low: 100.1 };
  const cci = fill(MIN_LEN, 0);
  const sma = fill(MIN_LEN, 99);
  const atr = fill(MIN_LEN, 0.5);
  return { candles, cci, sma, atr };
}

function captureLogs() {
  const original = console.log;
  const messages = [];
  const util = require('util');
  console.log = (...args) => {
    messages.push(util.format(...args));
  };
  return { messages, restore: () => (console.log = original) };
}

function restoreLogs(fn) {
  fn();
}
