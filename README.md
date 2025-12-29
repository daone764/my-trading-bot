# Crypto Trading Bot

[![Build Status](https://github.com/Haehnchen/crypto-trading-bot/actions/workflows/node.js.yml/badge.svg)](https://github.com/Haehnchen/crypto-trading-bot/actions/workflows/node.js.yml)

This workspace is a customized setup of the upstream trading bot, focused on **Coinbase (US-friendly) via CCXT**.

- Main bot: `node index.js trade` using instance presets (BTC-only / ETH-only, paper/live)
- ETH paper bot: `node index.js eth-paper` (EMA crossover + RSI, scheduled)
- Local UI: web dashboard + ETH paper status page

Not financial advice. Crypto trading is risky and you can lose money.

## Features

- Market data + trading via exchange adapters (Coinbase uses CCXT)
- Multi pair support in one instance
- sqlite3 storage for candles, tickers, ...
- Webserver UI
- Strategies + order/risk tooling (stoploss / take-profit / trailing, depending on exchange support)
- Signal browser dashboard for pairs
- Slack and email notification

### Exchange support in THIS workspace

This workspace is configured and documented for **Coinbase**.

- Use `exchange: 'coinbase'` in instance configs
- Credentials live in `conf.json` under `exchanges.coinbase.key` / `exchanges.coinbase.secret`

Other exchanges may exist in the upstream codebase, but are not the focus here and may be restricted depending on your jurisdiction (e.g., Binance in the US).

### Other exchanges (upstream / not our focus)

The underlying project contains adapters for other exchanges (BitMEX, Binance variants, Bybit, etc.).
This workspace does **not** aim to provide US-compliance guidance or guarantee availability.

## Technical stuff and packages

- node.js
- sqlite3
- [technicalindicators](https://github.com/anandanand84/technicalindicators)
- [tulipindicators - tulind](https://tulipindicators.org/list)
- [TA-Lib](https://mrjbq7.github.io/ta-lib/)
- twig
- express
- Bootstrap v4
- Tradingview widgets

## How to use

### Recommended Node version (Windows/VS Code)

This project uses `better-sqlite3` (native SQLite bindings). For the smoothest local dev experience on Windows, use **Node 20 LTS**.

- Recommended: Node **20.x** (see [.nvmrc](.nvmrc))
- If you change Node versions, reinstall dependencies in `repo/` (`npm install`).

### Quickstart (VS Code)

This repo supports selecting an instance config at runtime.

- Paper (signals only):
  - `npm run trade:paper:btc`
  - `npm run trade:paper:eth`
- Live (places real orders, Coinbase keys required):
  - `npm run trade:live:btc`
  - `npm run trade:live:eth`

Or via CLI:

```
node index.js trade --instance instance.paper.btc.js
node index.js trade --instance instance.live.eth.js
```

VS Code debug launchers are provided in [.vscode/launch.json](.vscode/launch.json).

### [optional] Preinstall

The tulip library is used for indicators; which sometimes is having some issues on `npm install` because of code compiling:

Install build tools

```
sudo apt-get install build-essential
```

The nodejs wrapper for tulipindicators is called [Tulip Node (tuind)](https://www.npmjs.com/package/tulind), check out installation instructions there.

Also the build from source is not supporting all nodejs version. It looks like versions <= 10 are working. You can use nodejs 12 if you compiled it once via older version.

### Install packages

```
➜ npm install --production
➜ npm run postinstall
```

Create instance file for pairs and changes

```
cp instance.js.dist instance.js
```

You can also use the provided presets instead of editing `instance.js`:

- Paper presets: `instance.paper.btc.js`, `instance.paper.eth.js`
- Live presets: `instance.live.btc.js`, `instance.live.eth.js`

Provide a configuration with your exchange credentials

```
cp conf.json.dist conf.json
```

For Coinbase (Advanced Trade via CCXT), put credentials here:

- `conf.json` → `exchanges.coinbase.key` / `exchanges.coinbase.secret`

See [COINBASE_SETUP.md](COINBASE_SETUP.md).

Create a new sqlite database use bot.sql scheme to create the tables

```
sqlite3 bot.db < bot.sql
```

Lets start it

```
npm start
```

### Coinbase

Coinbase is supported via **CCXT** (`exchange: 'coinbase'`). Legacy Coinbase Pro is deprecated and is not used.

### ETH paper bot (EMA crossover + RSI)

This repo includes a separate lightweight ETH/USD paper-trading bot.

- Run once:

```
node index.js eth-paper --env .env --once
```

- Run scheduled (every 15 minutes by default):

```
node index.js eth-paper --env .env
```

- Local UI (reads local state/log files):

```
node index.js eth-paper-ui --port 8081
```

Notes:

- The ETH paper bot evaluates the latest **completed candle(s)** on its schedule.
- Log timestamps show both UTC and local time (default `America/New_York`). Override with `LOG_TIMEZONE`.

## How to use: Docker

For initialize the configuration once

```
➜ cp instance.js.dist instance.js && cp conf.json.dist conf.json && sqlite3 bot.db < bot.sql
➜ docker-compose build
➜ docker-compose up -d
```

After this you can use `docker-compose` which will give you a running bot via <http://127.0.0.1:8080>

## Setting Up Telegram Bot

First, you'll need to create a bot for Telegram. Just talk to [BotFather](https://telegram.me/botfather) and follow simple steps until it gives you a token for it.
You'll also need to create a Telegram group, the place where you and crypto-trading-bot will communicate. After creating it, add the bot as administrator (make sure to uncheck "All Members Are Admins").

### Retrieving Chat IDs

Invite `@RawDataBot` to your group and get your group id in sended chat id field

```text
Message
 ├ message_id: 338
 ├ from
 ┊  ├ id: *****
 ┊  ├ is_bot: false
 ┊  ├ first_name: 사이드
 ┊  ├ username: ******
 ┊  └ language_code: en
 ├ chat
 ┊  ├ id: -1001118554477
 ┊  ├ title: Test Group
 ┊  └ type: supergroup
 ├ date: 1544948900
 └ text: A
```

Look for id: -1001118554477 is your chat id (with the negative sign).

### Log messages to Telegram

For example setup, check `conf.json.dist file`, log.telegram section , set chatId, token, level (default is info). Check more options https://github.com/ivanmarban/winston-telegram#readme

## Webserver

Some browser links

- UI: http://127.0.0.1:8080
- Signals: http://127.0.0.1:8080/signals
- Tradingview: http://127.0.0.1:8080/tradingview/BTCUSD
- Backtesting: http://127.0.0.1:8080/backtest
- Order & Pair Management: http://127.0.0.1:8080/pairs

### Security / Authentication

As the webserver provides just basic auth for access you should combine some with eh a https for public server. Here s simple `proxy_pass` for nginx.

```
# /etc/nginx/sites-available/YOURHOST
server {
    server_name YOURHOST;

    location / {
        proxy_pass http://127.0.0.1:8080;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/YOURHOST/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/YOURHOST/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

```

You should also set the listen ip to a local one

```
# config.json
webserver.ip: 127.0.0.1

```

## Web UI

### Dashboard

![Webserver UI](documentation/cryptobot.png 'Webserver UI')

### Trades / Positions / Orders

![Webserver UI](documentation/trades.png 'Trades / Positions / Orders')

### Backtesting

Currently there is a the UI for backtesting

![Webserver UI](documentation/backtest_result.png 'Backtest Result')

### Manual Orders

![Webserver UI](documentation/manual_order.png 'Manual Orders')

## Build In Strategies

Common strategy with indicators are inside, which most of the time are not profitable. See some more advanced strategy in the list below

- [dip_catcher](src/modules/strategy/strategies/dip_catcher/README.md)
- [dca_dipper](src/modules/strategy/strategies/dca_dipper/README.md) - **Long term invest** Dollar-Cost Averaging (DCA) Dip Investor Strategy

Find some example strategies inside [src/modules/strategy/strategies](src/modules/strategy/strategies)

## Custom Strategies

For custom strategies use [var/strategies](var/strategies) folder.

```
# simple file structure
var/strategies/your_strategy.js

# or wrap strategy into any sub folder depth
var/strategies/my_strategy/my_strategy.js
var/strategies/subfolder1/our_strategy/our_strategy.js
```

## Tools / Watchdog

- `order_adjust` Keep open orders in bid / ask of the orderbook in first position

### Watchdog

- `stoploss` provide general stoploss order in percent of entry price (Exchange Order)
- `risk_reward_ratio` Creates Risk Reward order for take profit and stoploss (Exchange Order Limit+Stop)
- `stoploss_watch` Close open position if ticker price falls below the stop percent; use this for exchanges that don't support native stop-loss order types
- `trailing_stop` Use native exchange trailing stop (if supported by the exchange)

```
    'watchdogs': [
        {
            'name': 'stoploss',
            'percent': 3,
        },
        {
            'name': 'risk_reward_ratio',
            'target_percent': 6,
            'stop_percent': 3,
        },
        {
            'name': 'stoploss_watch',
            'stop': 1.2,
        },
        {
            'name': 'trailing_stop',
            'target_percent': 1.2,
            'stop_percent': 0.5
        }
    ],
```

### Tick Interval

Per default every strategy is "ticked" every full minute with a ~10sec time window. If you want to tick every 15 minutes or less see possible examples below.

Supported units are "m" (minute) and "s" (seconds)

```json
{
  "strategies": [
    {
      "strategy": "cci",
      "interval": "15m"
    },
    {
      "strategy": "cci2",
      "interval": "30s"
    },
    {
      "strategy": "cci3",
      "interval": "60m"
    }
  ]
}
```

## Trading

### Capital

To allow the bot to trade you need to give some "playing capital". You can allow to by via asset or currency amount, see examples below.
You should only provide one of them, first wins.

```
    c.symbols.push({
    'symbol': 'BTC-USD',
        'exchange': 'coinbase',
        'trade': {
            'capital': 0.015, // this will buy 0.015 BTC
      'currency_capital': 50,  // this will use 50 USD and buys the equal amount of BTC
      'balance_percent': 75,  // this will use 75% of your exchange tradable balance (if supported by the exchange adapter)
        },
    })
```

### Live Strategy

Every strategy stat should be live must be places inside `trade`.

```json
{
  "trade": {
    "strategies": [
      {
        "strategy": "dip_catcher",
        "interval": "15m",
        "options": {
          "period": "15m"
        }
      }
    ]
  }
}
```

Inside logs, visible via browser ui, you can double check the strategies init process after the application started.

```
[info] Starting strategy intervals
[info] "coinbase" - "ETH-USD" - "trade" - init strategy "dip_catcher" (15m) in 11.628 minutes
[info] "coinbase" - "BTC-USD" - "trade" first strategy run "dip_catcher" now every 15.00 minutes
```

### Full Trade Example

An example `instance.js` which trades can be found inside `instance.js.dist_trade`. Rename it or move the content to you file.

```js
const c = (module.exports = {});

c.symbols = [
  {
    symbol: 'ETH-USD',
    exchange: 'coinbase',
    periods: ['1m', '15m', '1h'],
    trade: {
      currency_capital: 100,
      strategies: [
        {
          strategy: 'dip_catcher',
          interval: '15m',
          options: {
            period: '15m'
          }
        }
      ]
    },
    watchdogs: [
      {
        name: 'risk_reward_ratio',
        target_percent: 3.1,
        stop_percent: 2.1
      }
    ]
  }
];
```

### Margin / Leverage

Coinbase spot trading does not use margin/leverage in this workspace configuration.
The upstream project may include leverage configuration for derivatives exchanges.

## Tools

### Fill data

_outdated_, but there as an automatic filling on startup ~1000 candles from the past (depending on exchange) and continuously fetched when running

```
node index.js backfill -e coinbase -p 1m -s BTC-USD
```

## Signals

### Slack

![Webserver UI](documentation/slack_signals.png 'Slack signals')

## Tests

```
npm test
```

## Related Links

### Trading Bots Inspiration

Other bots with possible design pattern

- https://github.com/DeviaVir/zenbot
- https://github.com/magic8bot/magic8bot
- https://github.com/askmike/gekko
- https://github.com/freqtrade/freqtrade
- https://github.com/Ekliptor/WolfBot
- https://github.com/andresilvasantos/bitprophet
- https://github.com/kavehs87/PHPTradingBot
- https://github.com/Superalgos/Superalgos

### Strategies

Some strategies based on technical indicators for collection some ideas

- https://github.com/freqtrade/freqtrade-strategies
- https://github.com/freqtrade/freqtrade-strategies/tree/master/user_data/strategies/berlinguyinca
- https://github.com/xFFFFF/Gekko-Strategies
- https://github.com/sthewissen/Mynt/tree/master/src/Mynt.Core/Strategies
- https://github.com/Ekliptor/WolfBot/tree/master/src/Strategies
- https://github.com/Superalgos/Strategy-BTC-WeakHandsBuster
- https://github.com/Superalgos/Strategy-BTC-BB-Top-Bounce
