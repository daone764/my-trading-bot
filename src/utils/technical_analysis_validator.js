const Resample = require('./resample');

module.exports = class TechnicalAnalysisValidator {
  isValidCandleStickLookback(lookbackNewestFirst, period) {
    if (lookbackNewestFirst.length === 0) {
      return false;
    }

    if (lookbackNewestFirst.length > 1 && lookbackNewestFirst[0].time < lookbackNewestFirst[1].time) {
      return false;
    }

    // DISABLED VALIDATION - allow all candles regardless of age
    return true;
  }
};
