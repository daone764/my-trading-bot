const ccxt = require('ccxt');

module.exports = class CcxtTrader {
  constructor(exchangeId = 'coinbase', credentials = {}) {
    if (!ccxt[exchangeId]) {
      throw new Error(`Unsupported CCXT exchange: ${exchangeId}`);
    }

    const apiKey = credentials.apiKey || '';
    const secret = credentials.secret || '';
    const password = credentials.password || '';

    // Coinbase Advanced Trade (ccxt `coinbase`) uses apiKey+secret.
    // Some other ccxt exchanges require a password/passphrase.
    if (!apiKey || !secret) {
      throw new Error('Missing CCXT credentials for live trading. Set COINBASE_API_KEY and COINBASE_API_SECRET.');
    }

    this.exchangeId = exchangeId;
    const opts = {
      enableRateLimit: true,
      apiKey,
      secret
    };

    if (password) {
      opts.password = password;
    }

    this.exchange = new ccxt[exchangeId](opts);
  }

  async fetchFreeBalances() {
    const balance = await this.exchange.fetchBalance();

    const usd = balance?.free?.USD;
    const eth = balance?.free?.ETH;

    return {
      usd: typeof usd === 'number' ? usd : undefined,
      eth: typeof eth === 'number' ? eth : undefined
    };
  }

  async buyMarket(symbol, amountBase) {
    return this.exchange.createMarketBuyOrder(symbol, amountBase);
  }

  async sellMarket(symbol, amountBase) {
    return this.exchange.createMarketSellOrder(symbol, amountBase);
  }
};
