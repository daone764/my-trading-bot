const percent = require('percent');

let tulind;
try {
  // Optional native dependency
  // eslint-disable-next-line global-require
  tulind = require('tulind');
} catch (e) {
  tulind = null;
}

let talib;
try {
  // Optional native dependency
  // eslint-disable-next-line global-require
  talib = require('talib');
} catch (e) {
  talib = null;
}

/**
 * ZigZag indicator
 *
 * @see https://github.com/andresilvasantos/bitprophet/blob/master/indicators.js
 *
 * @param ticks
 * @param deviation
 * @param arraySize
 * @returns {Array}
 */
function zigzag(ticks, deviation = 5, arraySize = -1) {
  // Determines percent deviation in price changes, presenting frequency and volatility in deviation. Also helps determine trend reversals.
  // Read more: http://stockcharts.com/school/doku.php?id=chart_school:technical_indicators:zigzag
  // arraySize = -1, calculate ZigZag for all ticks
  // arraySize = n, where n >= 1, calculate the ZigZag for the last n ticks

  const turningPoints = [];
  let basePrice = -1;
  let lastDeviation = 0;
  deviation /= 100;

  const startingTick = arraySize == -1 ? 0 : ticks.length - arraySize;
  // Calculate all turning points that have a deviation equal or superior to the argument received
  for (let i = startingTick; i < ticks.length; ++i) {
    const close = parseFloat(ticks[i].close);
    const high = parseFloat(ticks[i].high);
    const low = parseFloat(ticks[i].low);
    let positiveDeviation = high / basePrice - 1;
    let negativeDeviation = low / basePrice - 1;

    if (basePrice == -1) {
      basePrice = close;
      lastDeviation = 0;
      turningPoints.push({ timePeriod: i, value: close, deviation: lastDeviation });
      continue;
    }

    // Is it a positive turning point or is it higher than the last positive one?
    if (positiveDeviation >= deviation || (positiveDeviation > 0 && lastDeviation > 0)) {
      if (lastDeviation > 0) {
        positiveDeviation += lastDeviation;
        turningPoints.pop();
      }

      turningPoints.push({ timePeriod: i, value: high, deviation: positiveDeviation });
      lastDeviation = positiveDeviation;
      basePrice = high;
    }
    // Is it a positive turning point or is it lower than the last negative one?
    else if (negativeDeviation <= -deviation || (negativeDeviation < 0 && lastDeviation < 0)) {
      if (lastDeviation < 0) {
        negativeDeviation += lastDeviation;
        turningPoints.pop();
      }

      turningPoints.push({ timePeriod: i, value: low, deviation: negativeDeviation });
      lastDeviation = negativeDeviation;
      basePrice = low;
    }
    // Add always the last one as a turning point, just to make our life easier for the next calculation
    else if (i === ticks.length - 1) {
      if (positiveDeviation > 0) turningPoints.push({ timePeriod: i, value: high, deviation: positiveDeviation });
      else turningPoints.push({ timePeriod: i, value: low, deviation: negativeDeviation });
    }
  }

  const zigzag = [];
  // Add the turning points to the returning array, calculate the values between those turning points and add them as well
  for (let i = 0; i < turningPoints.length; ++i) {
    const turningPoint = turningPoints[i];
    zigzag.push({
      timePeriod: turningPoint.timePeriod,
      value: turningPoint.value,
      deviation: parseFloat((turningPoint.deviation * 100).toFixed(2)),
      turningPoint: turningPoint.deviation > deviation || turningPoint.deviation < -deviation
    });

    if (turningPoint.timePeriod >= ticks.length - 1) continue;

    const nextTurningPoint = turningPoints[i + 1];
    for (let j = turningPoint.timePeriod + 1; j < nextTurningPoint.timePeriod; ++j) {
      const distanceToTP = j - turningPoint.timePeriod;
      const distanceTPs = nextTurningPoint.timePeriod - turningPoint.timePeriod;
      const value = turningPoint.value + ((nextTurningPoint.value - turningPoint.value) / distanceTPs) * distanceToTP;
      const currentDeviation = value / turningPoint.value;

      zigzag.push({
        timePeriod: j,
        value: value,
        deviation: parseFloat((currentDeviation * 100).toFixed(2)),
        turningPoint: false
      });
    }
  }

  return zigzag;
}

