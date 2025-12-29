## ETH/USD paper trading (EMA crossover + RSI band)

This is a standalone **paper trading** loop inside the Node bot (the `repo/` project).
It does **not** place live orders.

### 1) Install

From `repo/`:

```bash
npm install
```

### 2) Configure

Copy the env template and edit values if needed:

```bash
copy eth.paper.env.dist .env
```

Important settings (defaults match the spec in `instructions.md`):

- Pair: `PAIR_WHITELIST=ETH/USD`
- Scheduling: `SCHEDULE_CRON=*/15 * * * *` (every 15 minutes)
- Capital model: `TOTAL_CAPITAL_USD=100`, `STAKE_AMOUNT_USD=25`, `MIN_ORDER_USD=20`
- Entry rules: `EMA_SHORT=12`, `EMA_LONG=26`, `RSI_OVERSOLD=30`, `RSI_OVERBOUGHT=70`
- Exit rules: `STOP_LOSS_PERCENT=12`, `TAKE_PROFIT_PERCENT=20`, `TRAILING_STOP_PERCENT=5`
- Fee simulation: `FEE_RATE=...` (set this to your expected Coinbase Advanced fee tier)
- Exchange market data: `EXCHANGE=coinbase` (via CCXT / Coinbase Advanced)

State/log files:

- State: `var/eth_paper_state.json`
- Log: `logs/eth_trades.log`

### 3) Run

From `repo/`:

```bash
node index.js eth-paper --env .env
```

Single tick (fetch candles, make a decision, update state, then exit):

```bash
node index.js eth-paper --env .env --once
```

You should see startup logs, then one immediate tick, then ticks every 15 minutes.

### Live trading

This implementation supports an optional “two-switch” live mode.

Live orders are only allowed when BOTH are true:

- `PAPER_TRADING=false`
- `ENABLE_LIVE_TRADING=true`

For Coinbase Advanced (CCXT `coinbase`), set:

- `COINBASE_API_KEY`
- `COINBASE_API_SECRET`

(`COINBASE_API_PASSWORD` is optional and generally not needed for Coinbase Advanced.)

