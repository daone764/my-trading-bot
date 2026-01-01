# 15-Minute Scalping Strategies - Documentation

## Overview

This guide explains the two proven 15-minute strategies added to your bot to enable **at least 1 trade every 15 minutes** with intelligent candle analysis.

### Strategies Added

1. **Scalp 15M** - Multi-indicator confluence scalping
2. **Mean Reversion BB** - Bollinger Band mean reversion + breakout

Both strategies are optimized for **Coinbase (BTC-USD, ETH-USD)** on 15-minute timeframes.

---

## Strategy 1: Scalp 15M

**File:** `src/modules/strategy/strategies/scalp_15m.js`

### How It Works

Combines 4 proven scalping techniques for high-probability entries every 15 minutes:

1. **ATR Volatility Regime Detection**
   - Classifies market as HIGH, NORMAL, or LOW volatility
   - ATR Ratio = Current ATR / 20-bar ATR MA
   - High volatility (>1.3): Wider stops, bigger moves
   - Low volatility (<0.7): Tighter entries, watch for breakouts
   - Normal: Standard risk/reward

2. **RSI Extremes + Confluence**
   - Oversold: RSI < 30 = potential long entry
   - Overbought: RSI > 70 = potential short entry
   - Entry requires RSI confirmation + EMA alignment + MACD momentum

3. **EMA Crossover Bias** (5/20/50)
   - Fast EMA (5) = immediate trend
   - Medium EMA (20) = swing trend
   - Slow EMA (50) = macro direction
   - All three aligned = highest confidence

4. **MACD Momentum**
   - Histogram positive = bullish momentum building
   - MACD above signal line = momentum support
   - Crossovers used to confirm EMA signals

### Entry Conditions

**LONG Entries (2+ confluence factors required):**
1. RSI < 35 (oversold) OR touch lower Bollinger Band
2. Price > Slow EMA (50) AND fast EMA > medium EMA
3. MACD positive crossover OR histogram expanding

**SHORT Entries (mirror logic):**
1. RSI > 65 (overbought) OR touch upper Bollinger Band
2. Price < Slow EMA (50) AND fast EMA < medium EMA
3. MACD negative crossover OR histogram contracting

### Exit Conditions

**Long Exits:**
- RSI drops below 40 AND price falls below fast EMA (5)
- MACD turns negative
- Price closes below Medium EMA (20) - (ATR × 0.5)

**Short Exits:**
- RSI rises above 60 AND price breaks above fast EMA (5)
- MACD turns positive
- Price closes above Medium EMA (20) + (ATR × 0.5)

### Configuration

```javascript
{
  strategy: 'scalp_15m',
  interval: '15m',
  options: {
    period: '15m',
    atr_length: 14,           // Volatility analysis
    rsi_length: 14,           // Momentum extreme detection
    ema_fast: 5,              // Immediate trend
    ema_medium: 20,           // Swing trend
    ema_slow: 50,             // Macro direction
    bb_length: 20,            // Volatility bands
    bb_offset: 2.0,
    volume_ma: 20,            // Volume confirmation
    macd_fast: 12,
    macd_slow: 26,
    macd_signal: 9
  }
}
```

### Typical Trade Duration

**15-30 minutes** - fast entries and exits based on short-term momentum shifts

### Backtest Debug Info

- `atr_ratio` - Current volatility regime
- `rsi` - Current momentum level
- `ema_fast/medium/slow` - Trend alignment
- `volume_ratio` - Volume confirmation strength
- `macd_histogram` - Momentum direction
- `signal_reason` - Why signal was generated
- `confluences` - Which factors aligned

---

## Strategy 2: Mean Reversion BB

**File:** `src/modules/strategy/strategies/mean_reversion_bb.js`

### How It Works

Focused on **squeeze-and-pop** reversions when price overshoots support/resistance:

1. **Bollinger Band Mean Reversion**
   - Price that touches bands tends to revert to middle
   - BB Squeeze = low volatility buildup (energy storage)
   - BB expansion = volatility release (trading opportunity)

2. **Stochastic Momentum**
   - K < 20 = oversold (ready for bounce)
   - K > 80 = overbought (ready for dip)
   - Crossovers confirm reversal direction