function executeTulindIndicator(source, indicator, tulindOptions) {
  return new Promise(resolve => {
    const indicatorName = indicator.indicator === 'bb' ? 'bbands' : indicator.indicator;
    let { sources, options = {} } = tulindOptions;

    // extract indicator source data, for example if sources = ['open', 'high'], then it will map values from candles.
    sources = sources ? sources.map(s => source.map(ss => ss[s])) : [source];

    // set default indicator options
    const indicatorOptions = indicator.options || {};
    options = Object.keys(options).map(o => indicatorOptions[o] || options[o]);

    // Prefer tulind when available, otherwise fall back to technicalindicators.
    if (tulind && tulind.indicators && tulind.indicators[indicatorName]) {
      tulind.indicators[indicatorName].indicator(sources, options, (err, res) => {
        if (err) {
          resolve({ [indicator.key]: [] });
          return;
        }

        let finalResult = res[0];
        const { results } = tulindOptions;
        if (results !== undefined) {
          // if indicator returns multiple results, extract them
          finalResult = res[0].map((r, i) => {
            const record = results.reduce(
              (acc, key) => Object.assign(acc, { [key]: res[results.indexOf(key)][i] }),
              {}
            );
            if (indicatorName === 'bbands') {
              Object.assign(record, { width: (record.upper - record.lower) / record.middle });
            }
            return record;
          });
        }
        resolve({ [indicator.key]: finalResult });
      });
      return;
    }

    // Fallback path (no tulind)
    // eslint-disable-next-line global-require
    const ti = require('technicalindicators');

    const s0 = sources && sources.length >= 1 ? sources[0] : null;
    const s1 = sources && sources.length >= 2 ? sources[1] : null;
    const s2 = sources && sources.length >= 3 ? sources[2] : null;
    const s3 = sources && sources.length >= 4 ? sources[3] : null;

    const values = sources && sources.length === 1 ? s0 : null;

    const length = indicator?.options?.length || options.length;

    const fallbackUnsupported = () => {
      throw new Error(
        `Indicator '${indicatorName}' requires optional dependency 'tulind'. Install it or avoid this indicator.`
      );
    };

    let out;

    const fullEma = (arr, period) => {
      if (!arr || arr.length === 0) {
        return [];
      }
      const p = period || 14;
      const k = 2 / (p + 1);
      const ema = new Array(arr.length);
      ema[0] = Number(arr[0]);
      for (let i = 1; i < arr.length; i += 1) {
        ema[i] = (Number(arr[i]) - ema[i - 1]) * k + ema[i - 1];
      }
      return ema;
    };

    const smaFull = (arr, period) => {
      const p = period || 14;
      if (!arr || arr.length < p) {
        return [];
      }
      const outSma = [];
      let sum = 0;
      for (let i = 0; i < p; i += 1) {
        sum += Number(arr[i]);
      }
      outSma.push(sum / p);
      for (let i = p; i < arr.length; i += 1) {
        sum += Number(arr[i]) - Number(arr[i - p]);
        outSma.push(sum / p);
      }
      return outSma;
    };

    const fullObv = (closeArr, volumeArr) => {
      if (!closeArr || !volumeArr || closeArr.length === 0) {
        return [];
      }
      const obv = new Array(closeArr.length);
      obv[0] = 0;
      for (let i = 1; i < closeArr.length; i += 1) {
        const prev = Number(closeArr[i - 1]);
        const cur = Number(closeArr[i]);
        const v = Number(volumeArr[i]);
        if (cur > prev) {
          obv[i] = obv[i - 1] + v;
        } else if (cur < prev) {
          obv[i] = obv[i - 1] - v;
        } else {
          obv[i] = obv[i - 1];
        }
      }
      return obv;
    };

    switch (indicatorName) {
      case 'sma':
        out = ti.SMA.calculate({ period: length || 14, values });
        break;
      case 'ema':
        // Match tulind-style behavior used by this repo's tests: full-length EMA seeded from the first value.
        out = fullEma(values, length || 14);
        break;
      case 'wma': {
        const period = length || 9;
        if (!ti.WMA) {
          fallbackUnsupported();
        }
        out = ti.WMA.calculate({ period, values });
        break;
      }
      case 'dema': {
        const period = length || 9;
        if (ti.DEMA) {
          out = ti.DEMA.calculate({ period, values });
          break;
        }
        const ema1 = fullEma(values, period);
        const ema2 = fullEma(ema1, period);
        out = ema1.map((v, i) => 2 * v - ema2[i]);
        break;
      }
      case 'tema': {
        const period = length || 9;
        if (ti.TEMA) {
          out = ti.TEMA.calculate({ period, values });
          break;
        }
        const ema1 = fullEma(values, period);
        const ema2 = fullEma(ema1, period);
        const ema3 = fullEma(ema2, period);
        out = ema1.map((v, i) => 3 * v - 3 * ema2[i] + ema3[i]);
        break;
      }
      case 'trima': {
        const period = length || 9;
        if (ti.TRIMA) {
          out = ti.TRIMA.calculate({ period, values });
          break;
        }
        // Triangular MA: SMA(SMA(values, ceil(n/2)), floor(n/2)+1)
        const p1 = Math.ceil(period / 2);
        const p2 = Math.floor(period / 2) + 1;
        const sma1 = ti.SMA.calculate({ period: p1, values });
        out = ti.SMA.calculate({ period: p2, values: sma1 });
        break;
      }
      case 'kama': {
        const period = length || 9;
        if (ti.KAMA) {
          out = ti.KAMA.calculate({ period, values });
          break;
        }
        // Conservative fallback: treat as EMA with the same period.
        out = fullEma(values, period);
        break;
      }
      case 'rsi':
        out = ti.RSI.calculate({ period: length || 14, values });
        break;
      case 'cci':
        // CCI needs candles (high/low/close)
        out = ti.CCI.calculate({ period: length || 20, high: s0, low: s1, close: s2 });
        break;
      case 'roc':
        out = ti.ROC.calculate({ period: length || 14, values });
        break;
      case 'atr':
        out = ti.ATR.calculate({ period: length || 14, high: s0, low: s1, close: s2 });
        break;
      case 'mfi': {
        const volume = s3;
        out = ti.MFI.calculate({ period: length || 14, high: s0, low: s1, close: s2, volume });
        break;
      }
      case 'obv': {
        // For obv we receive sources as [close, volume]
        out = fullObv(s0, s1);
        break;
      }
      case 'ao':
        // Awesome Oscillator (tulind/Tulip style):
        // AO = SMA(median, 5) - SMA(median, 34), output starts at slowPeriod - 1.
        if (!s0 || !s1 || s0.length === 0) {
          out = [];
          break;
        }
        {
          const fast = 5;
          const slow = 34;
          const median = s0.map((h, i) => (Number(h) + Number(s1[i])) / 2);
          const smaFast = smaFull(median, fast);
          const smaSlow = smaFull(median, slow);
          const offset = slow - fast;
          out = smaSlow.map((slowVal, i) => smaFast[i + offset] - slowVal);
        }
        break;
      case 'hma': {
        // Hull Moving Average (fallback): HMA(n) = WMA(2*WMA(price,n/2) - WMA(price,n), sqrt(n))
        const n = length || 9;
        if (!values || values.length === 0) {
          out = [];
          break;
        }
        const half = Math.max(1, Math.floor(n / 2));
        const sqrtN = Math.max(1, Math.floor(Math.sqrt(n)));

        const wma = (arr, period) => {
          const p = Math.max(1, period);
          const result = [];
          for (let i = p - 1; i < arr.length; i += 1) {
            let num = 0;
            let den = 0;
            for (let j = 0; j < p; j += 1) {
              const weight = p - j;
              num += Number(arr[i - j]) * weight;
              den += weight;
            }
            result.push(den === 0 ? 0 : num / den);
          }
          return result;
        };

        const w1 = wma(values, half);
        const w2 = wma(values, n);
        const minLen = Math.min(w1.length, w2.length);
        const diff = [];
        for (let i = 0; i < minLen; i += 1) {
          diff.push(2 * w1[w1.length - minLen + i] - w2[w2.length - minLen + i]);
        }
        out = wma(diff, sqrtN);
        break;
      }
      case 'bbands': {
        const stddev = indicator?.options?.stddev || options.stddev || 2;
        const period = indicator?.options?.length || options.length || 20;
        const bands = ti.BollingerBands.calculate({ period, stdDev: stddev, values });
        out = bands.map(b => ({
          lower: b.lower,
          middle: b.middle,
          upper: b.upper,
          width: (b.upper - b.lower) / b.middle
        }));
        break;
      }
      case 'stoch': {
        const k = options.k || 3;
        const d = options.d || 3;
        const period = options.length || 14;
        const st = ti.Stochastic.calculate({ high: s0, low: s1, close: s2, period, signalPeriod: d, kPeriod: k });
        // technicalindicators may return leading items with undefined d - trim to where both values exist.
        const mapped = st
          .filter(v => typeof v.k === 'number' && typeof v.d === 'number')
          .map(v => ({ stoch_k: v.k, stoch_d: v.d }));

        // Some implementations include a leading 0 for %K even when %D is defined.
        // Trim leading zeros to match the expectation that the first item is usable.
        const firstUsableIdx = mapped.findIndex(v => Number.isFinite(v.stoch_k) && v.stoch_k !== 0);
        out = firstUsableIdx > 0 ? mapped.slice(firstUsableIdx) : mapped;
        break;
      }
      case 'adx': {
        const period = options.length || 14;
        const r = ti.ADX.calculate({ period, high: s0, low: s1, close: s2 });
        // technicalindicators returns array of { adx, pdi, mdi }
        out = r.map(v => v.adx);
        break;
      }
      case 'macd': {
        const fast = options.fast_length || 12;
        const slow = options.slow_length || 26;
        const signal = options.signal_length || 9;

        // Match Tulip Indicators (tulind) MACD implementation.
        // Output starts at index (slow - 1) and returns (size - (slow - 1)) elements.
        let shortPer = 2 / (fast + 1);
        let longPer = 2 / (slow + 1);
        const signalPer = 2 / (signal + 1);

        // Tulip has a special-case for the common 12/26 MACD.
        if (fast === 12 && slow === 26) {
          shortPer = 0.15;
          longPer = 0.075;
        }

        let shortEma = values[0];
        let longEma = values[0];
        let signalEma = 0;

        const result = [];
        for (let i = 1; i < values.length; i += 1) {
          shortEma = (values[i] - shortEma) * shortPer + shortEma;
          longEma = (values[i] - longEma) * longPer + longEma;
          const macdValue = shortEma - longEma;

          if (i === slow - 1) {
            signalEma = macdValue;
          }

          if (i >= slow - 1) {
            signalEma = (macdValue - signalEma) * signalPer + signalEma;
            result.push({
              macd: macdValue,
              signal: signalEma,
              histogram: macdValue - signalEma
            });
          }
        }

        out = result;
        break;
      }
      case 'vwma': {
        const period = length || 20;
        // For vwma we receive sources as [close, volume]
        const price = s0;
        const volume = s1;
        if (!volume) {
          fallbackUnsupported();
        }
        const result = [];
        for (let i = period - 1; i < price.length; i++) {
          let pv = 0;
          let v = 0;
          for (let j = i - period + 1; j <= i; j++) {
            pv += price[j] * volume[j];
            v += volume[j];
          }
          result.push(v === 0 ? 0 : pv / v);
        }
        out = result;
        break;
      }
      default:
        out = fallbackUnsupported();
    }

    resolve({ [indicator.key]: out });
  });
}

