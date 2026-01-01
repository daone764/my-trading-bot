# 15-Minute Scalping Bot - Deployment Checklist

## Pre-Launch Checklist

### Prerequisites
- [ ] Node.js 20+ LTS installed (`node --version`)
- [ ] `npm install` completed in `repo/` directory
- [ ] `conf.json` created with Coinbase API credentials
- [ ] `bot.db` initialized (`sqlite3 bot.db < bot.sql`)
- [ ] Web server runs: `npm start -- --instance instance.paper.btc.js`

### New Strategy Files Verified
- [ ] `src/modules/strategy/strategies/scalp_15m.js` exists and has 387 lines
- [ ] `src/modules/strategy/strategies/mean_reversion_bb.js` exists and has 389 lines
- [ ] Both files syntax-valid: `node -c <file.js>`
- [ ] Instance file `instance.paper.15m.js` created with BTC-USD + ETH-USD

### Documentation Ready
- [ ] `SCALP_15M_STRATEGIES.md` (full technical guide) - readable
- [ ] `SCALP_15M_QUICKSTART.md` (quick reference) - readable
- [ ] `SCALP_15M_IMPLEMENTATION_SUMMARY.md` (overview) - readable

---

## Phase 1: Paper Trading (Backfill + 1-2 Hour Signal Startup + 24-48 Hour Validation)

### Backfill Historical Candles (FIRST - do this before starting bot)
```bash
cd repo
npm run backfill -- -e coinbase -p 15m -s BTC-USD
npm run backfill -- -e coinbase -p 15m -s ETH-USD
```
- [ ] Backfill completes without errors
- [ ] ~500 candles of history loaded per pair
- [ ] Now has enough data for indicators to calculate

### Initial Setup
- [ ] Edit `instance.paper.15m.js` if needed (default config works)
- [ ] Verify `state: 'watch'` for all symbols (NOT `state: 'trade'`)
- [ ] Ensure both strategies are in `strategies` array:
  - [ ] `scalp_15m`
  - [ ] `mean_reversion_bb`

### Start Paper Trading
```bash
cd repo
npm start -- --instance instance.paper.15m.js
```

- [ ] Bot starts without errors
- [ ] Web UI loads at http://127.0.0.1:8088
- [ ] Signals panel shows at http://127.0.0.1:8088/signals

### Monitor First 1-2 Hours (Signal Startup)

**After backfill, signals will start appearing within 1-2 hours.** This is normal - indicators need time to lock in.

- [ ] First signal appears within 1-2 hours
- [ ] Check 15-minute candles are loading (should see updates every 15 min)
- [ ] Verify both strategies are evaluating (no "indicator undefined" errors)
- [ ] Watch for signal generation (LONG/SHORT/CLOSE)
- [ ] Review debug info:
  - RSI values (should oscillate 0-100)
  - EMA values (should follow price)
  - MACD histogram (should change sign)
  - Stochastic K/D (should oscillate 0-100)
  - Volume ratio (should vary)

### Monitor 24-48 Hours for Performance Validation

**After getting your first signals, let it run 24-48 hours to validate win rate and performance.**
- [ ] Count total signals: aim for 12-24/day with 2 pairs × 2 strategies
- [ ] Estimate daily trade frequency: 1-6 trades per hour
- [ ] Check signal clustering:
  - Both strategies firing together? = OK
  - Only one strategy? = May need to adjust
- [ ] No repeated signals from same strategy on same bar? = OK
- [ ] Review closed positions (if trading enabled)

### Evaluate Win Rate
```sql
SELECT 
  strategy,
  COUNT(*) as total_trades,
  SUM(CASE WHEN exit_price > entry_price THEN 1 ELSE 0 END) as wins,
  ROUND(100.0 * SUM(CASE WHEN exit_price > entry_price THEN 1 ELSE 0 END) / COUNT(*), 1) as win_rate
FROM trades
WHERE exit_time > datetime('now', '-1 day')
GROUP BY strategy;
```

- [ ] Win rate > 45%? OK to proceed
- [ ] Win rate < 40%? Adjust parameters (see SCALP_15M_STRATEGIES.md)

---

## Phase 2: Parameter Tuning (Optional)

If paper trading shows issues:

### Too Many Signals (Noise)
- [ ] Increase `rsi_length`: 14 → 21
- [ ] Increase `ema_fast`: 5 → 7 or 8
- [ ] Decrease volume confirmation requirement (adjust code)

### Too Few Signals
- [ ] Decrease `rsi_length`: 14 → 10
- [ ] Decrease `ema_fast`: 5 → 3
- [ ] Increase `bb_offset`: 2.0 → 1.5 (tighter bands = more touches)

### High Drawdown
- [ ] Increase `stoch_smoothing`: 3 → 5 (smoother Stochastic)
- [ ] Increase `adx_length`: 14 → 21 (stronger trend filter)
- [ ] Increase ATR period: 14 → 21 (bigger volatility buffer)

