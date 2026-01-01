/**
 * 15-Minute High-Frequency Trading Instance
 * 
 * Optimized for scalping strategies that aim for at least 1 trade every 15 minutes
 * Uses proven indicators: RSI, MACD, Bollinger Bands, SAR, Stochastic, CCI
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

// BTC 15m Scalping - Paper Trading (simulated orders)
c.symbols.push({
  symbol: 'BTC-USD',
  periods: ['1m', '5m', '15m', '1h'],
  exchange: 'coinbase',
  state: 'trade', // 'trade' = paper trading with simulated orders
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

// ETH 15m Scalping - Paper Trading (simulated orders)
c.symbols.push({
  symbol: 'ETH-USD',
  periods: ['1m', '5m', '15m', '1h'],
  exchange: 'coinbase',
  state: 'trade', // 'trade' = paper trading with simulated orders
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

// ===== OPTIONAL LIVE TRADING (use with caution) =====
// Uncomment and set trade block to enable REAL ORDERS on Coinbase

/*
// BTC LIVE - Remove comment to enable
c.symbols[0].trade = {
  currency_capital: 25, // $25 per trade
  strategies: [
    {
      strategy: 'scalp_15m',
      interval: '15m',
      options: { period: '15m', atr_length: 14, rsi_length: 14 }
    }
  ],
  watchdogs: [
    {
      name: 'stoploss',
      percent: 2 // 2% stop loss
    },
    {
      name: 'risk_reward_ratio',
      target_percent: 3, // Take profit at 3%
      stop_percent: 2
    }
  ]
};

// ETH LIVE
c.symbols[1].trade = {
  currency_capital: 20, // $20 per trade
  strategies: [
    {
      strategy: 'mean_reversion_bb',
      interval: '15m',
      options: { period: '15m', bb_length: 20, bb_offset: 2.0 }
    }
  ],
  watchdogs: [
    {
      name: 'stoploss',
      percent: 2
    }
  ]
};
*/

module.exports = c;
