var c = module.exports = {};

c.symbols = [];

// TEST INSTANCE - Uses test_long strategy that always generates signals
c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m'],  // Use 1m for faster testing
  exchange: 'paper_trading',
  state: 'trade',
  strategies: [
    { strategy: 'test_long', options: { period: '1m' } }
  ],
  trade: {
    currency_capital: 100,
    strategies: [
      { strategy: 'test_long', options: { period: '1m' } }
    ]
  }
});