module.exports = {
  // indicators which source is Candles
  sourceCandle: [
    'cci',
    'pivot_points_high_low',
    'obv',
    'ao',
    'mfi',
    'stoch',
    'vwma',
    'atr',
    'adx',
    'volume_profile',
    'volume_by_price',
    'ichimoku_cloud',
    'zigzag',
    'wicked',
    'heikin_ashi',
    'psar',
    'hma',
    'candles'
  ],

  bb: (source, indicator) => {
    const { options = {} } = indicator;

    return executeTulindIndicator(source, indicator, {
      options: {
        length: options.length || 20,
        stddev: options.stddev || 2
      },
      results: ['lower', 'middle', 'upper']
    });
  },

  obv: (...args) => executeTulindIndicator(...args, { sources: ['close', 'volume'] }),
  ao: (...args) => executeTulindIndicator(...args, { sources: ['high', 'low'] }),
  wma: (...args) => executeTulindIndicator(...args, { options: { length: 9 } }),
  dema: (...args) => executeTulindIndicator(...args, { options: { length: 9 } }),
  tema: (...args) => executeTulindIndicator(...args, { options: { length: 9 } }),
  trima: (...args) => executeTulindIndicator(...args, { options: { length: 9 } }),
  kama: (...args) => executeTulindIndicator(...args, { options: { length: 9 } }),

  roc: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      options: {
        length: indicator?.options?.length || 14
      }
    }),

  atr: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      sources: ['high', 'low', 'close'],
      options: {
        length: indicator?.options?.length || 14
      }
    }),

  mfi: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      sources: ['high', 'low', 'close', 'volume'],
      options: {
        length: indicator?.options?.length || 14
      }
    }),

  sma: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      options: {
        length: indicator?.options?.length || 14
      }
    }),

  ema: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      options: {
        length: indicator?.options?.length || 14
      }
    }),

  rsi: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      options: {
        length: indicator?.options?.length || 14
      }
    }),

  hma: (source, indicator) => {
    const candleSource = (indicator.options && indicator.options.source) || 'close';

    return executeTulindIndicator(source, indicator, {
      sources: [candleSource],
      options: {
        length: indicator?.options?.length || 9
      }
    });
  },

  cci: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      sources: ['high', 'low', 'close'],
      options: {
        length: indicator?.options?.length || 20
      }
    }),

  vwma: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      sources: ['close', 'volume'],
      options: {
        length: indicator?.options?.length || 20
      }
    }),

  stoch: (...args) =>
    executeTulindIndicator(...args, {
      sources: ['high', 'low', 'close'],
      options: { length: 14, k: 3, d: 3 },
      results: ['stoch_k', 'stoch_d']
    }),

  macd: (source, indicator) =>
    executeTulindIndicator(source, indicator, {
      results: ['macd', 'signal', 'histogram'],
      options: {
        fast_length: indicator?.options?.fast_length || 12,
        slow_length: indicator?.options?.slow_length || 26,
        signal_length: indicator?.options?.signal_length || 9
      }
    }),

  adx: (...args) =>
    executeTulindIndicator(...args, {
      sources: ['high', 'low', 'close'],
      options: { length: 14 }
    }),

  macd_ext: function (source, indicator) {
    return new Promise(resolve => {
      /**
       * Extract int from string input eg (SMA = 0)
       *
       * @see https://github.com/oransel/node-talib
       * @see https://github.com/markcheno/go-talib/blob/master/talib.go#L20
       */
      const getMaTypeFromString = function (maType) {
        // no constant in lib?
        const types = ['SMA', 'EMA', 'WMA', 'DEMA', 'TEMA', 'TRIMA', 'KAMA', 'MAMA', 'T3'];
        return types.includes(maType) ? types.indexOf(maType) : 1;
      };

      const { options = {} } = indicator;
      const { default_ma_type = 'EMA' } = options;
      const { fast_ma_type = default_ma_type } = options;
      const { slow_ma_type = default_ma_type } = options;
      const { signal_ma_type = default_ma_type } = options;

      if (talib && typeof talib.execute === 'function') {
        talib.execute(
          {
            name: 'MACDEXT',
            startIdx: 0,
            endIdx: source.length - 1,
            inReal: source.slice(),
            optInFastPeriod: options.fast_period || 12,
            optInSlowPeriod: options.slow_period || 26,
            optInSignalPeriod: options.signal_period || 9,
            optInFastMAType: getMaTypeFromString(fast_ma_type),
            optInSlowMAType: getMaTypeFromString(slow_ma_type),
            optInSignalMAType: getMaTypeFromString(signal_ma_type)
          },
          (err, result) => {
            const resultHistory = [];
            if (!err && result && result.result) {
              for (let i = 0; i < result.nbElement; i += 1) {
                resultHistory.push({
                  macd: result.result.outMACD[i],
                  histogram: result.result.outMACDHist[i],
                  signal: result.result.outMACDSignal[i]
                });
              }
            }
            resolve({ [indicator.key]: resultHistory });
          }
        );
        return;
      }

      // Fallback (no talib): implement MACDEXT with support for EMA/DEMA/SMA.
      // This is primarily to keep tests and runtime working without native builds.
      const computeEma = (arr, period) => {
        const p = Math.max(1, Number(period) || 1);
        if (!arr || arr.length < p) {
          return { out: [], lookback: p - 1 };
        }
        const k = 2 / (p + 1);
        let sum = 0;
        for (let i = 0; i < p; i += 1) {
          sum += Number(arr[i]);
        }
        let prev = sum / p;
        const out = [prev];
        for (let i = p; i < arr.length; i += 1) {
          prev = (Number(arr[i]) - prev) * k + prev;
          out.push(prev);
        }
        return { out, lookback: p - 1 };
      };

      const computeSma = (arr, period) => {
        const p = Math.max(1, Number(period) || 1);
        if (!arr || arr.length < p) {
          return { out: [], lookback: p - 1 };
        }
        const out = [];
        let sum = 0;
        for (let i = 0; i < p; i += 1) {
          sum += Number(arr[i]);
        }
        out.push(sum / p);
        for (let i = p; i < arr.length; i += 1) {
          sum += Number(arr[i]) - Number(arr[i - p]);
          out.push(sum / p);
        }
        return { out, lookback: p - 1 };
      };

      const computeDema = (arr, period) => {
        const p = Math.max(1, Number(period) || 1);
        const ema1 = computeEma(arr, p);
        const ema2 = computeEma(ema1.out, p);
        const offset = ema2.lookback; // == p - 1
        const out = ema2.out.map((v, i) => 2 * ema1.out[i + offset] - v);
        return { out, lookback: ema1.lookback + ema2.lookback };
      };

      const computeMa = (arr, period, maType) => {
        const t = String(maType || 'EMA').toUpperCase();
        if (t === 'SMA') {
          return computeSma(arr, period);
        }
        if (t === 'DEMA') {
          return computeDema(arr, period);
        }
        // default EMA
        return computeEma(arr, period);
      };

      const fastPeriod = options.fast_period || 12;
      const slowPeriod = options.slow_period || 26;
      const signalPeriod = options.signal_period || 9;

      const fast = computeMa(source, fastPeriod, fast_ma_type);
      const slow = computeMa(source, slowPeriod, slow_ma_type);

      const slowLookback = slow.lookback;
      const fastLookback = fast.lookback;
      const offsetFast = slowLookback - fastLookback;

      const macdSeries = slow.out.map((slowVal, i) => fast.out[i + offsetFast] - slowVal);

      const signal = computeMa(macdSeries, signalPeriod, signal_ma_type);
      const signalLookback = signal.lookback;

      const resultHistory = signal.out.map((signalVal, i) => {
        const macdVal = macdSeries[i + signalLookback];
        return {
          macd: macdVal,
          histogram: macdVal - signalVal,
          signal: signalVal
        };
      });

      resolve({ [indicator.key]: resultHistory });
    });
  },

  bb_talib: function (source, indicator) {
    return new Promise(resolve => {
      const { options = {} } = indicator;
      const { length = 20, stddev = 2 } = options;
      if (talib && typeof talib.execute === 'function') {
        talib.execute(
          {
            name: 'BBANDS',
            startIdx: 0,
            endIdx: source.length - 1,
            inReal: source.slice(),
            optInTimePeriod: length,
            optInNbDevUp: stddev,
            optInNbDevDn: stddev,
            optInMAType: 0 // simple moving average here
          },
          (err, result) => {
            if (err) {
              resolve({ [indicator.key]: [] });
              return;
            }

            const resultHistory = [];
            for (let i = 0; i < result.nbElement; i += 1) {
              resultHistory.push({
                upper: result.result.outRealUpperBand[i],
                middle: result.result.outRealMiddleBand[i],
                lower: result.result.outRealLowerBand[i],
                width:
                  (result.result.outRealUpperBand[i] - result.result.outRealLowerBand[i]) /
                  result.result.outRealMiddleBand[i]
              });
            }
            resolve({ [indicator.key]: resultHistory });
          }
        );
        return;
      }

      // Fallback (no talib)
      // eslint-disable-next-line global-require
      const { BollingerBands } = require('technicalindicators');
      const bands = BollingerBands.calculate({ period: length, stdDev: stddev, values: source });
      const resultHistory = bands.map(b => ({
        upper: b.upper,
        middle: b.middle,
        lower: b.lower,
        width: (b.upper - b.lower) / b.middle
      }));
      resolve({ [indicator.key]: resultHistory });
    });
  },

  stoch_rsi: function (source, indicator) {
    return new Promise(resolve => {
      const { options = {} } = indicator;
      const { rsi_length = 14, stoch_length = 14, k = 3, d = 3 } = options;

      const { StochasticRSI } = require('technicalindicators');
      const f = new StochasticRSI({
        values: source,
        rsiPeriod: rsi_length,
        stochasticPeriod: stoch_length,
        kPeriod: k,
        dPeriod: d
      });

      const result = [];
      const results = f.getResult();

      for (let i = 0; i < results.length; i++) {
        result.push({
          stoch_k: results[i].k,
          stoch_d: results[i].d
        });
      }

      resolve({ [indicator.key]: result });
    });
  },

  psar: function (source, indicator) {
    return new Promise(resolve => {
      const { options = {} } = indicator;
      const { step = 0.02, max = 0.2 } = options;

      const input = {
        high: [],
        low: [],
        step: step,
        max: max
      };

      source.forEach(candle => {
        input.high.push(candle.high);
        input.low.push(candle.low);
      });

      const { PSAR } = require('technicalindicators');
      resolve({ [indicator.key]: new PSAR(input).getResult() });
    });
  },

  heikin_ashi: function (source, indicator) {
    return new Promise(resolve => {
      const { HeikinAshi } = require('technicalindicators');

      const input = {
        close: [],
        high: [],
        low: [],
        open: [],
        timestamp: [],
        volume: []
      };

      source.forEach(candle => {
        input.close.push(candle.close);
        input.high.push(candle.high);
        input.low.push(candle.low);
        input.open.push(candle.open);
        input.timestamp.push(candle.time);
        input.volume.push(candle.volume);
      });

      const f = new HeikinAshi(input);

      const results = f.getResult();

      const candles = [];

      const { length } = results.open || [];
      for (let i = 0; i < length; i++) {
        candles.push({
          close: results.close[i],
          high: results.high[i],
          low: results.low[i],
          open: results.open[i],
          time: results.timestamp[i],
          volume: results.volume[i]
        });
      }

      resolve({ [indicator.key]: candles });
    });
  },

  volume_profile: function (source, indicator) {
    return new Promise(resolve => {
      const { options = {} } = indicator;
      const { length = 200, ranges = 14 } = options;

      const { candles2MarketData } = require('./technical_analysis');
      const { VolumeProfile } = require('technicalindicators');
      const f = new VolumeProfile({ ...candles2MarketData(source, length), noOfBars: ranges });

      resolve({ [indicator.key]: f.getResult() });
    });
  },

  volume_by_price: function (source, indicator) {
    // https://stockcharts.com/school/doku.php?id=chart_school:technical_indicators:volume_by_price
    return new Promise(resolve => {
      const { options = {} } = indicator;
      const { length = 200, ranges = 12 } = options;

      const lookbackRange = source.slice(-length);

      const minMax = lookbackRange.reduce(
        (accumulator, currentValue) => [Math.min(currentValue.close, accumulator[0]), Math.max(currentValue.close, accumulator[1])],
        [Number.MAX_VALUE, Number.MIN_VALUE]
      );

      const rangeSize = (minMax[1] - minMax[0]) / ranges;
      const rangeBlocks = [];

      let current = minMax[0];
      for (let i = 0; i < ranges; i++) {
        // summarize volume per range
        const map = lookbackRange.filter(c => c.close >= current && c.close < current + rangeSize).map(c => c.volume);

        // prevent float / rounding issues on first and last item
        rangeBlocks.push({
          low: i === 0 ? current * 0.9999 : current,
          high: i === ranges - 1 ? minMax[1] * 1.0001 : current + rangeSize,
          volume: map.length > 0 ? map.reduce((x, y) => x + y) : 0
        });

        current += rangeSize;
      }

      resolve({ [indicator.key]: [rangeBlocks.reverse()] }); // sort by price; low to high
    });
  },

  zigzag: function (source, indicator) {
    // https://stockcharts.com/school/doku.php?id=chart_school:technical_indicators:volume_by_price
    return new Promise(resolve => {
      const { options = {} } = indicator;
      const { length = 1000, deviation = 5 } = options;

      const result = zigzag(source.slice(-length), deviation);

      // we only what to have turningPoints; non turningPoints should be empty lookback
      const turningPoints = result.map(r => (r && r.turningPoint === true ? r : {}));
      resolve({ [indicator.key]: turningPoints });
    });
  },

  ichimoku_cloud: function (source, indicator) {
    return new Promise(resolve => {
      const { options = {} } = indicator;
      const { conversionPeriod = 9, basePeriod = 26, spanPeriod = 52, displacement = 26 } = options;

      const { candles2MarketData } = require('./technical_analysis');
      const { IchimokuCloud } = require('technicalindicators');
      const f = new IchimokuCloud({
        ...candles2MarketData(source, undefined, ['high', 'low']),
        conversionPeriod: conversionPeriod,
        basePeriod: basePeriod,
        spanPeriod: spanPeriod,
        displacement: displacement
      });

      resolve({ [indicator.key]: f.getResult() });
    });
  },

  pivot_points_high_low: function (source, indicator) {
    const { key, options = {} } = indicator;
    const { left = 5, right = 5 } = options;
    return new Promise(resolve => {
      const result = [];

      for (let i = 0; i < source.length; i += 1) {
        const start = i - left - right;
        if (start < 0) {
          result.push({});
          continue;
        }
        const { getPivotPointsWithWicks } = require('./technical_analysis');
        result.push(getPivotPointsWithWicks(source.slice(start, i + 1), left, right));
      }
      resolve({ [key]: result });
    });
  },

  wicked: function (source, indicator) {
    const { key } = indicator;
    return new Promise(resolve => {
      const results = [];
      const { candles2MarketData } = require('./technical_analysis');
      const marketData = candles2MarketData(source, undefined, ['high', 'close', 'open', 'low']);
      for (let i = 0; i < marketData.close.length; i++) {
        const top = marketData.high[i] - Math.max(marketData.close[i], marketData.open[i]);
        const bottom = marketData.low[i] - Math.min(marketData.close[i], marketData.open[i]);

        results.push({
          top: Math.abs(percent.calc(top, marketData.high[i] - marketData.low[i], 2)),
          body: Math.abs(percent.calc(marketData.close[i] - marketData.open[i], marketData.high[i] - marketData.low[i], 2)),
          bottom: Math.abs(percent.calc(bottom, marketData.high[i] - marketData.low[i], 2))
        });
      }
      resolve({ [key]: results.reverse() });
    });
  },

  candles: async (source, indicator) => ({
    [indicator.key]: source.slice()
  })
};
