/**
 * 15-Minute Automated Trading Instance
 * 
 * FULLY AUTOMATED - No manual intervention required:
 * 1. Backfills candles automatically on startup
 * 2. Generates signals continuously
 * 3. Executes trades automatically based on signals
 * 4. Manages stop loss and take profit automatically
 * 
 * Pairs: BTC-USD, ETH-USD (high volatility, tight spreads on Coinbase)
 * Strategy mix: Scalp 15M + Mean Reversion BB
 */

const c = {
  exchange: {
    coinbase: {
      key: process.env.COINBASE_API_KEY,
      secret: process.env.COINBASE_API_SECRET,
      passphrase: process.env.COINBASE_PASSPHRASE
    }
  },
  symbols: []
};

// ===== BTC-USD: SCALP 15M STRATEGY (LIVE TRADING) =====
c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m', '5m', '15m', '1h'],
  exchange: 'coinbase',
  state: 'trade', // 🔥 AUTOMATED TRADING ENABLED
  
  // Backfill configuration - runs automatically on startup
  backfill: {
    enabled: true,
    periods: ['15m', '1h', '5m', '1m'],
    days_back: 7  // Load 7 days of history for complete indicator data
  },

  // LIVE TRADING: Real orders placed automatically
  trade: {
    currency_capital: 25, // $25 per trade (START SMALL, SCALE UP AFTER VALIDATION)
    strategies: [
      {
        strategy: 'scalp_15m',
        interval: '15m',
        options: {
          period: '15m',
          atr_length: 14,
          rsi_length: 14,
          ema_fast: 5,
          ema_medium: 20,
          ema_slow: 50,
          bb_length: 20,
          bb_offset: 2.0,
          volume_ma: 20,
          macd_fast: 12,
          macd_slow: 26,
          macd_signal: 9
        }
      }
    ],
    
    // RISK MANAGEMENT: Automatic stop loss and take profit
    watchdogs: [
      {
        name: 'stoploss',
        percent: 2  // Stop loss at 2% - MANDATORY SAFETY
      },
      {
        name: 'risk_reward_ratio',
        target_percent: 4,  // Take profit at 4% 
        stop_percent: 2     // Stop loss at 2%
      }
    ]
  },

  // ALTERNATIVE: Paper mode for initial testing (comment out trade block above, uncomment below)
  // state: 'watch' // Signals only, no real orders
  // strategies: [{ strategy: 'scalp_15m', interval: '15m', options: {...} }]
});

// ===== ETH-USD: MEAN REVERSION BB STRATEGY (LIVE TRADING) =====
c.symbols.push({
  symbol: 'ETH-USD',
  periods: ['1m', '5m', '15m', '1h'],
  exchange: 'coinbase',
  state: 'trade', // 🔥 AUTOMATED TRADING ENABLED
  
  // Backfill configuration
  backfill: {
    enabled: true,
    periods: ['15m', '1h', '5m', '1m'],
    days_back: 7
  },

  // LIVE TRADING: Real orders placed automatically
  trade: {
    currency_capital: 20, // $20 per trade
    strategies: [
      {
        strategy: 'mean_reversion_bb',
        interval: '15m',
        options: {
          period: '15m',
          bb_length: 20,
          bb_offset: 2.0,
          stoch_length: 14,
          stoch_smoothing: 3,
          stoch_smooth_d: 3,
          volume_ma: 20,
          adx_length: 14,
          sar_af: 0.02,
          sar_maxaf: 0.2,
          cci_length: 20
        }
      }
    ],
    
    // RISK MANAGEMENT
    watchdogs: [
      {
        name: 'stoploss',
        percent: 2  // 2% stop loss
      },
      {
        name: 'risk_reward_ratio',
        target_percent: 3,   // Take profit at 3%
        stop_percent: 2      // Stop loss at 2%
      }
    ]
  }
});

// ===== OPTIONAL: Run both strategies on same pair (more signals) =====
// Uncomment to enable both scalp_15m AND mean_reversion_bb on same pair
/*
c.symbols[0].trade.strategies.push({
  strategy: 'mean_reversion_bb',
  interval: '15m',
  options: {
    period: '15m',
    bb_length: 20,
    bb_offset: 2.0,
    stoch_length: 14,
    stoch_smoothing: 3,
    stoch_smooth_d: 3,
    volume_ma: 20,
    adx_length: 14,
    sar_af: 0.02,
    sar_maxaf: 0.2,
    cci_length: 20
  }
});
*/

module.exports = c;
