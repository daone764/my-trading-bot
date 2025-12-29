const c = {
  symbols: []
};

module.exports = c;

// LIVE mode (places orders):
// - Uses `trade.strategies` (trade mode)
// - Uses `trade.balance_percent` sizing (percentage of your tradable balance)
//
// IMPORTANT: Only run this after you have set Coinbase API keys in conf.json:
//   exchanges.coinbase.key / exchanges.coinbase.secret
//
// Run:
//   node index.js trade --instance instance.live.js

['BTC-USD', 'ETH-USD'].forEach(pair => {
  c.symbols.push({
    symbol: pair,
    periods: ['1m', '15m', '1h'],
    exchange: 'coinbase',

    // Optional: keep watch signals as well
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
    ],

    // Trade settings
    trade: {
      // Conservative starter sizing (tune this!).
      // Uses % of your tradable balance.
      balance_percent: 1,

      // Reduce churn: ignore repeated signals within this window.
      signal_slowdown_minutes: 60,

      // Strategies that can trigger actual trade state changes (open/close)
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
    }
  });
});
