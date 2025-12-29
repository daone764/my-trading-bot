# Configuration Guide

## Environment Variables

This document explains all configuration options for the Crypto DCA Bot.

## Quick Start

Copy `.env.example` to `.env` and edit the values:

\`\`\`bash
cp .env.example .env
\`\`\`

## Configuration Sections

### Safety Settings

#### DRY_RUN
- **Type**: Boolean
- **Default**: `true`
- **Values**: `true` | `false`
- **Description**: When enabled, all trades are simulated only. No real money is used.
- **Important**: Keep this as `true` for testing!

\`\`\`env
DRY_RUN=true
\`\`\`

---

### Exchange Configuration

#### EXCHANGE
- **Type**: String
- **Default**: `coinbase`
- **Values**: `coinbase`
- **Description**: Which exchange to use for the DCA module in this workspace

\`\`\`env
EXCHANGE=coinbase
\`\`\`

#### COINBASE_API_KEY
- **Type**: String
- **Required**: Yes (for live trading)
- **Description**: Coinbase Advanced Trade (CDP) API key name

\`\`\`env
COINBASE_API_KEY=your_cdp_key_name
\`\`\`

#### COINBASE_API_SECRET
- **Type**: String
- **Required**: Yes (for live trading)
- **Description**: Coinbase Advanced Trade (CDP) private key
- **Security**: Never commit this to git!

\`\`\`env
COINBASE_API_SECRET=your_cdp_private_key
\`\`\`

---

### DCA Strategy Configuration

#### DCA_WEEKLY_AMOUNT
- **Type**: Number
- **Default**: `100`
- **Units**: USD
- **Description**: Total amount to invest per week
- **Example**: `100` means $100 per week

\`\`\`env
DCA_WEEKLY_AMOUNT=100
\`\`\`
#### DCA_BTC_PERCENTAGE

#### COINBASE_API_KEY
- **Type**: String
- **Required**: Yes (for live trading)
- **Description**: Coinbase Advanced Trade (CDP) API key name

```env
COINBASE_API_KEY=your_cdp_key_name
```

#### COINBASE_API_SECRET
- **Type**: String
- **Required**: Yes (for live trading)
- **Description**: Coinbase Advanced Trade (CDP) private key
- **Security**: Never commit this to git!

```env
COINBASE_API_SECRET=your_cdp_private_key
```
| Schedule | Description |
|----------|-------------|
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 12 * * 3` | Every Wednesday at noon |
| `0 9 * * 5` | Every Friday at 9:00 AM |
| `30 14 * * 2` | Every Tuesday at 2:30 PM |

