var c = module.exports = {};

c.symbols = [];

// PAPER TRADING TEST - Use test_long strategy that always signals
// Run: node index.js trade --instance instance.paper.btc.test.js
// Purpose: Demonstrate paper trading order execution

c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m', '15m', '1h'],
  exchange: 'paper_trading',
  state: 'trade',
  strategies: [
    { strategy: 'test_long', options: {} }  // Test strategy - always signals long
  ],
  trade: {
    currency_capital: 100,  // $100 per trade
    strategies: [
      { strategy: 'test_long', options: {} }  // Always generates long signals
    ]
  }
});
