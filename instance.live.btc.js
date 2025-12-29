var c = module.exports = {};

c.symbols = [];

// LIVE (BTC only): places real orders on Coinbase.
// Budget model: uses `trade.currency_capital = 100` (USD per order) and a weekly slowdown.
// Run: node index.js trade --instance instance.live.btc.js
// Requires: conf.json -> exchanges.coinbase.key/secret

c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m', '15m', '1h'],
  exchange: 'coinbase',

  // Optional: still log/watch signals too
  strategies: [
    { strategy: 'cci', options: { period: '15m' } },
    { strategy: 'macd', options: { period: '1h' } }
  ],

  trade: {
    // Target: ~$100 USD per entry order
    currency_capital: 100,

    // Try to keep it "passive": suppress repeated signals for 7 days.
    // Note: This reduces trading frequency but does not guarantee exactly 1 trade/week.
    signal_slowdown_minutes: 60 * 24 * 7,

    strategies: [
      { strategy: 'cci', options: { period: '15m' } },
      { strategy: 'macd', options: { period: '1h' } }
    ]
  }
});
