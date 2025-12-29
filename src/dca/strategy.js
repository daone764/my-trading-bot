/**
 * DCA Strategy Engine
 * Core implementation of Dollar-Cost Averaging strategy
 * 
 * Features:
 * - Weekly automated purchases
 * - Configurable asset allocation
 * - Market order execution
 * - Error handling and retry logic
 * - Dry run mode for safe testing
 */

require('dotenv').config();
const DcaLogger = require('./logger');
const DcaRiskManager = require('./risk_manager');
const { Coinbase } = require('coinbase-api');
const ccxt = require('ccxt');

class DcaStrategy {
  constructor(exchangeManager, config = {}) {
    this.exchangeManager = exchangeManager;
    this.coinbaseClient = null;
    this.marketDataClient = null;
    
    // Configuration
    this.dryRun = config.dryRun !== false && process.env.DRY_RUN !== 'false';
    this.weeklyAmount = parseFloat(config.weeklyAmount || process.env.DCA_WEEKLY_AMOUNT || 100);
    this.btcPercentage = parseFloat(config.btcPercentage || process.env.DCA_BTC_PERCENTAGE || 50);
    this.ethPercentage = parseFloat(config.ethPercentage || process.env.DCA_ETH_PERCENTAGE || 50);
    // DCA uses Coinbase Advanced Trade API.
    this.exchange = config.exchange || process.env.EXCHANGE || 'coinbase';
    this.orderType = config.orderType || process.env.ORDER_TYPE || 'market';
    
    // Small capital safety settings
    this.minOrderSizeUsd = parseFloat(process.env.MIN_ORDER_SIZE_USD || 10); // Coinbase minimum
    this.estimatedFeePercent = parseFloat(process.env.ESTIMATED_FEE_PERCENT || 0.6); // Coinbase ~0.6% taker fee
    this.minBalanceToTrade = parseFloat(process.env.MIN_BALANCE_TO_TRADE || 20); // Wait until we have meaningful capital
    this.accumulate = process.env.ACCUMULATE_MODE === 'true'; // Wait mode vs immediate trade
    
    // Validate allocation
    const totalAllocation = this.btcPercentage + this.ethPercentage;
    if (Math.abs(totalAllocation - 100) > 0.01) {
      throw new Error(`Asset allocation must sum to 100% (got ${totalAllocation}%)`);
    }
    
    // Calculate amounts
    this.btcAmount = (this.weeklyAmount * this.btcPercentage) / 100;
    this.ethAmount = (this.weeklyAmount * this.ethPercentage) / 100;
    
    // Initialize logger and risk manager
    this.logger = new DcaLogger(config);
    this.riskManager = new DcaRiskManager(config);
    
    // Last execution tracking
    this.lastExecutionTime = null;

    // Initialize Coinbase client if not in dry run
    if (!this.dryRun && process.env.COINBASE_API_KEY) {
      this.initializeCoinbaseClient();
    }

    // Market data via CCXT (public endpoints; no auth required)
    this.marketDataClient = new ccxt.coinbase({
      enableRateLimit: true,
    });
  }

  toCcxtSymbol(symbol) {
    if (!symbol) {
      throw new Error('Missing symbol');
    }

    // Accept common forms: BTC-USD, BTC/USD, BTCUSDT (legacy)
    if (symbol.includes('/')) {
      return symbol;
    }
    if (symbol.includes('-')) {
      return symbol.replace('-', '/');
    }
    if (symbol.endsWith('USDT')) {
      return `${symbol.slice(0, -4)}/USD`;
    }
    return symbol;
  }

  toCoinbaseProductId(symbol) {
    if (!symbol) {
      throw new Error('Missing symbol');
    }

    // Accept: BTC-USD, BTC/USD, BTCUSDT (legacy)
    if (symbol.includes('-')) {
      return symbol;
    }
    if (symbol.includes('/')) {
      return symbol.replace('/', '-');
    }
    if (symbol.endsWith('USDT')) {
      return `${symbol.slice(0, -4)}-USD`;
    }
    return symbol;
  }

