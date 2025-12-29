# Crypto DCA Bot - Setup Guide

## Overview

This is a **Dollar-Cost Averaging (DCA) bot** for cryptocurrency investing. It automatically purchases Bitcoin and Ethereum on a weekly schedule using a conservative, long-term investment strategy.

**⚠️ IMPORTANT: This bot is configured for PAPER TRADING only. Do NOT use with live funds without thorough testing.**

## Features

✅ **Automated Weekly Purchases**: Buy $100 worth of crypto every week (50% BTC, 50% ETH)  
✅ **Risk Controls**: Stop-loss and take-profit mechanisms  
✅ **Dry Run Mode**: Test everything safely before going live  
✅ **Detailed Logging**: Track every decision and trade  
✅ **Portfolio Reports**: View your investment performance  
✅ **Testnet Support**: Use sandbox APIs for safe testing  

## Prerequisites

- **Node.js** (v20 or higher recommended)
- **npm** (comes with Node.js)
- **Git** (for cloning the repository)
- A Coinbase account with **Advanced Trade (CDP) API** credentials

## Installation

### 1. Clone the Repository

If you haven't already:

\`\`\`bash
git clone https://github.com/Haehnchen/crypto-trading-bot.git
cd crypto-trading-bot
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

**Note**: You may see warnings about the `tulind` package failing to compile. This is expected and won't affect the DCA functionality since we don't use technical indicators.

### 3. Set Up Environment Configuration

Copy the example environment file:

\`\`\`bash
cp .env.example .env
\`\`\`

Edit the `.env` file with your settings:

\`\`\`bash
notepad .env    # Windows
nano .env       # Linux/Mac
\`\`\`

### 4. Configure API Keys (Testnet Recommended)

#### Coinbase Advanced Trade (CDP)

This workspace's DCA module uses Coinbase Advanced Trade via the `coinbase-api` library.

1. Create a Coinbase Advanced Trade (CDP) API key
2. Ensure the key has trading permissions as needed (never enable withdrawals)
3. Add to your `.env` file:

\`\`\`
COINBASE_API_KEY=your_cdp_key_name
COINBASE_API_SECRET=your_cdp_private_key
EXCHANGE=coinbase
\`\`\`

### 5. Configure Your DCA Strategy

Edit the `.env` file to customize your strategy:

\`\`\`env
# How much to invest per week
DCA_WEEKLY_AMOUNT=100

# Asset allocation (must sum to 100%)
DCA_BTC_PERCENTAGE=50
DCA_ETH_PERCENTAGE=50

# When to execute (cron format)
# Default: Every Monday at 9:00 AM
DCA_SCHEDULE=0 9 * * 1

# Risk controls
RISK_STOP_LOSS_PERCENT=20      # Stop buying if price drops 20%
RISK_TAKE_PROFIT_PERCENT=30    # Pause buying if price rises 30%
\`\`\`

#### Cron Schedule Examples

- `0 9 * * 1` - Every Monday at 9:00 AM
- `0 0 * * 0` - Every Sunday at midnight
- `0 12 * * 3` - Every Wednesday at noon
- `0 9 * * 5` - Every Friday at 9:00 AM

## Usage

### Run Once (Test Mode)

Execute the DCA strategy immediately for testing:

\`\`\`bash
node src/command/dca.js once
\`\`\`

This will:
1. Fetch current prices
2. Check risk controls
3. Simulate purchases (in dry run mode)
4. Log all actions
5. Exit

### Run on Schedule

Start the bot to run on your configured schedule:

\`\`\`bash
node src/command/dca.js schedule
\`\`\`

The bot will:
- Start and wait for the scheduled time
- Execute purchases automatically
- Continue running until you stop it (Ctrl+C)

### View Portfolio Summary

Check your investment performance:

\`\`\`bash
node src/command/dca_summary.js
\`\`\`

This shows:
- Total invested per asset
- Average entry prices
- Current prices
- Unrealized profit/loss
- Purchase history

### Export Report to JSON

\`\`\`bash
node src/command/dca_summary.js export
\`\`\`

Saves a detailed report to `var/portfolio_summary.json`

## How It Works

### Weekly Execution Flow

1. **Schedule Trigger**: Bot wakes up at scheduled time (e.g., Monday 9 AM)

2. **Fetch Prices**: Get current BTC and ETH prices from exchange

3. **Risk Checks**: For each asset, verify:
   - Price hasn't dropped > 20% (stop-loss)
   - Price hasn't risen > 30% (take-profit)
   - Weekly budget not exceeded

4. **Execute Orders**: If checks pass:
   - Place market order for $50 BTC
   - Place market order for $50 ETH
   - Record in history

5. **Log Everything**: Write details to console and log file

6. **Wait**: Go back to sleep until next scheduled time

### Risk Management

#### Stop-Loss (20% default)
If BTC or ETH drops more than 20% from your last purchase price, the bot will **skip** buying that asset this week. This prevents buying into a sharp decline.

#### Take-Profit (30% default)
If BTC or ETH rises more than 30% from your average entry price, the bot will **pause** buying that asset. This prevents overbuying at peaks.

#### Max Exposure
The bot will never invest more than $100 per week (or your configured amount), ensuring you don't accidentally over-invest.

## Safety Features

### 1. Dry Run Mode (Default)

By default, `DRY_RUN=true` is set, which means:
- **No real trades are executed**
- Everything is simulated and logged
- Perfect for testing your configuration
- Your money is completely safe

To see it in action:
\`\`\`bash
node src/command/dca.js once
\`\`\`

### 2. Startup Warnings

Every time the bot starts, it clearly shows:
- Whether dry run mode is enabled
- Your configuration
- Warning messages

### 3. Sanity Checks

Before every order, the bot validates:
- Order size is reasonable
- Amount doesn't exceed limits
- Asset symbols are correct
- Exchange is available

### 4. Detailed Logging

Everything is logged to:
- **Console**: Real-time feedback
- **File**: `logs/trades.log` - permanent record

### 5. Manual Code Change Required for Live Trading

To enable live trading, you must:
1. Edit `src/command/dca.js`
2. Remove the safety check (around line 29)
3. Set `DRY_RUN=false` in `.env`

This prevents accidental live trading.

## File Structure

\`\`\`
crypto-trading-bot/
├── .env                          # Your configuration (DO NOT COMMIT)
├── .env.example                  # Configuration template
├── logs/
│   └── trades.log               # Trade execution logs
├── var/
│   ├── dca_purchase_history.json # Purchase tracking
│   └── portfolio_summary.json    # Exported reports
├── src/
│   ├── dca/
│   │   ├── strategy.js          # Core DCA logic
│   │   ├── risk_manager.js      # Risk controls
│   │   ├── logger.js            # Logging system
│   │   └── scheduler.js         # Cron scheduling
│   └── command/
│       ├── dca.js               # Main command
│       └── dca_summary.js       # Report generator
└── SETUP.md                      # This file
\`\`\`

## Switching from Paper Trading to Live Trading

**⚠️ ONLY DO THIS AFTER EXTENSIVE TESTING!**

### Prerequisites

1. You've run the bot in dry-run mode for several weeks
2. You understand the risk controls
3. You've reviewed all logs
4. You've verified your configuration is correct
5. You're comfortable losing the money you invest

### Steps

1. **Create Production API Keys**
   - Go to Coinbase Advanced Trade (CDP)
   - Create new API credentials
   - **Enable ONLY trading permissions you need**
   - **NEVER enable withdrawal permissions**
   - Whitelist your IP address

2. **Update .env File**
   \`\`\`env
   EXCHANGE=coinbase
   COINBASE_API_KEY=your_cdp_key_name
   COINBASE_API_SECRET=your_cdp_private_key
   \`\`\`

3. **Set DRY_RUN=false**
   \`\`\`env
   DRY_RUN=false
   \`\`\`

4. **Start Small**
   - Begin with a very small weekly amount (e.g., $10)
   - Monitor closely for several weeks
   - Gradually increase to your target amount

## Troubleshooting

### "tulind" package fails to install

This is expected and won't affect DCA functionality. The tulind package is only needed for technical analysis indicators, which we don't use for simple DCA.

### Bot doesn't execute at scheduled time

- Check your cron expression is valid
- Ensure the bot process is running
- Check system clock is correct
- Review logs for errors

### "Invalid API key" error

- Verify API keys are correct in `.env`
- Check you're using the right exchange (testnet vs production)
- Ensure API key has trading permissions
- Try regenerating the API keys

### Orders not executing

- Check if dry run mode is enabled
- Review risk control logs - might be stop-loss or take-profit
- Verify exchange balance is sufficient
- Check exchange status (maintenance, etc.)

## Best Practices

1. **Start with Testnet**: Always test thoroughly before using real money

2. **Monitor Regularly**: Check logs and reports weekly

3. **Keep API Keys Secure**: Never commit `.env` to git, never share keys

4. **Backup Your Data**: The `var/` directory contains your purchase history

5. **Review Risk Controls**: Adjust stop-loss and take-profit based on your risk tolerance

6. **Stay Informed**: Keep up with crypto market news

7. **Don't Over-Invest**: Only invest what you can afford to lose

## FAQ

**Q: How much will this bot make me?**  
A: This bot doesn't guarantee profits. DCA is a strategy for long-term investing, not get-rich-quick trading.

**Q: Can I add more cryptocurrencies?**  
A: Yes, but you'll need to modify the code in `src/dca/strategy.js`.

**Q: What if I miss a week?**  
A: That's fine. The bot will resume the next scheduled time. DCA doesn't require perfect consistency.

**Q: Should I adjust my strategy during a bear market?**  
A: That depends on your investment thesis. DCA works best when you stick to it regardless of market conditions.

**Q: Is this bot production-ready?**  
A: No. It's a foundation that requires additional work for live trading, especially around exchange integration and error handling.

## Support

- Review the logs in `logs/trades.log`
- Check the original bot documentation in the main README.md
- Open an issue on GitHub for bugs

## Disclaimer

**This software is provided "as is" without warranty of any kind. Trading cryptocurrencies involves substantial risk of loss. Only invest what you can afford to lose. The authors are not responsible for any financial losses.**

## License

See LICENSE file in the repository root.