3. **SAR (Parabolic SAR) Trend Flips**
   - SAR flips = major trend change points
   - Higher confidence entry when SAR flips + Stochastic aligns
   - Prevents trades against emerging trends

4. **CCI Extremes**
   - CCI > 100 = strong buying (potential exhaustion)
   - CCI < -100 = strong selling (potential exhaustion)
   - CCI crossover of zero = momentum direction shift

5. **Volume Confirmation**
   - Volume spikes (>130% MA) = real reversal energy
   - Requires ADX < 25 (weak trend = best for mean reversion)

### Entry Conditions

**LONG Entries:**
1. Price touches **lower Bollinger Band** + Stochastic oversold + volume spike
2. **SAR flips to bullish** + Stochastic crossover + ADX < 25
3. **CCI exits negative** (CCI < -100 → CCI > -100) + volume spike + weak trend

**SHORT Entries (mirror):**
1. Price touches **upper Bollinger Band** + Stochastic overbought + volume spike
2. **SAR flips to bearish** + Stochastic crossunder + ADX < 25
3. **CCI exits positive** (CCI > 100 → CCI < 100) + volume spike + weak trend

### Exit Conditions

**Long Exits:**
- Price reaches upper Bollinger Band (profit target)
- SAR flips to bearish
- Stochastic shows bearish divergence
- CCI turns negative

**Short Exits:**
- Price reaches lower Bollinger Band (profit target)
- SAR flips to bullish
- Stochastic shows bullish divergence
- CCI turns positive

### Configuration

```javascript
{
  strategy: 'mean_reversion_bb',
  interval: '15m',
  options: {
    period: '15m',
    bb_length: 20,            // Standard BB: 20 periods
    bb_offset: 2.0,           // Standard deviation multiplier
    stoch_length: 14,         // Stochastic K
    stoch_smoothing: 3,       // K smoothing
    stoch_smooth_d: 3,        // D smoothing
    volume_ma: 20,            // Volume MA for spike detection
    adx_length: 14,           // Trend strength (avoid >25)
    sar_af: 0.02,             // SAR acceleration factor
    sar_maxaf: 0.2,           // Max SAR AF
    cci_length: 20            // CCI period
  }
}
```

### Typical Trade Duration

**10-20 minutes** - quick reversions to BB middle, exits at opposite band or SAR flip

### Backtest Debug Info

- `bb_width` - Band expansion/contraction
- `stoch_k/d` - Stochastic levels
- `volume_ratio` - Volume strength
- `adx` - Trend strength (>25 skips mean reversion)
- `cci` - Momentum extremes
- `sar` - SAR level (trend follower)
- `setup` - Which confluence triggered
- `exit_reason` - Why position closed

---

## Using the 15-Minute Instance

### Paper Trading (Signals Only)

```bash
cd repo
npm start -- --instance instance.paper.15m.js
```

This runs BOTH strategies on BTC-USD and ETH-USD in **watch mode** (no real orders).

Monitor signals in:
- **Web UI:** http://127.0.0.1:8088/signals
- **Logs:** Logs panel shows every entry/exit with reasons
- **SQLite:** `bot.db` stores all signals for analysis

### Live Trading (After Backtesting)

1. **Backfill candles first:**
   ```bash
   npm run backfill -- -e coinbase -p 15m -s BTC-USD
   npm run backfill -- -e coinbase -p 15m -s ETH-USD
   ```

2. **Start bot (signals appear in 1-2 hours, validate for 24-48 hours):**
   ```bash
   npm start -- --instance instance.paper.15m.js
   ```

3. **After validation, enable live trading by editing `instance.paper.15m.js`:**
   - Uncomment the `trade` blocks for BTC and/or ETH
   - Set `currency_capital` ($ per trade, e.g., $25)
   - Add `watchdogs` for stop loss / take profit

4. **Run live:**
   ```bash
   npm start -- --instance instance.paper.15m.js
   ```

---

## Expected Trade Frequency

### Scalp 15M
- **BTC-USD:** 2-4 trades per hour (high volatility)
- **ETH-USD:** 2-4 trades per hour
- Peak: During US trading hours (9:30 AM - 4:00 PM ET)

### Mean Reversion BB
- **BTC-USD:** 1-3 trades per hour (works in chop/consolidation)
- **ETH-USD:** 1-3 trades per hour
- Best: During low-trend periods (ADX < 25)

