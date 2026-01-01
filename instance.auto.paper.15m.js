/**
 * 15-Minute Automated Paper Trading Instance
 * 
 * FULLY AUTOMATED PAPER MODE:
 * 1. Backfills candles automatically on startup
 * 2. Generates signals continuously
 * 3. Simulates trades (NO REAL MONEY AT RISK)
 * 4. Validates strategy performance
 * 5. Requires ZERO manual intervention
 * 
 * USE THIS FIRST to validate win rate before going live!
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

// ===== BTC-USD: SCALP 15M STRATEGY (PAPER MODE) =====
c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m', '5m', '15m', '1h'],
  exchange: 'coinbase',
  state: 'trade', // 📊 PAPER MODE: Simulated orders enabled

  // Backfill configuration - runs automatically on startup
  backfill: {
    enabled: true,
    periods: ['15m', '1h', '5m', '1m'],
    days_back: 7  // Load 7 days of history for complete indicator data
  },

  // STRATEGIES: Generate signals continuously (no orders placed)
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
    },
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
  ]
});

// ===== ETH-USD: MEAN REVERSION BB STRATEGY (PAPER MODE) =====
c.symbols.push({
  symbol: 'ETH-USD',
  periods: ['1m', '5m', '15m', '1h'],
  exchange: 'coinbase',
  state: 'trade', // 📊 PAPER MODE: Simulated orders enabled

  // Backfill configuration
  backfill: {
    enabled: true,
    periods: ['15m', '1h', '5m', '1m'],
    days_back: 7
  },

  // STRATEGIES
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
    },
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
  ]
});

module.exports = c;
