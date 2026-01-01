var c = module.exports = {};

c.symbols = [];

// PAPER (ETH only): signal-only / no real orders.
// Run: node index.js trade --instance instance.paper.eth.js

// =============================================================================
// UNIFIED STRATEGY CONFIGURATION
// =============================================================================
// This uses the unified_macd_cci strategy which combines:
// - MACD (1h) for regime detection (LONG/SHORT/NONE)
// - CCI (15m) for entry timing with extreme + crossback pattern
// - ATR-based stop loss (1.8 * ATR) and take profits (1R, 2.5R)
// - Volatility filter to avoid high-volatility entries
// - Cooldown period after losses
// =============================================================================

c.symbols.push({
  symbol: 'ETH-USD',
  periods: ['1m', '15m', '1h'],  // Need 1h for MACD regime, 15m for CCI entries
  exchange: 'coinbase',
  state: 'trade',  // 'trade' = paper trading with simulated orders
  strategies: [
    { 
      strategy: 'unified_macd_cci', 
      options: { 
        period: '15m',     // Primary evaluation timeframe
        // MACD parameters (1h regime)
        macd_fast: 12,
        macd_slow: 26,
        macd_signal: 9,
        hma_length: 9,
        // CCI parameters (15m entry)
        cci_length: 20,
        atr_length: 14
      } 
    }
  ]
});