**Cron Format**:
\`\`\`
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 7) (0 and 7 are Sunday)
│ │ │ │ │
│ │ │ │ │
* * * * *
\`\`\`

---

### Risk Control Settings

#### RISK_STOP_LOSS_PERCENT
- **Type**: Number
- **Default**: `20`
- **Units**: Percentage
- **Description**: Stop buying if price drops this % from last purchase
- **Example**: `20` means if BTC drops 20%, skip this week's BTC purchase

\`\`\`env
RISK_STOP_LOSS_PERCENT=20
\`\`\`

**Use Cases**:
- `20` = Conservative (halt on 20% drop)
- `30` = Moderate (halt on 30% drop)
- `50` = Aggressive (halt on 50% drop)

**How it works**:
- Bot tracks your last purchase price
- If current price is 20% lower, skip the purchase
- Helps avoid buying into sharp declines
- Resumes when price stabilizes

#### RISK_TAKE_PROFIT_PERCENT
- **Type**: Number
- **Default**: `30`
- **Units**: Percentage
- **Description**: Pause buying if price rises this % from average entry
- **Example**: `30` means if ETH rises 30% above your average cost, pause ETH purchases

\`\`\`env
RISK_TAKE_PROFIT_PERCENT=30
\`\`\`

**Use Cases**:
- `30` = Conservative (pause on 30% gain)
- `50` = Moderate (pause on 50% gain)
- `100` = Aggressive (pause on 100% gain)

**How it works**:
- Bot calculates your average entry price
- If current price is 30% higher, pause purchases
- Helps avoid overbuying at peaks
- Resumes when price comes down

#### RISK_MAX_WEEKLY_USD
- **Type**: Number
- **Default**: `100`
- **Units**: USD
- **Description**: Hard cap on weekly spending (safety limit)
- **Recommendation**: Set equal to or higher than `DCA_WEEKLY_AMOUNT`

\`\`\`env
RISK_MAX_WEEKLY_USD=100
\`\`\`

---

### Logging Configuration

#### LOG_LEVEL
EXCHANGE=coinbase
- **Default**: `info`

#### COINBASE_API_KEY
- **Type**: String
- **Required**: Yes (for live trading)
- **Description**: Coinbase Advanced Trade (CDP) API key name

```env
COINBASE_API_KEY=your_cdp_key_name
```

#### COINBASE_API_SECRET
- **Type**: String
- **Required**: Yes (for live trading)
- **Description**: Coinbase Advanced Trade (CDP) private key
- **Security**: Never commit this to git!

```env
COINBASE_API_SECRET=your_cdp_private_key
```
- **Values**: `market` | `limit`
- **Description**: Type of order to place
- **Recommendation**: Use `market` for DCA (executes immediately)

\`\`\`env
ORDER_TYPE=market
\`\`\`

#### TRADING_MODE
- **Type**: String
- **Default**: `spot`
- **Values**: `spot` | `margin` | `futures`
- **Description**: Trading mode to use
- **Important**: Only `spot` is supported for safe DCA

\`\`\`env
TRADING_MODE=spot
\`\`\`

#### DATABASE_PATH
- **Type**: String
- **Default**: `bot.db`
- **Description**: Path to SQLite database
- **Note**: Used by the original bot, may not be needed for DCA

\`\`\`env
DATABASE_PATH=bot.db
\`\`\`

---

## Configuration Examples

### Example 1: Conservative Weekly DCA

\`\`\`env
DRY_RUN=true
DCA_WEEKLY_AMOUNT=100
DCA_BTC_PERCENTAGE=50
DCA_ETH_PERCENTAGE=50
DCA_SCHEDULE=0 9 * * 1
RISK_STOP_LOSS_PERCENT=15
RISK_TAKE_PROFIT_PERCENT=25
\`\`\`

### Example 2: Aggressive BTC-Heavy Strategy

\`\`\`env
DRY_RUN=true
DCA_WEEKLY_AMOUNT=200
DCA_BTC_PERCENTAGE=80
DCA_ETH_PERCENTAGE=20
DCA_SCHEDULE=0 0 * * 0
RISK_STOP_LOSS_PERCENT=30
RISK_TAKE_PROFIT_PERCENT=50
\`\`\`

### Example 3: Balanced ETH-Focused Strategy

\`\`\`env
DRY_RUN=true
DCA_WEEKLY_AMOUNT=150
DCA_BTC_PERCENTAGE=30
DCA_ETH_PERCENTAGE=70
DCA_SCHEDULE=0 12 * * 3
RISK_STOP_LOSS_PERCENT=20
RISK_TAKE_PROFIT_PERCENT=40
\`\`\`

### Example 4: Testing Configuration

\`\`\`env
DRY_RUN=true
EXCHANGE=coinbase
COINBASE_API_KEY=test_key_name_here
COINBASE_API_SECRET=test_private_key_here
DCA_WEEKLY_AMOUNT=50
DCA_BTC_PERCENTAGE=50
DCA_ETH_PERCENTAGE=50
LOG_LEVEL=debug
LOG_CONSOLE=true
\`\`\`

---

## Validation Rules

The bot will validate your configuration on startup:

1. ✅ `DCA_BTC_PERCENTAGE + DCA_ETH_PERCENTAGE` must equal 100
2. ✅ `DCA_WEEKLY_AMOUNT` must be positive
3. ✅ `DCA_SCHEDULE` must be valid cron syntax
4. ✅ API keys must be present for selected exchange
5. ✅ Stop-loss and take-profit must be positive percentages

---

## Security Best Practices

1. **Never commit `.env` to git**
   - The `.gitignore` file already excludes it
   - Double-check before pushing code

2. **Use environment-specific files**
   - `.env` for local development
   - `.env.production` for live trading (if you dare)

3. **Rotate API keys regularly**
   - Change keys every 3-6 months
   - Immediately if compromised

4. **Restrict API key permissions**
   - Enable only "Spot Trading"
   - NEVER enable withdrawals
   - Whitelist your IP address

5. **Backup your configuration**
   - Keep a secure copy of your `.env` file
   - Store API keys in a password manager

---

## Troubleshooting

### "Asset allocation must sum to 100%"

Your BTC and ETH percentages don't add up:

\`\`\`env
# ❌ Wrong (adds to 90%)
DCA_BTC_PERCENTAGE=40
DCA_ETH_PERCENTAGE=50

# ✅ Correct (adds to 100%)
DCA_BTC_PERCENTAGE=40
DCA_ETH_PERCENTAGE=60
\`\`\`

### "Invalid cron schedule"

Your schedule format is incorrect. Use a cron validator: https://crontab.guru/

\`\`\`env
# ❌ Wrong
DCA_SCHEDULE=every monday at 9am

# ✅ Correct
DCA_SCHEDULE=0 9 * * 1
\`\`\`

### "API key not found"

You forgot to add your API keys:

\`\`\`env
# ❌ Wrong (still has placeholder)
COINBASE_API_KEY=your_cdp_key_name

# ✅ Correct (actual key)
COINBASE_API_KEY=organizations/xxx/apiKeys/yyy
\`\`\`

---

## Getting Help

- Check `SETUP.md` for general setup instructions
- Review `logs/trades.log` for execution details
- Validate your cron schedule at https://crontab.guru/
- Test with `node src/command/dca.js once` before scheduling

---

**Last Updated**: December 2025
