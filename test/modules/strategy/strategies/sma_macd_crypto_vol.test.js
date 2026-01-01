const assert = require('assert');
const SmaMacdCryptoVol = require('../../../../src/modules/strategy/strategies/SmaMacdCryptoVol');
const IndicatorPeriod = require('../../../../src/modules/strategy/dict/indicator_period');
const StrategyContext = require('../../../../src/dict/strategy_context');
const Ticker = require('../../../../src/dict/ticker');

const LEN = 220;

describe('#strategy sma_macd_crypto_vol', () => {
  it('emits long when cross + score + atr filter pass', () => {
    const candles = baseCandles(LEN, 100, { volumes: 1000 });
    // engineer last 5 bars so four are above sma and current bar crosses above
    candles[LEN - 6].close = 100.2; // index 214 within last5 slice
    candles[LEN - 5].close = 100.3; // index 215
    candles[LEN - 4].close = 100.1; // index 216
    candles[LEN - 3].close = 99.8;  // index 217, below for cross setup (prev)
    candles[LEN - 2].close = 101.5; // index 218, current closed crosses above
    candles[LEN - 1].close = 101.6; // forming (ignored)

    const sma = fill(LEN, 100);

    const macd = fillMacd(LEN, {
      prev: { macd: -0.01, signal: 0, histogram: -0.01 },
      cur: { macd: 0.05, signal: 0, histogram: 0.05 }
    });

    const atr = fill(LEN, 1); // atrPct = 1%

    // boost volume on current bar
    candles[LEN - 2].volume = 1400;

    const period = makeIndicatorPeriod({ candles, sma, macd, atr });
    const res = new SmaMacdCryptoVol().period(period, { allowShort: true });

    assert.equal(res.getSignal(), 'long');
    const dbg = res.getDebug();
    assert.equal(dbg.finalScore >= 70, true);
    assert.ok(Math.abs(dbg.stopLoss - (candles[LEN - 2].close - 1.5)) < 1e-9);
    assert.ok(Math.abs(dbg.tp1 - (candles[LEN - 2].close + 1.5)) < 1e-9);
  });

  it('rejects when atr regime is too low', () => {
    const candles = baseCandles(LEN, 100, { volumes: 1000 });
    candles[LEN - 3].close = 99.8;
    candles[LEN - 2].close = 100.6;
    const sma = fill(LEN, 100);
    const macd = fillMacd(LEN, {
      prev: { macd: -0.01, signal: 0, histogram: -0.01 },
      cur: { macd: 0.05, signal: 0, histogram: 0.05 }
    });
    const atr = fill(LEN, 0.05); // 0.05% ATR pct too low

    const period = makeIndicatorPeriod({ candles, sma, macd, atr });
    const res = new SmaMacdCryptoVol().period(period, {});

    assert.equal(res.getSignal(), undefined);
    assert.equal(res.getDebug().reason, 'atr_regime_block');
  });

  it('rejects when score below threshold', () => {
    const candles = baseCandles(LEN, 100, { volumes: 500 });
    // keep price hugging SMA so dist small and volume flat
    candles[LEN - 2].close = 100.01;
    const sma = fill(LEN, 100);
    const macd = fillMacd(LEN, {
      prev: { macd: -0.005, signal: 0, histogram: -0.005 },
      cur: { macd: 0.003, signal: 0, histogram: 0.003 }
    });
    const atr = fill(LEN, 1);

    const period = makeIndicatorPeriod({ candles, sma, macd, atr });
    const res = new SmaMacdCryptoVol().period(period, {});

    assert.equal(res.getSignal(), undefined);
    assert.equal(res.getDebug().reason, 'score_below_threshold');
  });
});

function makeIndicatorPeriod({ candles, sma, macd, atr }) {
  const forming = candles[candles.length - 1];
  const ticker = new Ticker('test', 'TEST-USD', forming.time || Date.now(), forming.close, forming.close + 0.1);
  const ctx = new StrategyContext({}, ticker);

  return new IndicatorPeriod(ctx, {
    candles_5m: candles,
    sma10_5m: sma,
    macd_5m: macd,
    atr14_5m: atr
  });
}

function baseCandles(length, base, { volumes }) {
  const arr = [];
  for (let i = 0; i < length; i++) {
    const open = base;
    const close = base;
    const high = base + 0.2;
    const low = base - 0.2;
    arr.push({ open, close, high, low, volume: volumes, time: Date.now() + i * 300000 });
  }
  return arr;
}

function fill(length, value) {
  return Array.from({ length }, () => value);
}

function fillMacd(length, { prev, cur }) {
  const arr = Array.from({ length }, () => ({ MACD: 0, signal: 0, histogram: 0 }));
  arr[length - 2] = { MACD: cur.macd, signal: cur.signal, histogram: cur.histogram };
  arr[length - 3] = { MACD: prev.macd, signal: prev.signal, histogram: prev.histogram };
  return arr;
}
