const ccxt = require('ccxt');

module.exports = class CcxtMarketData {
  constructor(exchangeId = 'coinbase') {
    if (!ccxt[exchangeId]) {
      throw new Error(`Unsupported CCXT exchange: ${exchangeId}`);
    }

    this.exchangeId = exchangeId;
    this.exchange = new ccxt[exchangeId]({ enableRateLimit: true });
  }

  async fetchCandles(pair, timeframe, limit = 300) {
    // CCXT OHLCV format: [ timestamp, open, high, low, close, volume ]
    const rows = await this.exchange.fetchOHLCV(pair, timeframe, undefined, limit);

    return rows
      .map(r => ({
        time: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5])
      }))
      .sort((a, b) => a.time - b.time);
  }
};