  /**
   * Initialize Coinbase Advanced Trade API client (CDP)
   */
  initializeCoinbaseClient() {
    const apiKeyName = process.env.COINBASE_API_KEY;
    const privateKey = process.env.COINBASE_API_SECRET;

    if (!apiKeyName || !privateKey) {
      this.logger.error('Coinbase CDP API credentials not found in environment variables');
      throw new Error('Missing Coinbase CDP API credentials. Please check your .env file.');
    }

    try {
      this.coinbaseClient = new Coinbase({
        apiKeyName: apiKeyName,
        privateKey: privateKey
      });
      
      this.logger.info('Coinbase Advanced Trade API client initialized', {
        exchange: this.exchange,
        apiKeyName: apiKeyName.substring(0, 20) + '...'
      });
    } catch (error) {
      this.logger.error('Failed to initialize Coinbase client', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute DCA strategy
   * Main entry point with capital-aware logic
   */
  async execute() {
    // Pre-execution safety check for small capital
    const balance = !this.dryRun ? await this.getBalance() : { free: 1000, total: 1000 };
    
    this.logger.logDcaStart({
      dryRun: this.dryRun,
      exchange: this.exchange,
      availableBalance: balance ? `$${balance.free.toFixed(2)}` : 'unknown',
      totalAmount: `$${this.weeklyAmount}`,
      btcAmount: `$${this.btcAmount}`,
      ethAmount: `$${this.ethAmount}`,
      minOrderSize: `$${this.minOrderSizeUsd}`,
      minBalanceToTrade: `$${this.minBalanceToTrade}`
    });

    const results = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      dryRun: this.dryRun,
      trades: [],
      errors: [],
      skippedDueToBalance: false,
      accumulationMessage: null
    };

    try {
      // CAPITAL-AWARE LOGIC: Check if we should wait
      if (!this.dryRun && balance && balance.free < this.minBalanceToTrade) {
        const msg = `Balance ($${balance.free.toFixed(2)}) below minimum ($${this.minBalanceToTrade}). Accumulating until sufficient capital.`;
        this.logger.warn(msg);
        this.logger.info(`💰 Accumulation Mode: Add $${(this.minBalanceToTrade - balance.free).toFixed(2)} more to enable trading.`);
        results.skippedDueToBalance = true;
        results.accumulationMessage = msg;
        return results;
      }

      // Check balance sufficiency for planned trades
      if (!this.dryRun) {
        const sufficientBalance = await this.checkBalance(this.weeklyAmount);
        
        if (!sufficientBalance) {
          const errorMsg = `Insufficient balance for full DCA of $${this.weeklyAmount}. Available: $${balance ? balance.free.toFixed(2) : 'unknown'}`;
          this.logger.error(errorMsg);
          results.errors.push(errorMsg);
          return results;
        }
      }

      // Execute BTC purchase
      if (this.btcAmount > 0) {
        try {
          const btcResult = await this.executePurchase('BTC', 'BTC-USD', this.btcAmount);
          results.trades.push(btcResult);
        } catch (error) {
          const errorMsg = `BTC purchase failed: ${error.message}`;
          this.logger.error(errorMsg);
          results.errors.push(errorMsg);
        }
      }

      // Execute ETH purchase
      if (this.ethAmount > 0) {
        try {
          const ethResult = await this.executePurchase('ETH', 'ETH-USD', this.ethAmount);
          results.trades.push(ethResult);
        } catch (error) {
          const errorMsg = `ETH purchase failed: ${error.message}`;
          this.logger.error(errorMsg);
          results.errors.push(errorMsg);
        }
      }

      // Calculate summary
      const totalExecuted = results.trades
        .filter(t => t.executed)
        .reduce((sum, t) => sum + t.amountUsd, 0);
      
      const totalSkipped = results.trades
        .filter(t => !t.executed)
        .reduce((sum, t) => sum + t.amountUsd, 0);

      results.summary = {
        totalIntended: this.weeklyAmount,
        totalExecuted: totalExecuted.toFixed(2),
        totalSkipped: totalSkipped.toFixed(2),
        tradesExecuted: results.trades.filter(t => t.executed).length,
        tradesSkipped: results.trades.filter(t => !t.executed).length,
        errors: results.errors.length
      };

      this.logger.logDcaComplete(results.summary);
      this.lastExecutionTime = results.timestamp;

      return results;

    } catch (error) {
      this.logger.error('DCA execution failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a single asset purchase
   */
  async executePurchase(asset, symbol, amountUsd) {
    this.logger.info(`Processing ${asset} purchase`, {
      symbol,
      amountUsd: `$${amountUsd.toFixed(2)}`
    });

    const result = {
      asset,
      symbol,
      amountUsd,
      executed: false,
      skipped: false,
      skipReason: null,
      price: null,
      quantity: null,
      orderId: null,
      timestamp: Date.now()
    };

    try {
      // Step 1: Get current price
      const price = await this.getCurrentPrice(symbol);
      result.price = price;
      
      this.logger.logPriceFetch(asset, price, this.exchange);

      // Step 2: Check risk controls
      const riskCheck = await this.riskManager.checkPurchaseAllowed(asset, price, amountUsd);
      this.logger.logRiskCheck(asset, riskCheck.allowed, riskCheck.reason, price);

      if (!riskCheck.allowed) {
        result.skipped = true;
        result.skipReason = riskCheck.reason;
        this.logger.logSkippedTrade(asset, riskCheck.reason, price, amountUsd);
        return result;
      }

      // Step 3: Calculate quantity
      const quantity = amountUsd / price;
      result.quantity = quantity;

      // Step 4: Validate order (capital-aware)
      const validationResult = this.validateOrder(asset, symbol, quantity, amountUsd);
      if (!validationResult.valid) {
        result.skipped = true;
        result.skipReason = validationResult.reason;
        this.logger.logSkippedTrade(asset, validationResult.reason, price, amountUsd, {
          needsAccumulation: validationResult.needsAccumulation,
          minOrderSize: this.minOrderSizeUsd,
          estimatedFee: validationResult.estimatedFee,
          netAmount: validationResult.netAmount
        });
        return result;
      }

      // Step 5: Execute order (or simulate if dry run)
      if (this.dryRun) {
        // Dry run mode - simulate the order
        result.executed = true;
        result.orderId = `DRY_RUN_${Date.now()}_${asset}`;
        
        this.logger.logTrade({
          asset,
          price,
          amountUsd,
          quantity,
          orderId: result.orderId,
          exchange: this.exchange,
          timestamp: result.timestamp,
          dryRun: true
        });

        // Record in risk manager for future checks
        await this.riskManager.recordPurchase(asset, price, amountUsd, result.timestamp);
        
      } else {
        // Real trade execution
        const order = await this.placeOrder(symbol, quantity, amountUsd);
        result.executed = true;
        result.orderId = order.orderId;
        
        this.logger.logTrade({
          asset,
          price,
          amountUsd,
          quantity,
          orderId: result.orderId,
          exchange: this.exchange,
          timestamp: result.timestamp,
          dryRun: false
        });

        // Record in risk manager
        await this.riskManager.recordPurchase(asset, price, amountUsd, result.timestamp);
      }

      return result;

    } catch (error) {
      this.logger.logExchangeError(this.exchange, `${asset} purchase`, error);
      throw error;
    }
  }

  /**
   * Get current market price for a symbol
   */
  async getCurrentPrice(symbol) {
    try {
      if (this.marketDataClient) {
        const ccxtSymbol = this.toCcxtSymbol(symbol);
        const ticker = await this.marketDataClient.fetchTicker(ccxtSymbol);
        const price = parseFloat(ticker?.last ?? ticker?.close);

        if (!price || price <= 0) {
          throw new Error(`Invalid price received for ${ccxtSymbol}: ${price}`);
        }

        return price;
      }

      // Fallback to mock prices if CCXT is unavailable
      const mockPrices = {
        'BTC-USD': 45000 + Math.random() * 5000,
        'ETH-USD': 2500 + Math.random() * 500,
      };
      return mockPrices[symbol] || 1000;
    } catch (error) {
      this.logger.error(`Failed to fetch price for ${symbol}`, { error: error.message });
      throw new Error(`Failed to fetch price for ${symbol}: ${error.message}`);
    }
  }

  /**
   * Get account balance for USD
   */
  async getBalance() {
    if (!this.coinbaseClient) {
      return null;
    }

    try {
      const accounts = await this.coinbaseClient.listAccounts();
      const usdAccount = accounts.accounts.find(a => a.currency.code === 'USD');
      
      if (usdAccount) {
        return {
          free: parseFloat(usdAccount.available_balance.value),
          locked: parseFloat(usdAccount.hold.value || 0),
          total: parseFloat(usdAccount.balance.value)
        };
      }
      
      return { free: 0, locked: 0, total: 0 };
    } catch (error) {
      this.logger.error('Failed to fetch account balance', { error: error.message });
      return null;
    }
  }

  /**
   * Check if sufficient balance is available
   */
  async checkBalance(amountNeeded) {
    if (this.dryRun) {
      return true; // Skip balance check in dry run
    }

    const balance = await this.getBalance();
    
    if (!balance) {
      this.logger.warn('Could not check balance, proceeding with caution');
      return true;
    }

    this.logger.info('Account balance check', {
      available: `$${balance.free.toFixed(2)}`,
      needed: `$${amountNeeded.toFixed(2)}`,
      sufficient: balance.free >= amountNeeded
    });

    return balance.free >= amountNeeded;
  }

  /**
   * Validate order before execution
   * Enhanced for small capital safety
   */
  validateOrder(asset, symbol, quantity, amountUsd) {
    // Sanity checks
    if (quantity <= 0) {
      return { valid: false, reason: 'Invalid quantity: must be greater than 0' };
    }

    if (amountUsd <= 0) {
      return { valid: false, reason: 'Invalid amount: must be greater than 0' };
    }

    if (amountUsd > this.weeklyAmount) {
      return { valid: false, reason: `Amount exceeds weekly limit: $${amountUsd.toFixed(2)} > $${this.weeklyAmount}` };
    }

    // Calculate estimated fees
    const estimatedFee = amountUsd * (this.estimatedFeePercent / 100);
    const netAmount = amountUsd - estimatedFee;

    // Coinbase minimum order size check (per asset)
    if (amountUsd < this.minOrderSizeUsd) {
      return { 
        valid: false, 
        reason: `Order too small: $${amountUsd.toFixed(2)} < $${this.minOrderSizeUsd} minimum. Wait for more capital.`,
        needsAccumulation: true
      };
    }

    // Fee-aware check: ensure net order still meaningful
    if (netAmount < (this.minOrderSizeUsd * 0.9)) {
      return {
        valid: false,
        reason: `After ~$${estimatedFee.toFixed(2)} fee, net order ($${netAmount.toFixed(2)}) too small. Need $${(this.minOrderSizeUsd * 1.1).toFixed(2)}+`,
        needsAccumulation: true
      };
    }

    return { 
      valid: true, 
      estimatedFee: estimatedFee,
      netAmount: netAmount
    };
  }

  /**
   * Place order on exchange
   */
  async placeOrder(symbol, quantity, amountUsd) {
    if (this.dryRun) {
      throw new Error('placeOrder should not be called in dry run mode');
    }

    if (!this.coinbaseClient) {
      throw new Error('Coinbase client not initialized. Check your API credentials.');
    }

    try {
      const coinbaseSymbol = this.toCoinbaseProductId(symbol);
      
      this.logger.info(`Placing LIVE order on Coinbase Advanced Trade`, {
        symbol: coinbaseSymbol,
        quantity: quantity.toFixed(8),
        estimatedUsd: amountUsd.toFixed(2),
        type: 'MARKET'
      });

      // Place market buy order on Coinbase Advanced Trade
      const order = await this.coinbaseClient.createMarketOrder({
        product_id: coinbaseSymbol,
        side: 'BUY',
        quote_size: amountUsd.toFixed(2) // Buy with USD amount
      });

      this.logger.info(`Order placed successfully`, {
        orderId: order.order_id,
        symbol: coinbaseSymbol,
        status: order.status || 'PENDING'
      });

      // Return standardized order info
      return {
        orderId: order.order_id,
        symbol: coinbaseSymbol,
        status: order.status || 'PENDING',
        executedQty: parseFloat(order.filled_size || 0),
        fills: order.fills || []
      };
    } catch (error) {
      this.logger.error(`Failed to place order for ${symbol}`, {
        error: error.message,
        code: error.response?.status,
        data: error.response?.data
      });

      // Handle common Coinbase errors
      if (error.message.includes('Insufficient funds') || error.response?.status === 400) {
        throw new Error(`Insufficient funds to place order for ${symbol}`);
      } else if (error.message.includes('size') || error.message.includes('funds')) {
        throw new Error(`Invalid order size for ${symbol}: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary() {
    const btcPrice = await this.getCurrentPrice('BTC-USD');
    const ethPrice = await this.getCurrentPrice('ETH-USD');

    const btcSummary = this.riskManager.getRiskSummary('BTC', btcPrice);
    const ethSummary = this.riskManager.getRiskSummary('ETH', ethPrice);

    const totalInvested = parseFloat(btcSummary.totalInvested) + parseFloat(ethSummary.totalInvested);
    const btcPnL = parseFloat(btcSummary.unrealizedPnL) || 0;
    const ethPnL = parseFloat(ethSummary.unrealizedPnL) || 0;
    const totalPnL = btcPnL + ethPnL;

    return {
      timestamp: new Date().toISOString(),
      dryRun: this.dryRun,
      assets: {
        BTC: btcSummary,
        ETH: ethSummary
      },
      portfolio: {
        totalInvested: totalInvested.toFixed(2),
        totalPnL: totalPnL.toFixed(2),
        totalPnLPercent: totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(2) + '%' : 'N/A'
      }
    };
  }
}

module.exports = DcaStrategy;