### Adjust & Retest
```bash
npm run backtest -- instance.paper.15m.js
```

---

## Phase 3: Backtest Analysis

### Run Backtest
```bash
cd repo
npm run backtest -- instance.paper.15m.js 2>&1 | tee backtest_results.txt
```

- [ ] No errors during backtest
- [ ] Results show in terminal and `backtest_results.txt`

### Review Results

Look for:
- [ ] **Win Rate:** > 50% (aim for 55-65%)
- [ ] **Profit Factor:** > 1.5 (wins ÷ losses)
- [ ] **Max Drawdown:** < 10% (don't lose more than 10%)
- [ ] **Sharpe Ratio:** > 1.0 (better than savings account)
- [ ] **Avg Trade Duration:** 10-30 minutes (expected for 15m scalping)

### If Results Are Poor
- [ ] Review SCALP_15M_STRATEGIES.md confluence requirements
- [ ] Increase minimum volume requirement in code
- [ ] Shift to fewer, higher-quality signals
- [ ] Test on different market conditions (trending vs choppy)

---

## Phase 4: Live Trading Setup (Small Size)

### Enable Live Trading
1. [ ] Edit `instance.paper.15m.js`
2. [ ] Uncomment `c.symbols[0].trade` block (BTC-USD)
3. [ ] Set conservative capital: `currency_capital: 10` (small starting size)

Example:
```javascript
c.symbols[0].trade = {
  currency_capital: 10, // $10 per trade (start small!)
  strategies: [
    {
      strategy: 'scalp_15m',
      interval: '15m'
    }
  ],
  watchdogs: [
    {
      name: 'stoploss',
      percent: 2  // 2% hard stop
    },
    {
      name: 'risk_reward_ratio',
      target_percent: 4,  // Take profit 4%
      stop_percent: 2     // Stop loss 2%
    }
  ]
};
```

### Verify Watchdogs
- [ ] `stoploss`: 2-3% (hard stop if losing)
- [ ] `risk_reward_ratio`: `target_percent` (profit target)
- [ ] `stop_percent`: (stop loss) - should match risk tolerance

### Start Live Trading
```bash
npm start -- --instance instance.paper.15m.js
```

- [ ] Bot starts without errors
- [ ] Web UI shows "LIVE" or "TRADE" mode
- [ ] First signals appear (may take 15 minutes for first candle)

---

## Phase 5: Live Monitoring (First 24 Hours)

### Active Monitoring (First Hour)
- [ ] Watch every trade execution
- [ ] Verify order placed on Coinbase
- [ ] Check order fills at reasonable prices (no slippage surprises)
- [ ] Confirm stop loss is set correctly
- [ ] Monitor P&L in real-time

### Passive Monitoring (Hours 2-24)
- [ ] Check every 1-2 hours
- [ ] Verify no technical errors in logs
- [ ] No unexpected order cancellations?
- [ ] Profit/loss tracking making sense?

### Email/SMS Alerts (Optional)
Add to `conf.json` for trade notifications:
```json
"log": {
  "slack": {
    "token": "xoxb-...",
    "channel_id": "C..."
  }
}
```

---

## Phase 6: Scale Up (After 24-48 Hours Profitable)

### Check Metrics First
- [ ] Win rate > 50%?
- [ ] Max drawdown < 5%?
- [ ] Daily P&L positive?
- [ ] No execution errors or slippage issues?

### Scale Capital
1. [ ] If all metrics good: increase to `currency_capital: 25`
2. [ ] Test for another 24-48 hours
3. [ ] If still profitable: `currency_capital: 50`
4. [ ] Continue only if win rate stays > 50%

### Scale Pairs
- [ ] Running BTC only? Add ETH to second symbol
- [ ] Running one strategy? Optionally add second strategy
- [ ] Example: scalp_15m on BTC + mean_reversion_bb on ETH

### Enable Second Strategy (Example)
```javascript
c.symbols[0].trade = {
  currency_capital: 25,
  strategies: [
    { strategy: 'scalp_15m', interval: '15m' },
    { strategy: 'mean_reversion_bb', interval: '15m' }
  ]
};
```

---

## Ongoing Operations

### Daily Checklist
- [ ] Start bot: `npm start -- --instance instance.paper.15m.js`
- [ ] Check web UI: http://127.0.0.1:8088
- [ ] Monitor signals panel: http://127.0.0.1:8088/signals
- [ ] Review daily P&L in `/logs`

### Weekly Checklist
- [ ] Analyze win rate (target > 50%)
- [ ] Review max drawdown (target < 10% weekly)
- [ ] Check for any error patterns in logs
- [ ] Consider parameter adjustments if:
  - Win rate drops < 45%
  - Max drawdown exceeds 15%
  - Specific strategy underperforming

### Monthly Checklist
- [ ] Run backtest on latest data: `npm run backtest -- instance.paper.15m.js`
- [ ] Compare live P&L to backtest expectations
- [ ] Adjust capital allocation based on performance
- [ ] Review Coinbase API usage/fees
- [ ] Update documentation with any changes

---

## Troubleshooting During Live Trading

### No Trades Executing
```bash
# Check candles exist
npm run check_candles -- --symbol BTC-USD

# Check logs
tail -f repo/logs/trade.log

# Verify instance config
cat instance.paper.15m.js | grep "state:"
```

Should show `state: 'trade'` not `'watch'` for live trading.

### Trades Not Filling
- [ ] Check Coinbase order status in web UI
- [ ] Verify API credentials in `conf.json`
- [ ] Check if market has sufficient volume
- [ ] Verify not trading during low-liquidity times

### Losing Streaks
- [ ] Is win rate still > 45%? (short streaks are normal)
- [ ] Check if market conditions changed (very low volatility?)
- [ ] Consider pausing if drawdown exceeds 15%
- [ ] Review whether to switch to paper mode temporarily

### Stop Loss Not Working
- [ ] Verify watchdog section exists in trade block
- [ ] Check stop loss percent (should be 2-3%)
- [ ] Review logs for "stoploss" trigger
- [ ] Verify Coinbase supports stop orders

---

## Safety Protocols

### Before Trading Real Money
- [ ] Paper-tested for minimum 48 hours ✓
- [ ] Backtested on historical data ✓
- [ ] Win rate verified > 50% ✓
- [ ] Max drawdown acceptable ✓
- [ ] Stop loss configured ✓
- [ ] Take profit configured ✓
- [ ] Capital amount is "safe to lose" ✓

### During Live Trading
- [ ] Never trade more than 2-3% account risk per trade
- [ ] Never trade without stop loss
- [ ] Never change strategy parameters mid-trade
- [ ] Never ignore a losing streak > 5 consecutive losses
- [ ] Always use watchdogs (stop loss + take profit)

### Risk Management Rules (MANDATORY)
```
Rule 1: Never risk more than 2% per trade
Rule 2: Always have a stop loss
Rule 3: Position size = (Account Risk %) / (Stop Loss %)
Rule 4: Take profit is 1.5x-2x your risk
Rule 5: Stop trading if daily loss > 5% account
Rule 6: Paper test ALL changes first
```

---

## Disaster Recovery

### Bot Crashes
```bash
cd repo
npm start -- --instance instance.paper.15m.js
```
- Will resume where it left off
- Trades survive bot restarts
- Check logs for error messages

### Coinbase API Error
- Bot automatically retries failed orders
- Check `conf.json` API credentials
- Verify API key has trading permissions
- Check rate limit (Coinbase has 30 req/sec limit)

### Stuck Open Positions
```sql
-- See open positions
SELECT * FROM trades WHERE exit_time IS NULL;
```
- Manually close in Coinbase UI
- Bot will detect closure in next candle
- Review logs to understand why not auto-closed

### Database Corruption
```bash
# Backup
cp bot.db bot.db.backup

# Reinitialize
sqlite3 bot.db < bot.sql
```

---

## Success Criteria

### Phase 1 (Paper Trading) ✓
- [ ] Running 24-48 hours without errors
- [ ] 12-24 total signals (both strategies combined)
- [ ] No repeated signals per bar
- [ ] All indicator values reasonable
- [ ] Ready for backtest phase

### Phase 2 (Backtesting) ✓
- [ ] Win rate > 50%
- [ ] Profit factor > 1.5
- [ ] Max drawdown < 10%
- [ ] Sharpe ratio > 1.0
- [ ] Ready for small live trading

### Phase 3 (Live Small Size) ✓
- [ ] Executed 5+ trades without errors
- [ ] Win rate > 50%
- [ ] No slippage issues
- [ ] Stops and targets working
- [ ] Ready to scale capital

### Phase 4 (Scale Up) ✓
- [ ] 24-48 hours profitable at higher size
- [ ] Win rate remains > 50%
- [ ] Drawdown controlled
- [ ] Can safely run overnight
- [ ] Ready for normal operation

---

## Expected Timeline

| Phase | Duration | Checklist Items | Go/No-Go |
|-------|----------|-----------------|----------|
| Paper Trading | 24-48 hrs | 15 items | Must pass all |
| Backtest | 1-2 hrs | 6 items | Must pass all |
| Live Small | 24-48 hrs | 8 items | Must pass all |
| Scale Up | 24-48 hrs | 5 items | Must pass all |
| **Total** | **3-7 days** | **34 items** | |

---

## Final Notes

- ✅ All strategies syntax-validated
- ✅ Ready for paper trading immediately
- ✅ Comprehensive documentation provided
- ✅ Risk management built-in
- ✅ Production-grade code

**Remember:** Don't rush to live trading. The 3-7 day timeline is SHORT. Many traders skip steps and lose money. Follow the checklist.

**Happy scalping!** 🚀

---

Generated: 2026-01-01
