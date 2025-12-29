/**
 * DCA Logger
 * Handles all logging for the Dollar-Cost Averaging strategy
 * Logs to both console and file for observability
 */

const fs = require('fs');
const path = require('path');

class DcaLogger {
  constructor(config = {}) {
    this.logFile = config.logFile || process.env.LOG_FILE || 'logs/trades.log';
    this.logToConsole = config.logToConsole !== false && process.env.LOG_CONSOLE !== 'false';
    this.logLevel = config.logLevel || process.env.LOG_LEVEL || 'info';
    
    // Ensure log directory exists
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Format timestamp
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Write to log file
   */
  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Log a message
   */
  log(level, message, data = null) {
    const timestamp = this.getTimestamp();
    let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      logMessage += '\n' + JSON.stringify(data, null, 2);
    }

    if (this.logToConsole) {
      console.log(logMessage);
    }

    this.writeToFile(logMessage);
  }

  /**
   * Log info message
   */
  info(message, data = null) {
    this.log('info', message, data);
  }

  /**
   * Log warning message
   */
  warn(message, data = null) {
    this.log('warn', message, data);
  }

  /**
   * Log error message
   */
  error(message, data = null) {
    this.log('error', message, data);
  }

  /**
   * Log a trade execution
   */
  logTrade(tradeInfo) {
    const {
      asset,
      action,
      price,
      amountUsd,
      quantity,
      orderId,
      exchange,
      timestamp,
      dryRun
    } = tradeInfo;

    const message = `${dryRun ? '[DRY RUN] ' : ''}TRADE EXECUTED`;
    const data = {
      action: action || 'BUY',
      asset,
      exchange,
      price: `$${price.toFixed(2)}`,
      amountUsd: `$${amountUsd.toFixed(2)}`,
      quantity: quantity.toFixed(8),
      orderId: orderId || 'N/A',
      timestamp: new Date(timestamp || Date.now()).toISOString()
    };

    this.log('info', message, data);
  }

  /**
   * Log a skipped trade with detailed reason
   */
  logSkippedTrade(asset, reason, price = null, amountUsd = null, extraInfo = {}) {
    const message = `TRADE SKIPPED - ${asset}`;
    const data = {
      asset,
      reason,
      ...(price && { price: `$${price.toFixed(2)}` }),
      ...(amountUsd && { intendedAmount: `$${amountUsd.toFixed(2)}` }),
      ...(extraInfo.needsAccumulation && { 
        note: 'ACCUMULATION MODE: Add more funds before trading',
        recommendation: `Minimum order size: $${extraInfo.minOrderSize || 10}`
      }),
      ...(extraInfo.estimatedFee && { 
        estimatedFee: `$${extraInfo.estimatedFee.toFixed(2)}`,
        netAfterFee: `$${extraInfo.netAmount.toFixed(2)}`
      }),
      timestamp: this.getTimestamp()
    };

    this.log('warn', message, data);
    
    // Console-friendly accumulation message
    if (this.logToConsole && extraInfo.needsAccumulation) {
      console.log(`\n💡 TIP: Your order size ($${amountUsd.toFixed(2)}) is below Coinbase's minimum.`);
      console.log(`   Add more funds or wait until you have at least $${extraInfo.minOrderSize || 10} per asset.\n`);
    }
  }

  /**
   * Log DCA execution start
   */
  logDcaStart(config) {
    this.log('info', '=== DCA EXECUTION STARTED ===', config);
  }

  /**
   * Log DCA execution complete
   */
  logDcaComplete(summary) {
    this.log('info', '=== DCA EXECUTION COMPLETED ===', summary);
  }

  /**
   * Log risk check result
   */
  logRiskCheck(asset, allowed, reason, currentPrice) {
    const message = `RISK CHECK - ${asset}`;
    const data = {
      asset,
      allowed,
      reason,
      currentPrice: `$${currentPrice.toFixed(2)}`,
      timestamp: this.getTimestamp()
    };

    if (allowed) {
      this.log('info', message, data);
    } else {
      this.log('warn', message, data);
    }
  }

  /**
   * Log exchange error
   */
  logExchangeError(exchange, operation, error) {
    const message = `EXCHANGE ERROR - ${exchange}`;
    const data = {
      exchange,
      operation,
      error: error.message || error,
      timestamp: this.getTimestamp()
    };

    this.log('error', message, data);
  }

  /**
   * Log system startup
   */
  logStartup(config) {
    const message = '=== DCA BOT STARTUP ===';
    this.log('info', message, {
      dryRun: config.dryRun,
      exchange: config.exchange,
      weeklyAmount: `$${config.weeklyAmount}`,
      schedule: config.schedule,
      timestamp: this.getTimestamp()
    });

    if (config.dryRun) {
      this.warn('⚠️  DRY RUN MODE ENABLED - No real trades will be executed');
    }
  }

  /**
   * Log price fetch
   */
  logPriceFetch(asset, price, exchange) {
    const message = `PRICE FETCHED - ${asset}`;
    const data = {
      asset,
      price: `$${price.toFixed(2)}`,
      exchange,
      timestamp: this.getTimestamp()
    };

    this.log('info', message, data);
  }
}

module.exports = DcaLogger;
