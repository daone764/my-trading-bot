var c = module.exports = {};

c.symbols = [];

// PAPER TRADING: Both BTC and ETH with $100 virtual capital each
// Run: node index.js trade --instance instance.paper.both.js

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

// BTC-USD Configuration
c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m', '15m', '1h'],  // Need 1h for MACD regime, 15m for CCI entries
  exchange: 'coinbase',
  state: 'trade',  // ENABLED - will place paper orders
  strategies: [
    { 
      strategy: 'unified_macd_cci', 
      options: { 
        period: '15m',
        macd_fast: 12,
        macd_slow: 26,
        macd_signal: 9,
        hma_length: 9,
        cci_length: 20,
        atr_length: 14
      } 
    }
  ],
  trade: {
    currency_capital: 100,  // $100 per BTC trade
    strategies: [
      { 
        strategy: 'unified_macd_cci', 
        options: { period: '15m' } 
      }
    ]
  }
});

// ETH-USD Configuration
c.symbols.push({
  symbol: 'ETH-USD',
  periods: ['1m', '15m', '1h'],  // Need 1h for MACD regime, 15m for CCI entries
  exchange: 'coinbase',
  state: 'trade',  // ENABLED - will place paper orders
  strategies: [
    { 
      strategy: 'unified_macd_cci', 
      options: { 
        period: '15m',
        macd_fast: 12,
        macd_slow: 26,
        macd_signal: 9,
        hma_length: 9,
        cci_length: 20,
        atr_length: 14
      } 
    }
  ],
  trade: {
    currency_capital: 100,  // $100 per ETH trade
    strategies: [
      { 
        strategy: 'unified_macd_cci', 
        options: { period: '15m' } 
      }
    ]
  }
});

c.webserver = {
  ip: '0.0.0.0',
  port: 8088
};
