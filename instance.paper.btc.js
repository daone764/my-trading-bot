var c = module.exports = {};

c.symbols = [];

// PAPER (BTC only): signal-only / no real orders.
// Run: node index.js trade --instance instance.paper.btc.js

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
  symbol: 'BTC-USD',
  periods: ['1m', '15m', '1h'],  // Need 1h for MACD regime, 15m for CCI entries
  exchange: 'coinbase',
  state: 'trade',  // ENABLED - will place paper orders when conditions are met
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
  ],
  // Paper trading capital - will simulate orders with this amount
  trade: {
    currency_capital: 100,  // $100 per trade
    strategies: [
      { 
        strategy: 'unified_macd_cci', 
        options: { period: '15m' } 
      }
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
