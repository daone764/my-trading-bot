const assert = require('assert');
const CandleReversalScored = require('../../../../var/strategies/candle_reversal_scored');
const IndicatorPeriod = require('../../../../src/modules/strategy/dict/indicator_period');
const StrategyContext = require('../../../../src/dict/strategy_context');
const Ticker = require('../../../../src/dict/ticker');

const BASE_LENGTH = 211; // ensures closed.length >= 210 after trimming forming candle

describe('#strategy candle_reversal_scored', () => {
  it('emits long on strong bullish engulfing with full scoring and ATR-based risk', async () => {
    const candles = buildBaseCandles(BASE_LENGTH, 100);

    const idxCurrent = BASE_LENGTH - 2;
    const idxPrev = idxCurrent - 1;
    const idxPrev2 = idxCurrent - 2;

    candles[idxPrev2] = { open: 100.2, close: 99.6, high: 100.5, low: 99.3 };
    candles[idxPrev] = { open: 101.8, close: 100.6, high: 102.0, low: 100.3 };
    candles[idxCurrent] = { open: 100.4, close: 101.9, high: 102.4, low: 100.3 };

    const cci = fillArray(BASE_LENGTH, -50);
    cci[idxCurrent] = -220;

    const sma = fillArray(BASE_LENGTH, 95);
    const atr = fillArray(BASE_LENGTH, 3.5);

    const period = makeIndicatorPeriod({ candles, cci, sma, atr });
    const result = await new CandleReversalScored().period(period, {});

    assert.equal('long', result.getSignal());

    const debug = result.getDebug();
    assert.equal('Bullish Engulfing', debug.pattern);
    assert.equal(100, debug.finalScore);
    assert.ok(Math.abs(debug.stopDistance - 4.2) < 1e-9);
    assert.ok(Math.abs(debug.stopLoss - 97.7) < 1e-9);
    assert.ok(Math.abs(debug.takeProfit - 110.3) < 1e-9);
  });

  it('rejects bearish entry when shorting is disabled', async () => {
    const candles = buildBaseCandles(BASE_LENGTH, 100);

    const idxCurrent = BASE_LENGTH - 2;
    const idxPrev = idxCurrent - 1;
    const idxPrev2 = idxCurrent - 2;

    candles[idxPrev2] = { open: 99.4, close: 100.2, high: 100.5, low: 99.1 };
    candles[idxPrev] = { open: 99.5, close: 100.5, high: 100.8, low: 99.2 }; // bullish
    candles[idxCurrent] = { open: 100.5, close: 99.0, high: 101.0, low: 98.9 }; // bearish engulfing

    const cci = fillArray(BASE_LENGTH, 0);
    cci[idxCurrent] = 220;

    const sma = fillArray(BASE_LENGTH, 105);
    const atr = fillArray(BASE_LENGTH, 2.5);

    const period = makeIndicatorPeriod({ candles, cci, sma, atr });
    const result = await new CandleReversalScored().period(period, {});

    assert.equal(undefined, result.getSignal());

    const debug = result.getDebug();
    assert.equal('Bearish Engulfing', debug.pattern);
    assert.equal('shorting_not_allowed', debug.rejection);
    assert.equal(100, debug.finalScore);
  });

  it('rejects low-scoring bearish setup below threshold', async () => {
    const candles = buildBaseCandles(BASE_LENGTH, 100);

    const idxCurrent = BASE_LENGTH - 2;
    const idxPrev = idxCurrent - 1;
    const idxPrev2 = idxCurrent - 2;

    candles[idxPrev2] = { open: 99.6, close: 99.9, high: 100.2, low: 99.3 };
    candles[idxPrev] = { open: 100.0, close: 101.0, high: 101.2, low: 99.8 }; // bullish
    candles[idxCurrent] = { open: 101.5, close: 100.4, high: 101.7, low: 100.1 }; // dark cloud cover

    const cci = fillArray(BASE_LENGTH, 0);
    const sma = fillArray(BASE_LENGTH, 99); // bearish trend score = 5
    const atr = fillArray(BASE_LENGTH, 0.5); // keeps volScore positive while extension stays 0

    const period = makeIndicatorPeriod({ candles, cci, sma, atr });
    const result = await new CandleReversalScored().period(period, { allowShort: true });

    assert.equal(undefined, result.getSignal());

    const debug = result.getDebug();
    assert.equal('Dark Cloud Cover', debug.pattern);
    assert.equal('score_below_threshold', debug.rejection);
    assert.equal(40, debug.finalScore);
  });
});

function makeIndicatorPeriod({ candles, cci, sma, atr, lastSignal }) {
  const current = candles[candles.length - 2];
  const ticker = new Ticker('test', 'TEST-USD', Date.now(), current.close, current.close + 0.1);
  const strategyContext = new StrategyContext({}, ticker);
  strategyContext.lastSignal = lastSignal;

  return new IndicatorPeriod(strategyContext, {
    candles_5m: candles,
    cci_14_5m: cci,
    sma200_5m: sma,
    atr14_5m: atr
  });
}

function buildBaseCandles(length, price) {
  const candles = [];
  for (let i = 0; i < length; i++) {
    const open = price + 0.01 * (i % 3);
    const close = open + 0.1;
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.2;
    candles.push({ open, close, high, low });
  }
  return candles;
}

function fillArray(length, value) {
  return Array.from({ length }, () => value);
}
