# 🪙 Coinbase (Advanced Trade) Setup Guide

This bot supports **Coinbase Advanced Trade**.

Note: The legacy "Pro" API is deprecated. This repo uses `coinbase` (CCXT) for the main bot exchange adapter and Coinbase Advanced Trade credentials for the DCA flow.

## 📋 Quick Setup

### Step 1: Create Coinbase API Keys

1. In your Coinbase account, create API keys for Advanced Trade.
2. Enable the minimum permissions you need:
   - ✅ View
   - ✅ Trade (only if you intend to place orders)
   - ❌ Transfer (do not enable)

### Step 2: Configure config files

- In `conf.json`, set your exchange keys under `exchanges.coinbase`:
  - `key`
  - `secret`

- In `.env`, set the exchange used by the DCA tooling:

```env
EXCHANGE=coinbase
COINBASE_API_KEY=your_api_key
COINBASE_API_SECRET=your_api_secret

# Safety defaults
DRY_RUN=true
```

### Step 3: Test with dry run

```bash
npm run dca:once
```

### Step 4: Go live (only when confident)

```env
DRY_RUN=false
```

Then run:

```bash
npm run dca:once
```

## Notes

- Symbol formats vary by module:
  - Main bot exchange configs historically used `BTC-USD` style; the `coinbase` adapter maps this to CCXT `BTC/USD` automatically.
- Monitor logs in `logs/trades.log`.

Need help? Check [SETUP.md](SETUP.md) for general setup.
