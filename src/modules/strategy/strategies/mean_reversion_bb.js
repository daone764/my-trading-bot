const SignalResult = require('../dict/signal_result');

/**
 * 15-Minute Mean Reversion Strategy - Simplified
 * Uses only available indicators: BB, RSI, MACD, CCI, MFI, StochRSI
 */

module.exports = class MeanReversionBB {
  getName() {
    return 'mean_reversion_bb';
  }

  buildIndicator(indicatorBuilder, options) {
    // Bollinger Bands for mean reversion
    indicatorBuilder.add('bb', 'bb', options.period, {
      length: options.bb_length || 20,
      offset: options.bb_offset || 2.0
    });

    // RSI for momentum extremes
    indicatorBuilder.add('rsi', 'rsi', options.period, {
      length: options.rsi_length || 14
    });

    // Stochastic RSI for additional momentum
    indicatorBuilder.add('stoch_rsi', 'stoch_rsi', options.period, {
      rsi_length: options.rsi_length || 14,
      stoch_length: options.stoch_length || 14,
      k: options.stoch_k || 3,
      d: options.stoch_d || 3
    });

    // CCI for momentum confirmation
    indicatorBuilder.add('cci', 'cci', options.period, {
      length: options.cci_length || 20
    });

    // MACD for trend confirmation
    indicatorBuilder.add('macd', 'macd', options.period, {
      fast_length: options.macd_fast || 12,
      slow_length: options.macd_slow || 26,
      signal_length: options.macd_signal || 9
    });

    // MFI for volume-weighted momentum
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
    const bb = this._getBBValue(indicatorPeriod, 'bb');
    const rsi = this._getValue(indicatorPeriod, 'rsi');
    const stochRsi = this._getValue(indicatorPeriod, 'stoch_rsi');
    const cci = this._getValue(indicatorPeriod, 'cci');
    const macd = this._getMACDValue(indicatorPeriod, 'macd');
    const mfi = this._getValue(indicatorPeriod, 'mfi');

    // Skip if key indicators missing
    if (!bb || !rsi || !macd) {
      return SignalResult.createEmptySignal({});
    }

    const debug = {
      rsi: rsi.toFixed(1),
      bb_pos: ((current.close - bb.lower) / (bb.upper - bb.lower)).toFixed(2),
      macd_h: macd.histogram.toFixed(4),
      cci: cci ? cci.toFixed(1) : 'N/A',
      mfi: mfi ? mfi.toFixed(1) : 'N/A'
    };

    // Entry conditions for mean reversion
    
    // Check if price touched BB edges (extreme position)
    const touchedLower = current.close <= bb.lower * 1.01 && current.close >= bb.lower * 0.99;
    const touchedUpper = current.close >= bb.upper * 0.99 && current.close <= bb.upper * 1.01;
    
    // Check for momentum extremes
    const rsiExtremeLow = rsi < 30;  // Oversold
    const rsiExtremeHigh = rsi > 70; // Overbought
    
    // Check CCI extremes
    const cciExtreme = cci && Math.abs(cci) > 100;
    
    // Check MFI extremes
    const mfiExtreme = mfi && (mfi > 80 || mfi < 20);
    
    // Check MACD
    const macdBullish = macd && macd.histogram > 0;
    const macdBearish = macd && macd.histogram < 0;

    // LONG: BB lower touch + RSI oversold + MACD/CCI/MFI confirmation
    if (touchedLower && rsiExtremeLow && (macdBullish || cciExtreme || mfiExtreme)) {
      debug.signal = 'LONG - Mean Reversion';
      return SignalResult.createSignal('long', debug);
    }

    // SHORT: BB upper touch + RSI overbought + MACD/CCI/MFI confirmation
    if (touchedUpper && rsiExtremeHigh && (macdBearish || cciExtreme || mfiExtreme)) {
      debug.signal = 'SHORT - Mean Reversion';
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
      bb_length: 20,
      bb_offset: 2.0,
      rsi_length: 14,
      stoch_length: 14,
      stoch_k: 3,
      stoch_d: 3,
      cci_length: 20,
      macd_fast: 12,
      macd_slow: 26,
      macd_signal: 9,
      mfi_length: 14
    };
  }

  getBacktestColumns() {
    return [
      { label: 'RSI', value: 'rsi' },
      { label: 'BB Position', value: 'bb_pos' },
      { label: 'MACD', value: 'macd_h' },
      { label: 'CCI', value: 'cci' }
    ];
  }
};
