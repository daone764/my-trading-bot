const SignalResult = require('../dict/signal_result');

module.exports = class CCI {
  getName() {
    return 'cci';
  }

  buildIndicator(indicatorBuilder, options) {
    if (!options.period) {
      throw new Error('Invalid period');
    }

    indicatorBuilder.add('cci', 'cci', options.period);
    indicatorBuilder.add('ema200', 'ema', options.period, {
      length: 200
    });
  }

  period(indicatorPeriod) {
    const cci = indicatorPeriod.getIndicator('cci');
    const ema200 = indicatorPeriod.getIndicator('ema200');
    const lastSignal = indicatorPeriod.getLastSignal();

    // Guard against insufficient indicator history
    if (!cci || !ema200 || cci.length < 11 || ema200.length < 2) {
      return SignalResult.createEmptySignal();
    }

    // Normalize CCI values (handle both raw numbers and objects with value property)
    const cciValues = cci.map(c => (typeof c === 'object' && c.value !== undefined) ? c.value : c);
    const ema200Values = ema200.map(e => (typeof e === 'object' && e.value !== undefined) ? e.value : e);

    // Always ignore the currently forming candle (use the last closed candle)
    const currentCci = cciValues[cciValues.length - 2];
    const previousCci = cciValues[cciValues.length - 3];
    const currentEma200 = ema200Values[ema200Values.length - 2];

    // Get current price from lookbacks, ignoring the forming candle
    const lookbacks = indicatorPeriod.getLookbacks();
    if (!lookbacks || lookbacks.length < 2) {
      return SignalResult.createEmptySignal();
    }
    const currentPrice = lookbacks[lookbacks.length - 2].close;

    const debug = {
      price: currentPrice,
      cci: currentCci,
      ema200: currentEma200,
      'trigger swing value': null
    };

    // Trend Filter
    const isLongAllowed = currentPrice > currentEma200;
    const isShortAllowed = currentPrice < currentEma200;

    // EXIT LOGIC
    // Exit LONG when: Previous CCI > +100 AND current CCI < +100
    if (lastSignal === 'long' && previousCci > 100 && currentCci < 100) {
      return SignalResult.createSignal('close', { ...debug, reason: 'exit long' });
    }

    // Exit SHORT when: Previous CCI < -100 AND current CCI > -100
    if (lastSignal === 'short' && previousCci < -100 && currentCci > -100) {
      return SignalResult.createSignal('close', { ...debug, reason: 'exit short' });
    }

    // ENTRY LOGIC
    // Get last 10 closed candles (excluding the forming candle)
    const cciLookback = cciValues.slice(-12, -2);

    // LONG: Previous CCI < -100, Current CCI > -100, Lowest CCI in last 10 <= -150
    if (
      isLongAllowed &&
      lastSignal !== 'long' &&
      previousCci < -100 &&
      currentCci > -100
    ) {
      const lowestCci = Math.min(...cciLookback);
      if (lowestCci <= -150) {
        debug['trigger swing value'] = lowestCci;
        return SignalResult.createSignal('long', { ...debug, reason: 'enter long' });
      }
    }

    // SHORT: Previous CCI > +100, Current CCI < +100, Highest CCI in last 10 >= +150
    if (
      isShortAllowed &&
      lastSignal !== 'short' &&
      previousCci > 100 &&
      currentCci < 100
    ) {
      const highestCci = Math.max(...cciLookback);
      if (highestCci >= 150) {
        debug['trigger swing value'] = highestCci;
        return SignalResult.createSignal('short', { ...debug, reason: 'enter short' });
      }
    }

    return SignalResult.createEmptySignal(debug);
  }

  getBacktestColumns() {
    return [
      {
        label: 'cci',
        value: 'cci',
        type: 'oscillator',
        range: [100, -100]
      },
      {
        label: 'ema200',
        value: 'ema200'
      },
      {
        label: 'Swing',
        value: 'trigger swing value'
      }
    ];
  }

  getOptions() {
    return {
      period: '15m'
    };
  }
};

