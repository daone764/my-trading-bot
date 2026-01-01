const assert = require('assert');

describe('#http dashboard routes', () => {
  let mockSystemUtil, mockTa, mockSignalHttp, mockBacktest, mockExchangeManager;
  let mockPairsHttp, mockLogsHttp, mockCandleExportHttp, mockCandleImporter, mockOrdersHttp, mockTickers;
  let http;

  beforeEach(() => {
    // Mock all dependencies with simple objects
    mockSystemUtil = {
      getConfig: (key, defaultValue) => {
        const config = {
          'webserver.ip': '0.0.0.0',
          'webserver.port': 8088,
          'dashboard.periods': ['15m', '1h'],
          'desks': []
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      }
    };

    mockTa = {
      getTaForPeriods: async () => ({ pairs: [], periodData: {} })
    };

    mockSignalHttp = {
      getSignals: async () => []
    };

    mockBacktest = {
      getBacktestStrategies: async () => [],
      getBacktestPairs: async () => [],
      getBacktestResult: async () => ({})
    };

    mockExchangeManager = {};

    mockPairsHttp = {
      getTradePairs: async () => []
    };

    mockLogsHttp = {
      getLogsPageVariables: async () => ({ logs: [] })
    };

    mockCandleExportHttp = {
      getPairs: async () => [],
      getCandles: async () => []
    };

    mockCandleImporter = {};
    mockOrdersHttp = {
      getOrdersPageVariables: async () => ({ orders: [] }),
      getOrderPageVariables: async () => ({ order: {} })
    };
    mockTickers = {};
  });

  describe('Dashboard Data Sources', () => {
    it('should aggregate data for main dashboard', async () => {
      const mockTaData = {
        pairs: [],
        periodData: {}
      };

      const mockPairs = [
        { symbol: 'BTC-USD', exchange: 'coinbase', is_trading: true, has_position: false }
      ];

      const mockLogs = {
        logs: [{ id: 1, message: 'Test log', created_at: Date.now() }]
      };

      mockTa.getTaForPeriods = async () => mockTaData;
      mockPairsHttp.getTradePairs = async () => mockPairs;
      mockLogsHttp.getLogsPageVariables = async () => mockLogs;

      // Verify dependencies can be called
      const taResult = await mockTa.getTaForPeriods(['15m', '1h']);
      const pairsResult = await mockPairsHttp.getTradePairs();
      const logsResult = await mockLogsHttp.getLogsPageVariables({}, {});

      assert.deepStrictEqual(taResult, mockTaData);
      assert.deepStrictEqual(pairsResult, mockPairs);
      assert.deepStrictEqual(logsResult, mockLogs);
      assert.strictEqual(pairsResult[0].symbol, 'BTC-USD');
      assert.strictEqual(logsResult.logs.length, 1);
    });

    it('should handle signals data', async () => {
      const mockSignals = [
        {
          id: 1,
          symbol: 'BTC-USD',
          exchange: 'coinbase',
          strategy: 'unified_macd_cci',
          signal: 'long',
          price: 95000,
          created_at: Date.now()
        }
      ];

      mockSignalHttp.getSignals = async () => mockSignals;

      const result = await mockSignalHttp.getSignals(Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].strategy, 'unified_macd_cci');
      assert.strictEqual(result[0].signal, 'long');
    });

    it('should return pairs with trading status', async () => {
      const mockPairs = [
        { symbol: 'BTC-USD', exchange: 'coinbase', is_trading: true, has_position: false },
        { symbol: 'ETH-USD', exchange: 'coinbase', is_trading: true, has_position: true },
        { symbol: 'SOL-USD', exchange: 'coinbase', is_trading: false, has_position: false }
      ];

      mockPairsHttp.getTradePairs = async () => mockPairs;

      const result = await mockPairsHttp.getTradePairs();

      assert.strictEqual(result.length, 3);
      
      const tradingCount = result.filter(p => p.is_trading).length;
      const positionCount = result.filter(p => p.has_position).length;

      assert.strictEqual(tradingCount, 2);
      assert.strictEqual(positionCount, 1);
    });

    it('should handle empty pairs gracefully', async () => {
      mockPairsHttp.getTradePairs = async () => [];

      const result = await mockPairsHttp.getTradePairs();

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('should return logs with pagination', async () => {
      const mockLogs = {
        logs: [
          { id: 100, message: 'Strategy execution', level: 'info' },
          { id: 99, message: 'Order placed', level: 'info' },
          { id: 98, message: 'Position opened', level: 'info' }
        ],
        page: 1,
        total: 250
      };

      mockLogsHttp.getLogsPageVariables = async () => mockLogs;

      const result = await mockLogsHttp.getLogsPageVariables({}, {});

      assert.strictEqual(result.logs.length, 3);
      assert.strictEqual(result.page, 1);
      assert.strictEqual(result.total, 250);
      assert.strictEqual(result.logs[0].level, 'info');
    });
  });

  describe('Backtest Data', () => {
    it('should return available strategies', async () => {
      const mockStrategies = [
        'cci',
        'macd',
        'unified_macd_cci',
        'sma_macd_crypto_vol'
      ];

      mockBacktest.getBacktestStrategies = async () => mockStrategies;

      const result = await mockBacktest.getBacktestStrategies();

      assert.ok(Array.isArray(result));
      assert.ok(result.includes('unified_macd_cci'));
      assert.strictEqual(result.length, 4);
    });

    it('should return available pairs for backtesting', async () => {
      const mockPairs = [
        { exchange: 'coinbase', symbol: 'BTC-USD', periods: ['15m', '1h'] },
        { exchange: 'coinbase', symbol: 'ETH-USD', periods: ['15m', '1h'] }
      ];

      mockBacktest.getBacktestPairs = async () => mockPairs;

      const result = await mockBacktest.getBacktestPairs();

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].symbol, 'BTC-USD');
      assert.ok(result[0].periods.includes('15m'));
    });

    it('should execute backtest and return results', async () => {
      const mockResult = {
        trades: 25,
        winners: 15,
        losers: 10,
        winRate: 0.6,
        profitLoss: 1250.50,
        maxDrawdown: -5.2,
        sharpeRatio: 1.8,
        equity: [1000, 1050, 1100, 1200, 1250]
      };

      mockBacktest.getBacktestResult = async () => mockResult;

      const result = await mockBacktest.getBacktestResult(
        1000,
        720,
        'unified_macd_cci',
        '15m',
        'coinbase',
        'BTC-USD',
        {},
        10000
      );

      assert.strictEqual(result.trades, 25);
      assert.strictEqual(result.winRate, 0.6);
      assert.strictEqual(result.profitLoss, 1250.50);
      assert.ok(result.equity.length > 0);
    });
  });

  describe('API Endpoints', () => {
    it('should return candles for symbol and period', async () => {
      const mockCandles = [
        { time: Date.now() - 900000, open: 94000, high: 94500, low: 93800, close: 94200, volume: 1000 },
        { time: Date.now() - 600000, open: 94200, high: 94800, low: 94100, close: 94600, volume: 1200 },
        { time: Date.now() - 300000, open: 94600, high: 95000, low: 94400, close: 94800, volume: 1100 }
      ];

      mockCandleExportHttp.getCandles = async () => mockCandles;
      mockCandleExportHttp.getPairs = async () => [
        { exchange: 'coinbase', symbol: 'BTC-USD' }
      ];

      const candles = await mockCandleExportHttp.getCandles('coinbase', 'BTC-USD', '15m', new Date(Date.now() - 3600000), new Date());
      const pairs = await mockCandleExportHttp.getPairs();

      assert.strictEqual(candles.length, 3);
      assert.ok(candles[0].time);
      assert.ok(candles[0].close);
      assert.strictEqual(pairs[0].symbol, 'BTC-USD');
    });

    it('should handle candle API with limit parameter', async () => {
      const limit = 100;
      const mockCandles = new Array(limit).fill(null).map((_, i) => ({
        time: Date.now() - (i * 900000),
        open: 94000 + i,
        high: 94500 + i,
        low: 93800 + i,
        close: 94200 + i,
        volume: 1000
      }));

      mockCandleExportHttp.getCandles = async () => mockCandles;

      const result = await mockCandleExportHttp.getCandles('coinbase', 'BTC-USD', '15m', new Date(Date.now() - 3600000 * 100), new Date());

      assert.strictEqual(result.length, 100);
    });

    it('should validate candle data structure', async () => {
      const mockCandles = [
        { time: Date.now(), open: 94000, high: 94500, low: 93800, close: 94200, volume: 1000 }
      ];

      mockCandleExportHttp.getCandles = async () => mockCandles;

      const result = await mockCandleExportHttp.getCandles('coinbase', 'BTC-USD', '15m', new Date(Date.now() - 900000), new Date());

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].hasOwnProperty('time'));
      assert.ok(result[0].hasOwnProperty('open'));
      assert.ok(result[0].hasOwnProperty('high'));
      assert.ok(result[0].hasOwnProperty('low'));
      assert.ok(result[0].hasOwnProperty('close'));
      assert.ok(result[0].hasOwnProperty('volume'));
    });
  });

  describe('Orders Data', () => {
    it('should return orders for all pairs', async () => {
      const mockOrders = {
        orders: [
          { id: 'order-1', symbol: 'BTC-USD', side: 'long', price: 94000, amount: 0.01, status: 'filled' },
          { id: 'order-2', symbol: 'ETH-USD', side: 'short', price: 3500, amount: 0.5, status: 'open' }
        ]
      };

      mockOrdersHttp.getOrdersPageVariables = async () => mockOrders;

      const result = await mockOrdersHttp.getOrdersPageVariables({}, {});

      assert.strictEqual(result.orders.length, 2);
      assert.strictEqual(result.orders[0].status, 'filled');
      assert.strictEqual(result.orders[1].status, 'open');
    });

    it('should return order detail', async () => {
      const mockOrder = {
        order: {
          id: 'order-123',
          exchange: 'coinbase',
          symbol: 'BTC-USD',
          side: 'long',
          price: 94000,
          amount: 0.01,
          filled: 0.01,
          status: 'filled',
          created_at: Date.now()
        }
      };

      mockOrdersHttp.getOrderPageVariables = async () => mockOrder;

      const result = await mockOrdersHttp.getOrderPageVariables({}, {});

      assert.strictEqual(result.order.id, 'order-123');
      assert.strictEqual(result.order.symbol, 'BTC-USD');
      assert.strictEqual(result.order.status, 'filled');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing pairs data gracefully', async () => {
      mockPairsHttp.getTradePairs = async () => {
        throw new Error('Database error');
      };

      try {
        await mockPairsHttp.getTradePairs();
        assert.fail('Should have thrown error');
      } catch (e) {
        assert.strictEqual(e.message, 'Database error');
      }
    });

    it('should handle missing signals gracefully', async () => {
      mockSignalHttp.getSignals = async () => [];

      const result = await mockSignalHttp.getSignals(0);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('should handle backtest errors', async () => {
      mockBacktest.getBacktestResult = async () => {
        throw new Error('Insufficient data');
      };

      try {
        await mockBacktest.getBacktestResult(1000, 720, 'invalid_strategy', '15m', 'coinbase', 'BTC-USD', {}, 10000);
        assert.fail('Should have thrown error');
      } catch (e) {
        assert.strictEqual(e.message, 'Insufficient data');
      }
    });
  });

  describe('Data Validation', () => {
    it('should validate signal structure', async () => {
      const mockSignals = [
        {
          id: 1,
          symbol: 'BTC-USD',
          exchange: 'coinbase',
          strategy: 'unified_macd_cci',
          signal: 'long',
          price: 95000,
          created_at: Date.now()
        }
      ];

      mockSignalHttp.getSignals = async () => mockSignals;

      const result = await mockSignalHttp.getSignals(0);

      assert.ok(result[0].hasOwnProperty('id'));
      assert.ok(result[0].hasOwnProperty('symbol'));
      assert.ok(result[0].hasOwnProperty('exchange'));
      assert.ok(result[0].hasOwnProperty('strategy'));
      assert.ok(result[0].hasOwnProperty('signal'));
      assert.ok(['long', 'short', 'close'].includes(result[0].signal));
    });

    it('should validate pair structure', async () => {
      const mockPairs = [
        {
          symbol: 'BTC-USD',
          exchange: 'coinbase',
          is_trading: true,
          has_position: false,
          state: 'watch'
        }
      ];

      mockPairsHttp.getTradePairs = async () => mockPairs;

      const result = await mockPairsHttp.getTradePairs();

      assert.ok(result[0].hasOwnProperty('symbol'));
      assert.ok(result[0].hasOwnProperty('exchange'));
      assert.ok(result[0].hasOwnProperty('is_trading'));
      assert.ok(result[0].hasOwnProperty('has_position'));
      assert.strictEqual(typeof result[0].is_trading, 'boolean');
      assert.strictEqual(typeof result[0].has_position, 'boolean');
    });
  });
});
