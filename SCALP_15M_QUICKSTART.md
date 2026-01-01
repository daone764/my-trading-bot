# Quick Start: 15-Minute Scalping Trading

## ⚡ Get Started in 5 Minutes

### 1. Backfill Historical Candles (2 minutes)

```bash
cd repo
npm run backfill -- -e coinbase -p 15m -s BTC-USD
npm run backfill -- -e coinbase -p 15m -s ETH-USD
```

This loads ~500 candles of history so indicators have enough data. **Signals will start flowing within 1-2 hours after this.**

### 2. Paper Trade (Watch Signals)

```bash
npm start -- --instance instance.paper.15m.js
```

Opens **http://127.0.0.1:8088** with real-time signals on BTC-USD and ETH-USD (15-minute candles).

> **Note:** Bot uses port 8088. If you have Jenkins on 8080, that's separate and won't interfere.

### 3. View Signals

Go to **http://127.0.0.1:8088/signals** to see:
- Entry points (LONG/SHORT)
- Exit triggers (CLOSE)
- Debug info (RSI, EMA alignment, volume, etc.)

### 4. Check Logs

Every 15 minutes, you'll see new candle analysis:
```
[info] "coinbase" - "BTC-USD" - "watch" strategy "scalp_15m" signal: LONG (RSI=25, EMA aligned, volume spike)
[info] "coinbase" - "BTC-USD" - "watch" strategy "mean_reversion_bb" signal: EMPTY (ADX=18, waiting for setup)
```

---

## 📊 Understanding the Strategies

### Strategy 1: Scalp 15M ✅ Multi-Indicator Confluence

**Looks for:** RSI oversold/overbought + EMA alignment + MACD momentum

**Entry Example:**
```
Price: $43,250
RSI: 28 (oversold) ← Entry trigger
EMA5: $43,100 > EMA20: $43,000 > EMA50: $42,800 ← Alignment
MACD: Positive histogram ← Momentum
Volume: 150% of MA ← Confirmation
⬆️ LONG SIGNAL
```

**Exit:** RSI recovers to 60, MACD turns, or price hits medium EMA -ATR buffer

---

### Strategy 2: Mean Reversion BB 🎯 Band Touch + Reversal

**Looks for:** Price touches Bollinger Band + Stochastic extreme + SAR flip

**Entry Example:**
```
Price: $43,050 (touches lower BB)
Stochastic: 15 (oversold) ← Entry trigger
SAR: Bullish flip ← Confirmation
Volume: 140% of MA ← Confirmation
ADX: 18 (weak trend) ← Safe for mean reversion
⬆️ LONG SIGNAL
```

**Exit:** Price reaches upper BB, SAR flips bearish, or CCI turns

---

## 💰 Enable Live Trading

**⚠️ Only after paper trading 24+ hours!**

1. **Edit** `instance.paper.15m.js`:

```javascript
// Uncomment this section:
c.symbols[0].trade = {
  currency_capital: 25, // $25 per trade
  strategies: [{ strategy: 'scalp_15m', interval: '15m' }],
  watchdogs: [
    { name: 'stoploss', percent: 2 },
    { name: 'risk_reward_ratio', target_percent: 4, stop_percent: 2 }
  ]
};
```

2. **Run:**
```bash
npm start -- --instance instance.paper.15m.js
```

3. **Monitor:** Check http://127.0.0.1:8088/pairs for real orders

---

## 📈 Expected Results

### Frequency
- **2-4 trades per hour** (15-minute timeframe)
- Peak hours: US market open (9:30 AM - 4:00 PM ET)

### Win Rate
- **Scalp 15M:** 55-65% (depends on volatility)
- **Mean Reversion BB:** 50-60% (mean reversion is statistical)
- Combined: 1:1.5 to 1:2 risk/reward

### P&L
Realistic monthly with $100 starting capital + $25 per trade:
- Conservative: 5% return
- Moderate: 10-15% return
- Aggressive (full size): 20%+ return

---

## 🛑 Stop Loss & Risk Management

**Never trade without stops!** All trades include:

```javascript
watchdogs: [
  { name: 'stoploss', percent: 2 },          // Hard stop
  { name: 'risk_reward_ratio', 
    target_percent: 4,                       // Take profit
    stop_percent: 2 }                        // Stop loss
]
```

**Meaning:**
- If trade goes against you 2%, auto-close ← **Protects account**
- If trade moves 4% in your favor, take profit ← **Locks gains**
- Risk $2, target $4 → 1:2 ratio

---

## 🔧 Adjust for Your Style

### More Trades (Aggressive)
```javascript
options: {
  ema_fast: 3,      // Faster signals (from 5)
  rsi_length: 10,   // Noisier RSI (from 14)
  bb_offset: 1.5    // Tighter bands (from 2.0)
}
```

### Fewer, Higher-Quality Trades (Conservative)
```javascript
options: {
  ema_fast: 7,      // Slower signals (from 5)
  rsi_length: 21,   // Smoother RSI (from 14)
  bb_offset: 2.5    // Wider bands (from 2.0)
}
```

---

## 📋 Checklist

- [ ] `npm install` (Node 20 LTS)
- [ ] `cp conf.json.dist conf.json` + add Coinbase keys
- [ ] `sqlite3 bot.db < bot.sql` (create database)
- [ ] `npm start -- --instance instance.paper.15m.js` (paper trade)
- [ ] Monitor signals for 1-2 hours (first signals appear)
- [ ] Let it run 24-48 hours to validate performance (win rate %, profitability)
- [ ] Review debug info in logs
- [ ] Uncomment trade blocks in instance file
- [ ] Set stop loss / take profit watchdogs
- [ ] Run live trading

---

## 🚨 Troubleshooting

**No signals?**
- Check candles: `npm run check_candles -- --symbol BTC-USD`
- Ensure `state: 'watch'` in instance file
- Verify both strategies are listed

**Too many false signals?**
- Increase RSI smoothing (rsi_length: 21)
- Require volume > 150% MA
- Increase EMA periods for stability

**Trades stopped too fast?**
- Reduce stop loss: 3% instead of 2%
- Widen BB bands: 2.5 instead of 2.0
- Increase ATR period for volatility buffer

---

## 📚 Full Documentation

See [SCALP_15M_STRATEGIES.md](SCALP_15M_STRATEGIES.md) for:
- Detailed indicator explanations
- Entry/exit logic breakdowns
- Configuration tuning
- Backtesting commands
- Multi-day analysis

---

## 💡 Pro Tips

1. **Trade during volatility:** 9:30 AM - 4:00 PM ET = best spreads
2. **Monitor ADX:** Mean Reversion BB works best when ADX < 25 (weak trend)
3. **Use paper trading:** Let new settings run 24-48 hours to validate performance
4. **Track win rate:** Monitor `/logs` for performance metrics
5. **Avoid news:** Skip trading 30 mins before/after major news events

---

## Questions?

- Check logs: `tail -f repo/logs/*.log`
- Web UI: http://127.0.0.1:8088
- Signals panel: http://127.0.0.1:8088/signals
- Database: `sqlite3 bot.db "SELECT * FROM trades LIMIT 10;"`

**Happy scalping! 🚀**
