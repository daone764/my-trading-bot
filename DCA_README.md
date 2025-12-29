# 🤖 Crypto DCA Bot Extension

This is a **Dollar-Cost Averaging (DCA)** extension for the [crypto-trading-bot](https://github.com/Haehnchen/crypto-trading-bot) repository. It provides a safe, conservative, automated investment strategy for Bitcoin and Ethereum.

## ✨ What's New

This extension adds:

- **📅 Weekly DCA Automation**: Automatically invest $100/week (50% BTC, 50% ETH)
- **🛡️ Risk Management**: Built-in stop-loss and take-profit controls
- **✅ Dry Run Mode**: Test everything safely before going live
- **📊 Portfolio Tracking**: Detailed reports and performance summaries
- **📝 Comprehensive Logging**: Track every decision and trade
- **🔒 Safety First**: Multiple safety checks and validations

## 🚀 Quick Start

### 1. Install

\`\`\`bash
cd repo
npm install --ignore-scripts dotenv node-cron
\`\`\`

### 2. Configure

Edit `.env` file with your settings:

\`\`\`bash
# Copy example and edit
cp .env.example .env
notepad .env  # Windows
\`\`\`

Add your Coinbase Advanced Trade (CDP) API credentials to `.env`:

- `COINBASE_API_KEY` (API key name)
- `COINBASE_API_SECRET` (private key)
- `EXCHANGE=coinbase`

### 3. Test

\`\`\`bash
# Run once to test
npm run dca:once
\`\`\`

### 4. Start

\`\`\`bash
# Start scheduled weekly execution
npm run dca
\`\`\`

### 5. Check Progress

\`\`\`bash
# View portfolio summary
npm run dca:summary
\`\`\`

## 📁 New Files Added

### DCA Core Modules
- `src/dca/strategy.js` - Main DCA logic
- `src/dca/risk_manager.js` - Risk control system
- `src/dca/logger.js` - Logging system
- `src/dca/scheduler.js` - Cron scheduling

### Commands
- `src/command/dca.js` - CLI interface
- `src/command/dca_summary.js` - Report generator

### Configuration
- `.env` - Your configuration (DO NOT COMMIT!)
- `.env.example` - Configuration template
- `SETUP.md` - Detailed setup guide
- `CONFIG_EXAMPLE.md` - Configuration reference

### Data & Logs
- `logs/trades.log` - Trade execution logs
- `var/dca_purchase_history.json` - Purchase tracking

## 📋 Available Commands

### Run DCA Bot

\`\`\`bash
# Start with weekly schedule
npm run dca

# Execute once and exit
npm run dca:once

# Show help
node src/command/dca.js help
\`\`\`

### View Reports

\`\`\`bash
# Display portfolio summary
npm run dca:summary

# Export summary to JSON
npm run dca:export
\`\`\`

## ⚙️ Configuration

Key settings in `.env`:

| Setting | Default | Description |
|---------|---------|-------------|
| `DRY_RUN` | `true` | Enable dry run mode (safe testing) |
| `DCA_WEEKLY_AMOUNT` | `100` | Total USD to invest per week |
| `DCA_BTC_PERCENTAGE` | `50` | % allocated to Bitcoin |
| `DCA_ETH_PERCENTAGE` | `50` | % allocated to Ethereum |
| `DCA_SCHEDULE` | `0 9 * * 1` | When to run (cron format) |
| `RISK_STOP_LOSS_PERCENT` | `20` | Stop buying if price drops % |
| `RISK_TAKE_PROFIT_PERCENT` | `30` | Pause buying if price rises % |

See [CONFIG_EXAMPLE.md](CONFIG_EXAMPLE.md) for full reference.

## 🛡️ Safety Features

1. **Dry Run Mode (Default)**: All trades are simulated
2. **Manual Override Required**: Code change needed for live trading
3. **Risk Controls**: Automatic stop-loss and take-profit
4. **Sanity Checks**: Validates every order before execution
5. **Detailed Logging**: Everything is tracked and logged
6. **Testnet Support**: Use sandbox APIs for safe testing

## 📊 Example Output

### Bot Execution
\`\`\`
🤖 CRYPTO DCA BOT - SAFE INVESTING 🤖

Configuration:
  Dry Run Mode: ✅ ENABLED (Safe)
  Exchange: coinbase
  Weekly Amount: $100
  BTC Allocation: 50%
  ETH Allocation: 50%

[INFO] === DCA EXECUTION STARTED ===
[INFO] Processing BTC purchase
[INFO] PRICE FETCHED - BTC: $48,436.47
[INFO] RISK CHECK - BTC: All risk checks passed
[INFO] [DRY RUN] TRADE EXECUTED
  Asset: BTC
  Price: $48,436.47
  Amount: $50.00
  Quantity: 0.00103228

[INFO] === DCA EXECUTION COMPLETED ===
✅ 2 trades executed, $100.00 total
\`\`\`

### Portfolio Summary
\`\`\`
CRYPTO DCA BOT - PORTFOLIO SUMMARY

💰 BITCOIN (BTC)
  Total Invested:       $50.00
  Purchase Count:       1
  Average Entry Price:  $48,436.47
  Current Price:        $47,035.10
  Unrealized P/L:       $-1.45 (-2.89%)

📊 PORTFOLIO TOTALS
  Total Invested:       $100.00
  Total Unrealized P/L: $-1.60 (-1.60%)
  Status:               🔴 Loss
\`\`\`

## 🔄 How It Works

### Weekly Execution Flow

1. **Schedule Trigger**: Bot wakes up at scheduled time (e.g., Monday 9 AM)
2. **Fetch Prices**: Get current BTC/ETH prices from exchange
3. **Risk Checks**: Verify stop-loss and take-profit rules
4. **Execute Orders**: Place market orders if checks pass
5. **Log Everything**: Record all decisions and trades
6. **Wait**: Sleep until next scheduled time

### Risk Management

- **Stop-Loss (20%)**: Skip buying if price drops too much
- **Take-Profit (30%)**: Pause buying if price rises too much  
- **Max Exposure**: Never exceed weekly budget

## 📚 Documentation

- **[SETUP.md](SETUP.md)** - Complete setup guide
- **[CONFIG_EXAMPLE.md](CONFIG_EXAMPLE.md)** - Configuration reference
- **[Original README.md](README.md)** - Base bot documentation

## 🔧 Troubleshooting

### "Module not found: dotenv"
\`\`\`bash
npm install --ignore-scripts dotenv node-cron
\`\`\`

### "Invalid cron schedule"
Check your `DCA_SCHEDULE` in `.env`. Use https://crontab.guru/ to validate.

### "Asset allocation must sum to 100%"
Verify `DCA_BTC_PERCENTAGE` + `DCA_ETH_PERCENTAGE` = 100

### Bot doesn't execute at scheduled time
- Ensure bot is running
- Check system clock
- Verify cron expression

## 🎯 Next Steps

1. **Test Thoroughly**: Run with `DRY_RUN=true` for several weeks
2. **Monitor Logs**: Check `logs/trades.log` regularly
3. **Review Reports**: Use `npm run dca:summary` weekly
4. **Adjust Strategy**: Modify `.env` based on your risk tolerance

## ⚠️ Important Notes

- **Not Production Ready**: This is a foundation for live trading
- **No Exchange Integration**: Real trading requires API integration
- **Paper Trading Only**: Use testnet/dry run mode
- **No Warranty**: Use at your own risk

## 🚫 What This Bot DOES NOT Do

- ❌ High-frequency trading
- ❌ Technical analysis
- ❌ Price predictions
- ❌ Leverage/margin trading
- ❌ Get-rich-quick schemes

## ✅ What This Bot DOES

- ✅ Simple dollar-cost averaging
- ✅ Conservative long-term investing
- ✅ Automated weekly purchases
- ✅ Risk management
- ✅ Portfolio tracking

## 📝 Credits

- Base bot: [Haehnchen/crypto-trading-bot](https://github.com/Haehnchen/crypto-trading-bot)
- DCA extension: Custom implementation for safe, automated investing

## 📄 License

Same as the base repository (MIT)

## 🔗 Related Files

- Original bot capabilities: See main [README.md](README.md)
- Technical analysis features: Not used in DCA strategy
- Multiple exchange support: Available in base bot

## 💡 Pro Tips

1. Start with small amounts ($10-50/week)
2. Use testnet extensively before going live
3. Monitor for several weeks before increasing amounts
4. Keep API keys secure (never enable withdrawals)
5. Review logs weekly
6. Adjust risk controls based on volatility
7. Don't panic during market dips - DCA works long-term

---

**Remember**: This is a long-term investment strategy, not a trading bot. DCA works best when you stick to it consistently, regardless of short-term market movements.

**Stay Safe**: Always use testnet/dry run mode first. Only invest what you can afford to lose.
