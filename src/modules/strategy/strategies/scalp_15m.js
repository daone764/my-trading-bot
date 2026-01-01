const SignalResult = require('../dict/signal_result');

/**
 * 15-Minute Scalping Strategy - Simplified
 * Uses only available indicators: RSI, EMA, MACD, BB
 */

module.exports = class Scalp15M {
  getName() {
    return 'scalp_15m';
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('rsi', 'rsi', options.period, {
      length: options.rsi_length || 14
    });

    indicatorBuilder.add('ema_fast', 'ema', options.period, {
      length: options.ema_fast || 5
    });

    indicatorBuilder.add('ema_medium', 'ema', options.period, {
      length: options.ema_medium || 20
    });

    indicatorBuilder.add('ema_slow', 'ema', options.period, {
      length: options.ema_slow || 50
    });

    indicatorBuilder.add('bb', 'bb', options.period, {
      length: options.bb_length || 20,
      offset: options.bb_offset || 2.0
    });

    indicatorBuilder.add('macd', 'macd', options.period, {
      fast_length: options.macd_fast || 12,
      slow_length: options.macd_slow || 26,
      signal_length: options.macd_signal || 9
    });

    indicatorBuilder.add('cci', 'cci', options.period, {
      length: options.cci_length || 20
    });

    indicatorBuilder.add('mfi', 'mfi', options.period, {
      length: options.mfi_length || 14
    });
  }

  period(indicatorPeriod) {
    const lookbacks = indicatorPeriod.getLookbacks();
    if (!lookbacks || lookbacks.length < 3) {
      return SignalResult.createEmptySignal({});
    }

    const current = lookbacks[lookbacks.length - 2];
    if (!current) {
      return SignalResult.createEmptySignal({});
    }

    // Get indicators
    const rsi = this._getValue(indicatorPeriod, 'rsi');
    const emaFast = this._getValue(indicatorPeriod, 'ema_fast');
    const emaMedium = this._getValue(indicatorPeriod, 'ema_medium');
    const emaSlow = this._getValue(indicatorPeriod, 'ema_slow');
    const bb = this._getBBValue(indicatorPeriod, 'bb');
    const macd = this._getMACDValue(indicatorPeriod, 'macd');
    const cci = this._getValue(indicatorPeriod, 'cci');
    const mfi = this._getValue(indicatorPeriod, 'mfi');

    // Skip if indicators not ready
    if (!rsi || !emaFast || !emaMedium || !emaSlow || !bb || !macd) {
      return SignalResult.createEmptySignal({});
    }

    const debug = {
      rsi: rsi.toFixed(1),
      macd_h: macd.histogram.toFixed(4),
      cci: cci ? cci.toFixed(1) : 'N/A',
      mfi: mfi ? mfi.toFixed(1) : 'N/A'
    };

    // Entry conditions
    const rsiBullish = rsi < 35;
    const rsiBearish = rsi > 65;
    const emaUptrend = emaFast > emaMedium && emaMedium > emaSlow;
    const emaDowntrend = emaFast < emaMedium && emaMedium < emaSlow;
    const macdBullish = macd && macd.histogram > 0;
    const macdBearish = macd && macd.histogram < 0;

    // LONG: Oversold + uptrend + bullish MACD + strong CCI
    if (rsiBullish && emaUptrend && macdBullish && cci && Math.abs(cci) > 100) {
      debug.signal = 'LONG';
      return SignalResult.createSignal('long', debug);
    }

    // SHORT: Overbought + downtrend + bearish MACD + strong CCI
    if (rsiBearish && emaDowntrend && macdBearish && cci && Math.abs(cci) > 100) {
      debug.signal = 'SHORT';
      return SignalResult.createSignal('short', debug);
    }

    return SignalResult.createEmptySignal(debug);
  }

  _getValue(indicatorPeriod, key) {
    const indicator = indicatorPeriod.getIndicator(key);
    if (!indicator) return undefined;
    if (Array.isArray(indicator) && indicator.length > 0) {
      const val = indicator[indicator.length - 1];
      return typeof val === 'object' ? val.value || val : val;
    }
    return typeof indicator === 'object' ? indicator.value || indicator : indicator;
  }

  _getBBValue(indicatorPeriod, key) {
    const bb = indicatorPeriod.getIndicator(key);
    if (!bb) return undefined;
    
    let bbData;
    if (Array.isArray(bb) && bb.length > 0) {
      bbData = bb[bb.length - 1];
    } else {
      bbData = bb;
    }

    return {
      upper: bbData.upper || bbData[0],
      middle: bbData.middle || bbData[1],
      lower: bbData.lower || bbData[2]
    };
  }

  _getMACDValue(indicatorPeriod, key) {
    const macd = indicatorPeriod.getIndicator(key);
    if (!macd) return undefined;

    let macdData;
    if (Array.isArray(macd) && macd.length > 0) {
      macdData = macd[macd.length - 1];
    } else {
      macdData = macd;
    }

    return {
      value: macdData.value || macdData.macd || macdData[0] || 0,
      signal: macdData.signal || macdData[1] || 0,
      histogram: (macdData.histogram !== undefined) ? macdData.histogram : ((macdData[0] || 0) - (macdData[1] || 0))
    };
  }

  getOptions() {
    return {
      period: '15m',
      rsi_length: 14,
      ema_fast: 5,
      ema_medium: 20,
      ema_slow: 50,
      bb_length: 20,
      bb_offset: 2.0,
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      cci_length: 20,
      mfi_length: 14
    };
  }

  getBacktestColumns() {
    return [
      { label: 'RSI', value: 'rsi' },
      { label: 'MACD', value: 'macd_h' },
      { label: 'CCI', value: 'cci' }
    ];
  }
};