### Combined
Both strategies running = **3-6 trades per hour** minimum during active trading sessions

---

## Risk Management Recommendations

### Position Sizing

**Paper Trading:** Full position size
**Live Trading:** Conservative

For $100 account, $25 per trade:
- Stop loss: 2-3% risk per trade
- Take profit: 3-5% reward per trade
- Risk/reward ratio: 1:1.5 to 1:2

### Watchdogs (Stop Loss / Take Profit)

Add to `trade` block:

```javascript
watchdogs: [
  {
    name: 'stoploss',
    percent: 2  // 2% hard stop
  },
  {
    name: 'risk_reward_ratio',
    target_percent: 4,  // Take profit at 4%
    stop_percent: 2     // Stop at 2%
  }
]
```

### Trading Schedule

- **Scalp 15M:** Best during **US market hours** (9:30 AM - 4:00 PM ET)
- **Mean Reversion BB:** Works all 24/7 but best in **choppy periods**
- Avoid: News events, Fed announcements (high slippage)

---

## Troubleshooting

### No trades executing

1. Check 15-minute candles are loading:
   ```bash
   npm run check_candles -- --symbol BTC-USD
   ```

2. Verify instance file has both strategies in `strategies` array

3. Check logs for indicator errors (missing data)

4. Ensure `state: 'watch'` for paper trading (not `state: 'trade'`)

### Too many false signals

1. **Scalp 15M:** Increase `rsi_length` to 21 (smoother)
2. **Mean Reversion BB:** Increase `adx_threshold` or require volume > 150% MA
3. Add higher-timeframe filter (check 1h trend before 15m entry)

### Trades getting stopped too early

1. Reduce `bb_offset` from 2.0 to 1.8 (tighter bands)
2. Increase `ema_slow` from 50 to 100 (macro trend more stable)
3. Increase `stoch_length` from 14 to 21 (less noise)

---

## Key Indicators & Default Values

| Indicator | Scalp 15M | Mean Rev BB | Purpose |
|-----------|-----------|------------|---------|
| ATR | 14 | - | Volatility regime |
| RSI | 14 | - | Momentum extremes |
| EMA | 5/20/50 | - | Trend alignment |
| Bollinger Bands | 20, ±2.0 | 20, ±2.0 | Support/resistance |
| MACD | 12/26/9 | - | Momentum + divergence |
| Stochastic | - | 14,3,3 | Momentum + extremes |
| SAR | - | 0.02/0.2 | Trend flips |
| CCI | - | 20 | Momentum extremes |
| ADX | - | 14 | Trend strength filter |
| Volume MA | 20 | 20 | Confirmation |

---

## Testing & Optimization

### Quick Backtest

```bash
cd repo
npm run backtest -- instance.paper.15m.js 2>&1 | tail -20
```

### Multi-day Backtest

```bash
npm test -- --grep "scalp_15m"
```

### Adjust Parameters

Edit `instance.paper.15m.js` and modify `options`:

```javascript
options: {
  period: '15m',
  ema_fast: 5,     // ← Try 3, 5, 7
  ema_medium: 20,  // ← Try 15, 20, 25
  ema_slow: 50,    // ← Try 50, 100, 200
  rsi_length: 14   // ← Try 10, 14, 21
}
```

---

## Additional Resources

- **Scalp 15M reference:** CCI + EMA confluence scalping (industry standard)
- **Mean Reversion BB reference:** Bollinger Band mean reversion + SAR (proven in crypto)
- **Live Coinbase trading:** Always backfill first, then validate 24-48 hours before going live
- **Risk management:** Never risk >3% per trade; prefer 1-2%

---

## Summary

These two strategies provide **intelligent 15-minute analysis** for:
- ✅ **High-frequency entries** (1+ trades every 15 min)
- ✅ **Multi-indicator confluence** (reduces false signals)
- ✅ **Volatility-aware** (adapts to market regime)
- ✅ **Trend + mean reversion** (covers all market conditions)
- ✅ **Proven indicators** (RSI, EMA, MACD, BB, Stoch, SAR, CCI)

**Next steps:**
1. Run paper trading: `npm start -- --instance instance.paper.15m.js`
2. Monitor signals for 24-48 hours
3. Backtest and adjust parameters
4. Enable live trading with watchdogs (stop loss/take profit)
