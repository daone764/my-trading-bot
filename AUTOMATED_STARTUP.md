# 🤖 Automated Bot Startup

This directory now includes **fully automated startup scripts** that handle all initialization automatically!

## ✨ What's Automated

The `start-bot.js` script automatically handles:

1. ✅ **Configuration Check** - Creates conf.json from template if missing
2. ✅ **Database Initialization** - Creates and validates database schema
3. ✅ **Database Repair** - Backs up and recreates corrupted databases
4. ✅ **Instance Validation** - Verifies trading instance file exists
5. ✅ **Bot Startup** - Launches the bot with proper configuration

## 🚀 Quick Start Commands

### Easiest Way (npm scripts):
```bash
npm start              # Default paper trading (15m strategies)
npm run bot            # Same as above
npm run bot:15m        # Paper trading with 15m instance
npm run trade:paper:btc    # BTC paper trading
npm run trade:paper:eth    # ETH paper trading
npm run auto:paper     # Automated paper trading
```

### Direct Script Execution:
```bash
# Default instance (instance.paper.15m.js)
node start-bot.js

# Custom instance
node start-bot.js instance.paper.btc.js
node start-bot.js instance.auto.paper.15m.js
```

### PowerShell (Windows):
```powershell
# Default
.\start-bot.ps1

# Custom instance
.\start-bot.ps1 instance.paper.btc.js
```

## 📊 What You'll See

When you run the automated startup, you'll see:

```
🤖 Crypto Trading Bot - Automated Startup

📋 Checking configuration...
✅ Configuration file found

📊 Checking database...
✅ Database valid (7 tables found)

📝 Checking trading instance...
✅ Using instance: instance.paper.15m.js

🚀 Starting bot...
────────────────────────────────────────────────────────────
Webserver listening on: http://0.0.0.0:8088
```

## 🔧 What Happens Behind the Scenes

### First Time Run:
- Creates `conf.json` from template
- Initializes fresh database with complete schema
- Validates all required tables exist
- Starts bot in paper trading mode

### Subsequent Runs:
- Validates existing configuration
- Checks database integrity
- Repairs/recreates database if corrupted
- Backs up old database before replacing
- Starts bot immediately

### If Database is Corrupted:
```
⚠️  Database corrupted or invalid
🔧 Initializing database...
📦 Old database backed up to: bot.db.backup.1767301847060
✅ Database initialized successfully (7 tables)
```

## 🎯 Trading Modes

All paper instances now default to `state: 'trade'` (not 'watch'):

- **Paper Trading** (`state: 'trade'`) - Simulates real orders, tracks P&L
- **Live Trading** - Use `instance.live.*.js` files (requires API keys)

## 📝 Available Instances

- `instance.paper.15m.js` - 15-minute strategies (scalp + mean reversion)
- `instance.auto.paper.15m.js` - Automated 15m with backfill
- `instance.paper.btc.js` - BTC-focused paper trading
- `instance.paper.eth.js` - ETH-focused paper trading

## 🌐 Web Dashboard

Once bot starts, access dashboard at:
- **http://localhost:8088**

View:
- Real-time signals
- Active positions
- P&L tracking
- Strategy performance
- Market data

## 🛑 Stopping the Bot

Press `Ctrl+C` in terminal to gracefully shutdown.

## 💡 Pro Tips

1. **Always use the automated startup** - Don't manually run `node index.js`
2. **Check the dashboard** - Monitor signals and trades in real-time
3. **Paper trade first** - Test strategies before going live
4. **Review logs** - Check `logs/*.log` for detailed activity

## 🔍 Troubleshooting

### Bot won't start?
```bash
# Check Node version (requires 20+)
node --version

# Reinstall dependencies
npm install
```

### No trades happening?
- ✅ Normal! Strategies wait for specific market conditions
- ✅ Check dashboard for "No entry" messages explaining why
- ✅ Review strategy thresholds in instance file

### Database errors?
- ✅ The automated script handles this automatically
- ✅ It will backup and recreate the database
- ✅ No manual intervention needed

## 📚 Next Steps

1. **Start the bot**: `npm start`
2. **Open dashboard**: http://localhost:8088
3. **Monitor for signals**: Strategies analyze market every 15 minutes
4. **Review performance**: Check trades and P&L in dashboard

Happy trading! 🚀
