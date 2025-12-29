/**
 * DCA Risk Manager
 * Implements safety controls for Dollar-Cost Averaging strategy
 * 
 * Risk Controls:
 * - Stop-loss: Halt purchases if price drops too much
 * - Take-profit: Pause purchases if price rises too much
 * - Max exposure limits
 * - No leverage enforcement
 */

const fs = require('fs').promises;
const path = require('path');

class DcaRiskManager {
  constructor(config = {}) {
    this.stopLossPercent = parseFloat(config.stopLossPercent || process.env.RISK_STOP_LOSS_PERCENT || 20);
    this.takeProfitPercent = parseFloat(config.takeProfitPercent || process.env.RISK_TAKE_PROFIT_PERCENT || 30);
    this.maxWeeklyUsd = parseFloat(config.maxWeeklyUsd || process.env.RISK_MAX_WEEKLY_USD || 100);
    
    // Track purchase history for each asset
    this.purchaseHistory = {
      BTC: [],
      ETH: []
    };
    
    this.historyFile = path.join(__dirname, '../../var/dca_purchase_history.json');
    this.loadHistory();
  }

  /**
   * Load purchase history from disk
   */
  async loadHistory() {
    try {
      const data = await fs.readFile(this.historyFile, 'utf8');
      this.purchaseHistory = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, start fresh
      if (error.code !== 'ENOENT') {
        console.error('Error loading purchase history:', error.message);
      }
    }
  }

  /**
   * Save purchase history to disk
   */
  async saveHistory() {
    try {
      const dir = path.dirname(this.historyFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.historyFile, JSON.stringify(this.purchaseHistory, null, 2));
    } catch (error) {
      console.error('Error saving purchase history:', error.message);
    }
  }

  /**
   * Record a purchase for risk tracking
   */
  async recordPurchase(asset, priceUsd, amountUsd, timestamp = Date.now()) {
    if (!this.purchaseHistory[asset]) {
      this.purchaseHistory[asset] = [];
    }

    this.purchaseHistory[asset].push({
      price: priceUsd,
      amount: amountUsd,
      timestamp: timestamp,
      date: new Date(timestamp).toISOString()
    });

    await this.saveHistory();
  }

  /**
   * Get average entry price for an asset
   */
  getAverageEntryPrice(asset) {
    const purchases = this.purchaseHistory[asset] || [];
    if (purchases.length === 0) return null;

    let totalCost = 0;
    let totalAmount = 0;

    purchases.forEach(purchase => {
      totalCost += purchase.amount;
      totalAmount += purchase.amount / purchase.price;
    });

    return totalAmount > 0 ? totalCost / totalAmount : null;
  }

  /**
   * Get last purchase price for an asset
   */
  getLastPurchasePrice(asset) {
    const purchases = this.purchaseHistory[asset] || [];
    if (purchases.length === 0) return null;
    return purchases[purchases.length - 1].price;
  }

  /**
   * Calculate total invested in an asset
   */
  getTotalInvested(asset) {
    const purchases = this.purchaseHistory[asset] || [];
    return purchases.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Check if purchase should be allowed based on risk rules
   * 
   * @param {string} asset - Asset symbol (BTC, ETH)
   * @param {number} currentPrice - Current market price
   * @param {number} purchaseAmount - Intended purchase amount in USD
   * @returns {Object} { allowed: boolean, reason: string }
   */
  async checkPurchaseAllowed(asset, currentPrice, purchaseAmount) {
    // Rule 1: Check max weekly exposure
    if (purchaseAmount > this.maxWeeklyUsd) {
      return {
        allowed: false,
        reason: `Purchase amount $${purchaseAmount} exceeds max weekly limit of $${this.maxWeeklyUsd}`
      };
    }

    const lastPrice = this.getLastPurchasePrice(asset);
    const avgPrice = this.getAverageEntryPrice(asset);

    // Rule 2: Stop-loss check (price dropped too much from last purchase)
    if (lastPrice) {
      const priceDropPercent = ((lastPrice - currentPrice) / lastPrice) * 100;
      
      if (priceDropPercent > this.stopLossPercent) {
        return {
          allowed: false,
          reason: `Stop-loss triggered: ${asset} price dropped ${priceDropPercent.toFixed(2)}% from last purchase ($${lastPrice.toFixed(2)} -> $${currentPrice.toFixed(2)})`
        };
      }
    }

    // Rule 3: Take-profit check (price rose too much from average entry)
    if (avgPrice) {
      const priceRisePercent = ((currentPrice - avgPrice) / avgPrice) * 100;
      
      if (priceRisePercent > this.takeProfitPercent) {
        return {
          allowed: false,
          reason: `Take-profit triggered: ${asset} price rose ${priceRisePercent.toFixed(2)}% from average entry ($${avgPrice.toFixed(2)} -> $${currentPrice.toFixed(2)})`
        };
      }
    }

    // All checks passed
    return {
      allowed: true,
      reason: 'All risk checks passed'
    };
  }

  /**
   * Get risk summary for an asset
   */
  getRiskSummary(asset, currentPrice) {
    const totalInvested = this.getTotalInvested(asset);
    const avgEntry = this.getAverageEntryPrice(asset);
    const lastPrice = this.getLastPurchasePrice(asset);
    const purchaseCount = (this.purchaseHistory[asset] || []).length;

    let unrealizedPnL = null;
    let unrealizedPnLPercent = null;

    if (avgEntry && totalInvested > 0) {
      const currentValue = (totalInvested / avgEntry) * currentPrice;
      unrealizedPnL = currentValue - totalInvested;
      unrealizedPnLPercent = (unrealizedPnL / totalInvested) * 100;
    }

    return {
      asset,
      totalInvested: totalInvested.toFixed(2),
      purchaseCount,
      avgEntryPrice: avgEntry ? avgEntry.toFixed(2) : 'N/A',
      lastPurchasePrice: lastPrice ? lastPrice.toFixed(2) : 'N/A',
      currentPrice: currentPrice.toFixed(2),
      unrealizedPnL: unrealizedPnL !== null ? unrealizedPnL.toFixed(2) : 'N/A',
      unrealizedPnLPercent: unrealizedPnLPercent !== null ? unrealizedPnLPercent.toFixed(2) + '%' : 'N/A'
    };
  }

  /**
   * Reset history (use with caution!)
   */
  async resetHistory() {
    this.purchaseHistory = { BTC: [], ETH: [] };
    await this.saveHistory();
  }
}

module.exports = DcaRiskManager;
