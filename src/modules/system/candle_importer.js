const _ = require('lodash');

module.exports = class CandleImporter {
  constructor(candlestickRepository, logger) {
    this.candlestickRepository = candlestickRepository;
    this.logger = logger;
    this.trottle = {};
    this.promises = [];

    setInterval(async () => {
      const candles = Object.values(this.trottle);
      this.trottle = {};

      const promises = this.promises.slice();
      this.promises = [];

      // on init we can have a lot or REST api we can have a lot of candles
      // reduce database locking time by split them
      if (candles.length > 0) {
        if (this.logger) {
          this.logger.info(`CandleImporter: Flushing ${candles.length} throttled candles`);
        }
        
        // Group candles by period for logging
        const byPeriod = {};
        candles.forEach(c => {
          if (!byPeriod[c.period]) byPeriod[c.period] = 0;
          byPeriod[c.period]++;
        });
        if (this.logger) {
          this.logger.info(`CandleImporter: Breakdown: ${JSON.stringify(byPeriod)}`);
        }
        
        for (const chunk of _.chunk(candles, 1000)) {
          await this.insertCandles(chunk);
        }
        
        if (this.logger) {
          this.logger.info(`CandleImporter: Flush complete, resolving ${promises.length} promises`);
        }
      } else {
        if (this.logger && promises.length > 0) {
          this.logger.info(`CandleImporter: No candles to flush, but resolving ${promises.length} promises`);
        }
      }

      promises.forEach(resolve => {
        resolve();
      });
    }, 1000 * 5);
  }

  async insertCandles(candles) {
    try {
      return await this.candlestickRepository.insertCandles(candles);
    } catch (e) {
      console.error('CandleImporter.insertCandles error:', e.message);
      throw e;
    }
  }

  async getLastCandleForSymbol(exchange, symbol, period) {
    return this.candlestickRepository.getLastCandleForSymbol(exchange, symbol, period);
  }

  /**
   * We have spikes in each exchange on possible every full minute, collect them for a time range the candles and fire them at once
   *
   * @param candles
   * @returns {Promise<void>}
   */
  async insertThrottledCandles(candles) {
    const key = candles.length > 0 ? candles[0].exchange + candles[0].symbol + candles[0].period : '?';
    if (this.logger) {
      this.logger.info(`CandleImporter.insertThrottledCandles: Adding ${candles.length} candles to throttle (key prefix: ${key})`);
    }
    
    for (const candle of candles) {
      this.trottle[candle.exchange + candle.symbol + candle.period + candle.time] = candle;
    }

    const { promise, resolve } = this.getPromise();
    this.promises.push(resolve);
    
    if (this.logger) {
      this.logger.info(`CandleImporter.insertThrottledCandles: Promise registered, ${this.promises.length} total promises waiting`);
    }

    return promise;
  }

  /**
   * @private
   */
  getPromise() {
    let resolve;

    const promise = new Promise(res => {
      resolve = res;
    });

    return { promise, resolve };
  }
};
