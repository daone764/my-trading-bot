const ExchangeOrder = require('../dict/exchange_order');
const Position = require('../dict/position');
const Ticker = require('../dict/ticker');
const TickerEvent = require('../event/ticker_event');
const moment = require('moment');
const _ = require('lodash');
const ccxt = require('ccxt');
const ExchangeCandlestick = require('../dict/exchange_candlestick');

/**
 * Paper trading mock exchange - simulates orders without real API calls
 * Fetches real market data from Coinbase via CCXT to use actual price feeds
 * This allows full strategy testing with real market conditions
 */
module.exports = class PaperTrading {
  constructor(eventEmitter, logger, candlestickResample, queue, candleImporter) {
    this.eventEmitter = eventEmitter;
    this.logger = logger;
    this.candlestickResample = candlestickResample;
    this.queue = queue;
    this.candleImporter = candleImporter;
    
    this.orders = {}; // orderId -> order mapping
    this.nextOrderId = 1;
    this.positions = {}; // symbol -> position mapping
    this.balances = [];
    this.tickers = {};
    this.symbols = [];
    this.ccxtClient = null;
    this.intervals = [];
  }

  getName() {
    return 'paper_trading';
  }

  start(config, symbols) {
    this.symbols = symbols;
    
    // Initialize CCXT client for public market data (no auth needed)
    this.ccxtClient = new ccxt.coinbase({
      enableRateLimit: true
    });
    
    // Initialize positions
    symbols.forEach(s => {
      this.positions[s.symbol] = {
        exchange: 'paper_trading',
        symbol: s.symbol,
        amount: 0,
        side: null,
        entry_price: null
      };
    });

    // Fetch market data for configured timeframes
    const me = this;
    this.queue.add(async () => {
      try {
        await me.ccxtClient.loadMarkets();
      } catch (e) {
        me.logger.error(`PaperTrading: market load error: ${String(e)}`);
      }
    });

    // Always start ticker polling so strategies can run
    const tickerInterval = setInterval(() => {
      me.queue.add(async () => {
        await me.syncTickers();
      });
    }, 1000 * 10);
    this.intervals.push(tickerInterval);

    // Fetch initial candles for each symbol/timeframe combo
    symbols.forEach(symbol => {
      symbol.periods.forEach(period => {
        me.queue.add(async () => {
          try {
            let ohlcvs;
            try {
              const ccxtSymbol = symbol.symbol.replace('-', '/');
              ohlcvs = await me.ccxtClient.fetchOHLCV(ccxtSymbol, period, undefined, 500);
              me.logger.info(`PaperTrading: Fetched ${ohlcvs.length} candles for ${symbol.symbol} ${period}`);
            } catch (e) {
              me.logger.info(`PaperTrading: candles fetch error: ${JSON.stringify([symbol.symbol, period, String(e)])}`);
              return;
            }

            const ourCandles = ohlcvs.map(candle => {
              return new ExchangeCandlestick(
                'paper_trading',
                symbol.symbol,
                period,
                Math.round(candle[0] / 1000),
                candle[1],
                candle[2],
                candle[3],
                candle[4],
                candle[5]
              );
            });

            me.logger.info(`PaperTrading: Importing ${ourCandles.length} candles for ${symbol.symbol} ${period}`);
            // Fire and forget - don't await the throttle promise for initial data
            me.candleImporter.insertThrottledCandles(ourCandles).catch(e => {
              me.logger.info(`PaperTrading: insertThrottledCandles error for ${symbol.symbol} ${period}: ${String(e)}`);
            });
            me.logger.info(`PaperTrading: Completed importing ${symbol.symbol} ${period}`);
          } catch (e) {
            me.logger.info(`PaperTrading: ERROR in candle queue task for ${symbol ? symbol.symbol : '?'} ${period ? period : '?'}: ${String(e)}`);
          }
        });
      });
    });
  }

  /**
   * Sync tickers from market data
   */
  async syncTickers() {
    const me = this;

    for (const symbol of this.symbols) {
      const botSymbol = symbol.symbol;

      let ticker;
      try {
        const ccxtSymbol = botSymbol.replace('-', '/');
        ticker = await this.ccxtClient.fetchTicker(ccxtSymbol);
      } catch (e) {
        me.logger.debug(`PaperTrading: ticker fetch error: ${JSON.stringify([botSymbol, String(e)])}`);
        continue;
      }

      const bid = ticker && ticker.bid ? ticker.bid : ticker && ticker.last ? ticker.last : undefined;
      const ask = ticker && ticker.ask ? ticker.ask : ticker && ticker.last ? ticker.last : undefined;

      if (!bid || !ask) {
        continue;
      }

      const t = (me.tickers[botSymbol] = new Ticker(me.getName(), botSymbol, moment().format('X'), bid, ask));

      me.eventEmitter.emit('ticker', new TickerEvent(me.getName(), botSymbol, t));
    }
  }

  /**
   * Create an order in paper trading
   * @param {Order} order
   * @returns {Promise<ExchangeOrder>}
   */
  async order(order) {
    const orderId = String(this.nextOrderId++);
    
    const symbol = order.getSymbol();
    const amount = Math.abs(order.getAmount());
    const price = order.getPrice();
    
    // Create simulated order
    const exchangeOrder = new ExchangeOrder(
      orderId,
      symbol,
      order.type || ExchangeOrder.TYPE_LIMIT,
      order.side || 'buy',
      amount,
      price,
      ExchangeOrder.STATUS_OPEN,
      moment().toDate(),
      moment().toDate()
    );
    
    this.orders[orderId] = {
      ...exchangeOrder,
      filled: 0,
      remaining: amount
    };

    this.logger.info(`PaperTrading: Order created: ${JSON.stringify([orderId, symbol, amount, price])}`);

    // Simulate immediate fill
    setTimeout(() => {
      if (orderId in this.orders) {
        this.simulateFill(orderId, amount, price);
      }
    }, 100);

    return exchangeOrder;
  }

  /**
   * Simulate order fill
   */
  simulateFill(orderId, amount, price) {
    if (orderId in this.orders) {
      const order = this.orders[orderId];
      order.status = ExchangeOrder.STATUS_DONE;
      order.filled = amount;
      order.remaining = 0;
      order.trades = [{
        amount: amount,
        price: price,
        timestamp: Date.now()
      }];
      this.logger.info(`PaperTrading: Order filled: ${JSON.stringify([orderId, amount, price])}`);
    }
  }

  /**
   * Find order by ID
   */
  async findOrderById(id) {
    return this.orders[id] || null;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(id) {
    if (id in this.orders) {
      const order = this.orders[id];
      order.status = ExchangeOrder.STATUS_CANCELED;
      return order;
    }
    return null;
  }

  /**
   * Cancel all orders for a symbol
   */
  async cancelAll(symbol) {
    const canceled = [];
    for (const orderId in this.orders) {
      const order = this.orders[orderId];
      if (order.symbol === symbol && order.status === ExchangeOrder.STATUS_OPEN) {
        order.status = ExchangeOrder.STATUS_CANCELED;
        canceled.push(order);
      }
    }
    return canceled;
  }

  /**
   * Update order price
   */
  async updateOrder(id, order) {
    if (id in this.orders) {
      const existing = this.orders[id];
      existing.price = order.price;
      return existing;
    }
    return null;
  }

  /**
   * Get open orders for symbol
   */
  async getOrders(symbol) {
    return Object.values(this.orders).filter(
      o => o.symbol === symbol && o.status === ExchangeOrder.STATUS_OPEN
    );
  }

  /**
   * Get position for symbol
   */
  async getPosition(symbol) {
    return this.positions[symbol] || null;
  }

  /**
   * Get all positions (as Position instances for proper exchange interface)
   */
  async getPositions() {
    const positions = [];
    
    // For paper trading, we just return empty positions since we don't have real balances
    // The PairStateManager will handle position tracking through its own state management
    for (const symbol of this.symbols) {
      const position = this.positions[symbol.symbol];
      if (position && position.amount !== 0) {
        positions.push(
          new Position(
            symbol.symbol,
            position.side || 'long',
            position.amount || 0,
            0,  // profit
            new Date(),
            position.entry_price || 0,
            new Date()
          )
        );
      }
    }
    
    return positions;
  }

  /**
   * Calculate order amount with precision
   */
  calculateAmount(amount, symbol) {
    return parseFloat(amount.toFixed(8));
  }

  /**
   * Calculate price with precision
   */
  calculatePrice(price, symbol) {
    return parseFloat(price.toFixed(2));
  }

  /**
   * Required methods for exchange interface
   */
  getPositionForSymbol(symbol) {
    const pos = this.positions[symbol];
    if (pos && pos.amount !== 0) {
      return new Position(
        symbol,
        pos.side || 'long',
        pos.amount || 0,
        0,  // profit
        new Date(),
        pos.entry_price || 0,
        new Date()
      );
    }
    return null;
  }

  getOrdersForSymbol(symbol) {
    return this.getOrders(symbol);
  }
};
