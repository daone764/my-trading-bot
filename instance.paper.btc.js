var c = module.exports = {};

c.symbols = [];

// PAPER TRADING (BTC only): Simulated orders with real market data
// Run: node index.js trade --instance instance.paper.btc.js
// Features:
// - Fetches real market data from Coinbase (via CCXT)
// - Simulates paper orders without actual API calls
// - Logs all trades to database for backtest analysis
// - Risk-free strategy testing

c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m', '15m', '1h'],  // Fetch multiple timeframes for dashboard charts
  exchange: 'paper_trading',  // Paper trading - simulated orders, real data
  state: 'trade',  // ENABLED - will place simulated orders
  strategies: [
    { strategy: 'cci', options: { period: '1h' } }  // CCI on 1h timeframe
  ],
  trade: {
    currency_capital: 100,  // Simulate $100 per trade
    strategies: [
      { strategy: 'cci', options: { period: '1h' } }  // CCI on 1h timeframe
    ]
  }
});

// =============================================================================
// LEGACY STRATEGIES (disabled - kept for reference)
// =============================================================================
// The independent CCI and MACD strategies are no longer used.
// They have been replaced by the unified strategy above which:
// 1. Only trades in the direction of the MACD-defined regime
// 2. Uses CCI extremes (±150) + crossback (±100) for precise entries
// 3. Implements proper risk management with ATR-based stops
// 4. Has take-profit targets at 1R and 2.5R
// 5. Enforces cooldown after losses
//
// Old config (DO NOT USE):
// strategies: [
//   { strategy: 'cci', options: { period: '15m' } },
//   { strategy: 'macd', options: { period: '1h' } }
// ]
// =============================================================================
