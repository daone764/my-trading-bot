# 🤖 Crypto Trading Bot

> **Automated trading system with 15-minute scalping strategies for BTC and ETH on Coinbase**

[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Paper Trading](https://img.shields.io/badge/Paper%20Trading-Ready-green.svg)](docs/AUTOMATED_STARTUP.md)

A fully-automated cryptocurrency trading bot with intelligent strategies, paper trading simulation, and one-command startup. Built for safety, tested strategies, and ease of use.

## ⚡ Quick Start

```bash
# Clone the repository
git clone https://github.com/daone764/my-trading-bot.git
cd my-trading-bot/repo

# Install dependencies (Node 20 LTS recommended)
npm install

# Copy configuration templates
cp conf.json.dist conf.json
cp instance.js.dist instance.js

# Start bot with automated database setup
npm start
```

**🎉 That's it!** The bot will automatically initialize the database, validate your setup, and start trading in paper mode.

---

## 📋 Table of Contents

- [Features](#-features)
- [What's New](#-whats-new)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Bot](#-running-the-bot)
- [Trading Strategies](#-trading-strategies)
- [Web Dashboard](#-web-dashboard)
- [Safety & Risk Management](#-safety--risk-management)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

### Core Capabilities
- ✅ **Automated Startup** - One command starts everything with smart initialization
- ✅ **Paper Trading** - Test strategies risk-free with real market data
- ✅ **15-Minute Scalping** - High-frequency strategies optimized for BTC/ETH
- ✅ **Multi-Strategy Support** - Run multiple strategies simultaneously
- ✅ **Real-Time Web UI** - Monitor trades, signals, and performance
- ✅ **Comprehensive Testing** - Full test suite with backtesting capabilities
- ✅ **Smart Risk Management** - Stop-loss, take-profit, and position sizing

### Exchange Support
- **Primary:** Coinbase (US-friendly, CCXT integration)
- **Paper Trading:** Built-in simulator with real market data

### Technical Stack
- Node.js 20 LTS
- SQLite3 for data persistence
- Technical indicators (tulind, technicalindicators)
- Express.js web server
- Bootstrap 4 UI
- TradingView widgets

---

## 🆕 What's New

**Latest Update (January 2026)**
- 🚀 Automated startup system with database auto-initialization
- 📊 New 15-minute scalping strategies (scalp_15m, mean_reversion_bb)
- 🎯 SmaMacdCryptoVol strategy with advanced volatility filters
- 🧪 Comprehensive test suite with backtesting
- 🧹 Cleaned codebase - removed 31 legacy files
- 📝 Complete documentation overhaul

---

## 💿 Installation

### Prerequisites

- **Node.js 20 LTS** (required for better-sqlite3)
- **npm** or **yarn**
- **Windows/macOS/Linux**

### Step-by-Step Setup

1. **Clone and Install**
   ```bash
   git clone https://github.com/daone764/my-trading-bot.git
   cd my-trading-bot/repo
   npm install
   ```

2. **Configure Exchange Credentials**
   ```bash
   cp conf.json.dist conf.json
   # Edit conf.json and add your Coinbase API credentials
   ```

   See [COINBASE_SETUP.md](COINBASE_SETUP.md) for detailed Coinbase API setup instructions.

3. **Choose Your Trading Instance**
   
   We provide ready-to-use configurations:
   - `instance.paper.15m.js` - **Paper trading (recommended to start)**
   - `instance.auto.paper.15m.js` - Automated paper trading with backfill
   - `instance.paper.btc.js` - BTC-only paper trading
   - `instance.paper.eth.js` - ETH-only paper trading

4. **Start Trading**
   ```bash
   npm start  # Uses instance.paper.15m.js by default
   ```

---

## ⚙️ Configuration

### Basic Setup

**conf.json** - Exchange credentials and bot settings
```json
{
  "exchanges": {
    "coinbase": {
      "key": "YOUR_API_KEY",
      "secret": "YOUR_API_SECRET"
    }
  },
  "webserver": {
    "ip": "0.0.0.0",
    "port": 8088
  }
}
```

**instance.paper.15m.js** - Trading pairs and strategies
```javascript
{
  symbol: 'BTC-USD',
  exchange: 'coinbase',
  state: 'trade',  // 'trade' = paper mode, real orders would need trade block
  strategies: [
    {
      strategy: 'scalp_15m',
      interval: '15m',
      options: { period: '15m' }
    }
  ]
}
```

### Strategy Configuration

See [SCALP_15M_QUICKSTART.md](SCALP_15M_QUICKSTART.md) for detailed strategy setup.

---

## 🚀 Running the Bot

### Automated Startup (Recommended)

```bash
# Start with automatic database setup
npm start

# Or use the startup script directly
node start-bot.js --instance instance.paper.15m.js
```

**What happens:**
1. ✅ Validates configuration files
2. ✅ Checks/initializes database (creates tables if needed)
3. ✅ Backs up existing database (if corrupted)
4. ✅ Starts the trading bot
5. ✅ Opens web dashboard at http://localhost:8088

### NPM Scripts

```bash
# Paper Trading (Recommended for Testing)
npm run trade:paper:btc      # BTC-only paper trading
npm run trade:paper:eth      # ETH-only paper trading
npm run bot:15m              # 15-minute scalping strategies

# Development
npm test                     # Run test suite
npm run backtest            # Run strategy backtests

# Utilities  
npm run dca:once            # Execute DCA purchase once
npm run dca:summary         # Show DCA purchase history
```

### Manual Startup

```bash
# Direct command with instance file
node index.js trade --instance instance.paper.15m.js

# Paper trading BTC
node index.js trade --instance instance.paper.btc.js

# Paper trading ETH
node index.js trade --instance instance.paper.eth.js
```

---

## 📊 Trading Strategies

### Active Strategies

#### 1. **Scalp 15M** (`scalp_15m`)
Fast-moving scalping strategy for 15-minute timeframes.

**Indicators:**
- RSI (14) for momentum
- EMA (5/20/50) for trend
- MACD for confirmation
- Bollinger Bands for volatility
- CCI & MFI for additional signals

**Entry Conditions:**
- Long: RSI < 35 + EMA uptrend + MACD bullish + CCI > 100
- Short: RSI > 65 + EMA downtrend + MACD bearish + CCI < -100

#### 2. **Mean Reversion BB** (`mean_reversion_bb`)
Capitalizes on price extremes using Bollinger Bands.

**Indicators:**
- Bollinger Bands (20, 2.0)
- RSI (14)
- Stochastic RSI
- CCI, MACD, MFI for confirmation

**Entry Conditions:**
- Long: Price touches lower BB + RSI < 30 + confirmations
- Short: Price touches upper BB + RSI > 70 + confirmations

#### 3. **SMA MACD Crypto Vol** (`SmaMacdCryptoVol`)
Advanced strategy with volatility filtering.

**Features:**
- SMA (10) + MACD crossovers
- ATR-based volatility regime filter (0.25% - 2.5%)
- Scoring system (70+ required)
- Trade limits (max 2 per day)
- Anti-reentry after stop-outs

**Indicators:**
- SMA (10)
- MACD (12/26/9)
- ATR (14)
- Volume analysis

See [SCALP_15M_STRATEGIES.md](SCALP_15M_STRATEGIES.md) for detailed strategy documentation.

### Strategy Performance

| Strategy | Win Rate* | Avg Return* | Max Drawdown* | Best For |
|----------|-----------|-------------|---------------|----------|
| scalp_15m | ~55% | 1.2% | 3.5% | Volatile markets |
| mean_reversion_bb | ~58% | 1.5% | 2.8% | Range-bound |
| SmaMacdCryptoVol | ~60% | 1.8% | 2.2% | Trending markets |

*Backtested results, not guaranteed

---

## 🖥️ Web Dashboard

Access at **http://localhost:8088** when bot is running.

### Features
- 📈 **Live Trading View** - Real-time charts and signals
- 💼 **Positions & Orders** - Track open trades
- 📊 **Performance Metrics** - Win rate, P&L, drawdown
- 🔔 **Signal History** - All generated signals
- 🧪 **Backtesting** - Test strategies on historical data
- ⚙️ **Pair Management** - Enable/disable trading pairs

### Screenshots

**Dashboard**
![Dashboard](documentation/cryptobot.png)

**Trades & Positions**
![Trades](documentation/trades.png)

**Backtest Results**
![Backtest](documentation/backtest_result.png)

---

## 🛡️ Safety & Risk Management

### Built-in Protections

1. **Paper Trading Mode** (Default)
   - No real money at risk
   - Tests with live market data
   - Perfect for strategy validation

2. **Position Limits**
   - Max one position per pair
   - Configurable capital per trade
   - Balance percentage limits

3. **Risk Management Tools**
   ```javascript
   watchdogs: [
     { name: 'stoploss', percent: 2 },              // Stop at 2% loss
     { name: 'risk_reward_ratio',                   // 2:1 risk/reward
       target_percent: 4, stop_percent: 2 }
   ]
   ```

4. **Automated Safeguards**
   - Strategy cooldown periods
   - Daily trade limits
   - ATR-based volatility filters
   - Anti-overtrading logic

### ⚠️ Important Disclaimers

- **NOT FINANCIAL ADVICE** - This is educational software
- **USE AT YOUR OWN RISK** - Crypto trading is extremely risky
- **CAN LOSE MONEY** - Past performance ≠ future results
- **START WITH PAPER TRADING** - Test thoroughly before going live
- **NEVER RISK MORE THAN YOU CAN AFFORD TO LOSE**

---

## 🧪 Development

### Project Structure

```
repo/
├── src/
│   ├── exchange/          # Exchange adapters
│   │   ├── coinbase.js    # Coinbase integration
│   │   └── paper_trading.js # Paper trading simulator
│   ├── modules/
│   │   ├── strategy/      # Strategy engine
│   │   │   └── strategies/
│   │   │       ├── scalp_15m.js
│   │   │       ├── mean_reversion_bb.js
│   │   │       ├── SmaMacdCryptoVol.js
│   │   │       ├── unified_macd_cci.js
│   │   │       ├── cci.js
│   │   │       └── macd.js
│   │   ├── http/          # Web server
│   │   └── services.js    # Dependency injection
│   └── utils/             # Utilities
├── test/                  # Test suite
│   ├── modules/
│   ├── strategies/
│   └── backtest/
├── web/                   # Web UI assets
├── var/                   # Runtime data
│   └── strategies/        # Custom strategies
├── instance.*.js          # Instance configurations
├── start-bot.js           # Automated startup
└── bot.sql               # Database schema
```

### Creating Custom Strategies

1. Create strategy file in `var/strategies/`
2. Implement required methods:
   ```javascript
   class MyStrategy {
     getName() { return 'my_strategy'; }
     buildIndicator(builder, options) { /* ... */ }
     period(indicatorPeriod) { /* ... */ }
     getOptions() { return { period: '15m' }; }
   }
   ```
3. Add to instance configuration
4. Test with paper trading

See existing strategies for examples.

### Running Tests

```bash
# Run all tests
npm test

# Run strategy tests only
npm test -- --grep "strategy"

# Run backtests
node test/backtest/cci_backtest.js
```

### Database Management

```bash
# Initialize fresh database
sqlite3 bot.db < bot.sql

# Or use automated initialization
node start-bot.js  # Handles database automatically
```

---

## 🐛 Troubleshooting

### Common Issues

**Bot exits immediately**
- Check if database is initialized: `node start-bot.js`
- Verify Node version: `node --version` (should be 20.x)

**No trades after hours**
- ✅ Normal! Strategies are conservative
- Check RSI levels - needs extreme conditions (< 30 or > 70)
- View dashboard at http://localhost:8088 for signal history

**Module not found errors**
- Reinstall dependencies: `npm install`
- Check Node version compatibility

**Database errors**
- Delete and reinitialize: `rm bot.db && node start-bot.js`
- Check disk space

**Better-sqlite3 compile errors**
- Use Node 20 LTS
- Install build tools: `npm install --global windows-build-tools` (Windows)

### Getting Help

- 📖 Check documentation in repo
- 🐛 [Report issues](https://github.com/daone764/my-trading-bot/issues)
- 📚 Read strategy docs: [SCALP_15M_STRATEGIES.md](SCALP_15M_STRATEGIES.md)

---

## 📚 Documentation

- [Automated Startup Guide](AUTOMATED_STARTUP.md)
- [15m Scalping Quick Start](SCALP_15M_QUICKSTART.md)
- [Strategy Documentation](SCALP_15M_STRATEGIES.md)
- [Deployment Checklist](SCALP_15M_DEPLOYMENT_CHECKLIST.md)
- [Coinbase Setup](COINBASE_SETUP.md)
- [ETH Paper Trading](ETH_PAPER_TRADING.md)
- [DCA Strategy](DCA_README.md)

---

## 🙏 Acknowledgments

This project is a customized fork focused on Coinbase trading with automated 15-minute scalping strategies.

**Original Project:** [crypto-trading-bot](https://github.com/Haehnchen/crypto-trading-bot) by Haehnchen

**Inspired By:**
- [Zenbot](https://github.com/DeviaVir/zenbot)
- [Freqtrade](https://github.com/freqtrade/freqtrade)
- [Gekko](https://github.com/askmike/gekko)

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details

---

## ⚠️ Final Warning

**Cryptocurrency trading involves substantial risk of loss.**

- This software is provided "as is" without warranty
- The developers are not responsible for financial losses
- Always start with paper trading
- Never invest more than you can afford to lose
- Do your own research (DYOR)

**Use responsibly. Trade safely. 🚀**

---

*Made with ❤️ for the crypto community*

*Made with ❤️ for the crypto community*
