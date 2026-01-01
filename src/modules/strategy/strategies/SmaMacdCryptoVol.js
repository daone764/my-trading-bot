const SignalResult = require('../dict/signal_result');

// SMA10 + MACD(12,26,9) with crypto-focused volatility + regime filters

const ATR_PCT_MIN = 0.0025; // 0.25%
const ATR_PCT_MAX = 0.025;  // 2.5%
const STOP_MULT = 1.5;      // ATR-based stop
const MIN_WARM_CANDLES = 60; // basic warmup guard (indicators already enforce their own lookbacks)

module.exports = class SmaMacdCryptoVol {
  constructor() {
    this.name = 'sma_macd_crypto_vol';
    this.cooldownUntil = null;
    this.tradeCountByDay = {};
    this.lastStopSide = null;
  }

  getName() {
    return this.name;
  }

  getOptions() {
    return {
      period: '5m',
      allowShort: true,
      fast_period: 12,
      slow_period: 26,
      signal_period: 9
    };
  }

  buildIndicator(indicatorBuilder, options = {}) {
    const period = options.period || '5m';

    indicatorBuilder.add('candles_5m', 'candles', period);
    indicatorBuilder.add('sma10_5m', 'sma', period, { length: 10 });
    indicatorBuilder.add('macd_5m', 'macd_ext', period, {
      fast_period: options.fast_period || 12,
      slow_period: options.slow_period || 26,
      signal_period: options.signal_period || 9,
      default_ma_type: 'EMA'
    });
    indicatorBuilder.add('atr14_5m', 'atr', period, { length: 14 });
  }

  period(indicatorPeriod, options = {}) {
    const allowShort = options.allowShort !== false && options.allow_short !== false;

    const candles = indicatorPeriod.getIndicator('candles_5m') || [];
    const closed = candles.length > 1 ? candles.slice(0, -1) : candles.slice();
    if (closed.length < MIN_WARM_CANDLES) {
      return SignalResult.createEmptySignal({ reason: 'insufficient_candles' });
    }

    const smaArr = indicatorPeriod.getIndicator('sma10_5m') || [];
    const macdArr = indicatorPeriod.getIndicator('macd_5m') || [];
    const atrArr = indicatorPeriod.getIndicator('atr14_5m') || [];

    const idx = closed.length - 1;
    if (smaArr.length <= idx || macdArr.length <= idx || atrArr.length <= idx) {
      return SignalResult.createEmptySignal({ reason: 'insufficient_indicators' });
    }

    const cur = closed[idx];
    const prev = closed[idx - 1];

    const sma = smaArr[idx];
    const prevSma = smaArr[idx - 1];
    const macd = macdArr[idx];
    const macdPrev = macdArr[idx - 1];
    const atr = atrArr[idx];
    const close = cur.close;

    const atrPct = atr > 0 ? atr / close : 0;
    const withinAtr = atrPct >= ATR_PCT_MIN && atrPct <= ATR_PCT_MAX;

    const lastSignal = indicatorPeriod.getLastSignal();
    const direction = this.detectCrossDirection({ close, prevClose: prev.close, sma, prevSma, macd, macdPrev });

    // Cooldown and max trades per session
    const ts = cur.time || cur.t || cur.timestamp || cur.date || Date.now();
    const dayKey = this.dayKey(ts);
    if (!this.tradeCountByDay[dayKey]) {
      this.tradeCountByDay[dayKey] = 0;
    }

    if (this.cooldownUntil && ts <= this.cooldownUntil) {
      return SignalResult.createEmptySignal({ reason: 'cooldown_active' });
    }

    if (this.tradeCountByDay[dayKey] >= 2) {
      return SignalResult.createEmptySignal({ reason: 'trade_limit_reached' });
    }

    if (!direction) {
      return SignalResult.createEmptySignal({ reason: 'no_cross' });
    }

    if (direction === 'short' && !allowShort) {
      return SignalResult.createEmptySignal({ reason: 'shorting_disabled' });
    }

    if (!withinAtr) {
      return SignalResult.createEmptySignal({ reason: 'atr_regime_block', atrPct });
    }

    // anti re-entry after stop-out in same direction
    if (this.lastStopSide && this.lastStopSide === direction) {
      return SignalResult.createEmptySignal({ reason: 'post_stop_block' });
    }

    if (lastSignal === 'long' || lastSignal === 'short') {
      return SignalResult.createEmptySignal({ reason: 'position_already_open', lastSignal });
    }

    const scoreBreakdown = this.score({ direction, closed, smaArr, atr, atrPct, macd, macdPrev });
    const finalScore = scoreBreakdown.total;
    if (finalScore < 70) {
      return SignalResult.createEmptySignal({ reason: 'score_below_threshold', finalScore, scoreBreakdown });
    }

    const stopDistance = atr * STOP_MULT;
    const stopLoss = direction === 'long' ? close - stopDistance : close + stopDistance;
    const r = stopDistance;
    const tp1 = direction === 'long' ? close + 1 * r : close - 1 * r;
    const tp2 = direction === 'long' ? close + 2 * r : close - 2 * r;
    const tp3 = direction === 'long' ? close + 3 * r : close - 3 * r;

    const debug = {
      direction,
      sma,
      macd: macd.MACD !== undefined ? macd.MACD : macd.macd,
      signal: macd.signal !== undefined ? macd.signal : macd.SIGNAL,
      histogram: macd.histogram,
      atr,
      atrPct,
      finalScore,
      scoreBreakdown,
      stopDistance,
      stopLoss,
      tp1,
      tp2,
      tp3,
      tradeCount: this.tradeCountByDay[dayKey]
    };

    // book-keeping
    this.tradeCountByDay[dayKey] += 1;
    this.cooldownUntil = ts + 3 * 5 * 60 * 1000; // 3 candles of 5m

    return SignalResult.createSignal(direction, debug);
  }

  detectCrossDirection({ close, prevClose, sma, prevSma, macd, macdPrev }) {
    const macdVal = macd.MACD !== undefined ? macd.MACD : macd.macd;
    const macdSignal = macd.signal !== undefined ? macd.signal : macd.SIGNAL;
    const macdPrevVal = macdPrev.MACD !== undefined ? macdPrev.MACD : macdPrev.macd;
    const macdPrevSignal = macdPrev.signal !== undefined ? macdPrev.signal : macdPrev.SIGNAL;

    const crossUp = prevClose <= prevSma && close > sma && macdPrevVal <= macdPrevSignal && macdVal > macdSignal && macdVal > 0;
    if (crossUp) return 'long';

    const crossDown = prevClose >= prevSma && close < sma && macdPrevVal >= macdPrevSignal && macdVal < macdSignal && macdVal < 0;
    if (crossDown) return 'short';

    return null;
  }

  score({ direction, closed, smaArr, atr, atrPct, macd, macdPrev }) {
    const idx = closed.length - 1;
    const current = closed[idx];
    const prev = closed[idx - 1];
    const distAtr = atr > 0 ? Math.abs(current.close - smaArr[idx]) / atr : 0;

    // MACD histogram expansion
    const hist = macd.histogram;
    const histPrev = macdPrev.histogram;
    let histScore = 0;
    if (hist !== undefined && histPrev !== undefined) {
      const sameSign = hist * histPrev > 0;
      const growing = Math.abs(hist) > Math.abs(histPrev);
      if (sameSign && growing) histScore = 30;
      else if (sameSign) histScore = 15;
    }

    // Distance from SMA normalized by ATR
    let distScore = 0;
    if (distAtr >= 1) distScore = 25;
    else if (distAtr >= 0.5) distScore = 15;

    // ATR_pct optimal range
    let atrScore = 0;
    if (atrPct >= ATR_PCT_MIN && atrPct <= ATR_PCT_MAX) atrScore = 20;

    // Volume vs 20-bar average
    let volScore = 0;
    const last20 = closed.slice(-20);
    const avgVol = last20.reduce((a, c) => a + (c.volume || 0), 0) / last20.length;
    const curVol = current.volume || 0;
    const volRatio = avgVol > 0 ? curVol / avgVol : 0;
    if (volRatio >= 1.2) volScore = 15;
    else if (volRatio >= 1.0) volScore = 10;

    // Trend persistence last 5 bars relative to SMA
    let trendScore = 0;
    const last5 = closed.slice(-5);
    const aboveCount = last5.filter((c, i) => (direction === 'long' ? c.close > smaArr[idx - (4 - i)] : c.close < smaArr[idx - (4 - i)])).length;
    if (aboveCount >= 4) trendScore = 10;
    else if (aboveCount >= 3) trendScore = 5;

    const total = histScore + distScore + atrScore + volScore + trendScore;

    return {
      histScore,
      distScore,
      atrScore,
      volScore,
      trendScore,
      total,
      distAtr,
      volRatio,
      aboveCount
    };
  }

  dayKey(ts) {
    const d = new Date(ts);
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }
};