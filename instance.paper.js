var c = module.exports = {};

c.symbols = [];

// PAPER mode (signal-only / no real orders):
// - Uses `strategies` (watch mode)
// - Does NOT define `trade.*`, so the bot will not open/close positions.
//
// Run:
//   node index.js trade --instance instance.paper.js

['BTC-USD', 'ETH-USD'].forEach((pair) => {
  c.symbols.push({
    symbol: pair,
    periods: ['1m', '15m', '1h'],
    exchange: 'coinbase',
    state: 'watch',
    strategies: [
      {
        strategy: 'cci',
        options: {
          period: '15m'
        }
      },
      {
        strategy: 'macd',
        options: {
          period: '1h'
        }
      }
    ]
  });
});
