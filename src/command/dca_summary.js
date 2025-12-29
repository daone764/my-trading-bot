/**
 * DCA Summary Report Generator
 * Generates detailed portfolio and performance reports
 */

require('dotenv').config();
const DcaStrategy = require('../dca/strategy');
const DcaRiskManager = require('../dca/risk_manager');
const fs = require('fs').promises;
const path = require('path');

class DcaSummaryReport {
  constructor() {
    this.riskManager = new DcaRiskManager();
  }

  /**
   * Generate and display summary report
   */
  async generate() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          CRYPTO DCA BOT - PORTFOLIO SUMMARY             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      // Load purchase history
      await this.riskManager.loadHistory();

      // Get current prices (prefer CCXT Coinbase; fallback to mock)
      let btcPrice;
      let ethPrice;
      try {
        const strategy = new DcaStrategy(null, { dryRun: true });
        btcPrice = await strategy.getCurrentPrice('BTC-USD');
        ethPrice = await strategy.getCurrentPrice('ETH-USD');
      } catch (error) {
        btcPrice = 45000 + Math.random() * 5000;
        ethPrice = 2500 + Math.random() * 500;
      }

      // Generate summaries
      const btcSummary = this.riskManager.getRiskSummary('BTC', btcPrice);
      const ethSummary = this.riskManager.getRiskSummary('ETH', ethPrice);

      // Display individual asset reports
      this.displayAssetReport('Bitcoin (BTC)', btcSummary);
      this.displayAssetReport('Ethereum (ETH)', ethSummary);

      // Calculate portfolio totals
      const totalInvested = parseFloat(btcSummary.totalInvested) + parseFloat(ethSummary.totalInvested);
      const btcPnL = parseFloat(btcSummary.unrealizedPnL) || 0;
      const ethPnL = parseFloat(ethSummary.unrealizedPnL) || 0;
      const totalPnL = btcPnL + ethPnL;
      const totalPnLPercent = totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(2) : 0;

      // Display portfolio summary
      console.log('─────────────────────────────────────────────────────────────');
      console.log('\n📊 PORTFOLIO TOTALS\n');
      console.log(`  Total Invested:       $${totalInvested.toFixed(2)}`);
      console.log(`  Total Unrealized P/L: $${totalPnL.toFixed(2)} (${totalPnLPercent}%)`);
      
      if (totalPnL >= 0) {
        console.log(`  Status:               🟢 Profit`);
      } else {
        console.log(`  Status:               🔴 Loss`);
      }

      // Display purchase history
      this.displayPurchaseHistory('BTC');
      this.displayPurchaseHistory('ETH');

      // Display configuration
      console.log('\n─────────────────────────────────────────────────────────────');
      console.log('\n⚙️  CONFIGURATION\n');
      console.log(`  Dry Run:              ${process.env.DRY_RUN !== 'false' ? 'Yes ✅' : 'No ❌'}`);
      console.log(`  Exchange:             ${process.env.EXCHANGE || 'coinbase'}`);
      console.log(`  Weekly Amount:        $${process.env.DCA_WEEKLY_AMOUNT || 100}`);
      console.log(`  BTC Allocation:       ${process.env.DCA_BTC_PERCENTAGE || 50}%`);
      console.log(`  ETH Allocation:       ${process.env.DCA_ETH_PERCENTAGE || 50}%`);
      console.log(`  Stop Loss:            ${process.env.RISK_STOP_LOSS_PERCENT || 20}%`);
      console.log(`  Take Profit:          ${process.env.RISK_TAKE_PROFIT_PERCENT || 30}%`);

      // Display log file location
      console.log('\n─────────────────────────────────────────────────────────────');
      console.log('\n📝 LOGS\n');
      console.log(`  Log File:             ${process.env.LOG_FILE || 'logs/trades.log'}`);
      console.log(`  History File:         var/dca_purchase_history.json`);

      console.log('\n');

    } catch (error) {
      console.error('❌ Error generating report:', error.message);
      process.exit(1);
    }
  }

  /**
   * Display individual asset report
   */
  displayAssetReport(name, summary) {
    console.log(`\n💰 ${name.toUpperCase()}\n`);
    console.log(`  Total Invested:       $${summary.totalInvested}`);
    console.log(`  Purchase Count:       ${summary.purchaseCount}`);
    console.log(`  Average Entry Price:  $${summary.avgEntryPrice}`);
    console.log(`  Last Purchase Price:  $${summary.lastPurchasePrice}`);
    console.log(`  Current Price:        $${summary.currentPrice}`);
    console.log(`  Unrealized P/L:       $${summary.unrealizedPnL} (${summary.unrealizedPnLPercent})`);
  }

  /**
   * Display purchase history for an asset
   */
  displayPurchaseHistory(asset) {
    const purchases = this.riskManager.purchaseHistory[asset] || [];
    
    if (purchases.length === 0) {
      return;
    }

    console.log(`\n📜 ${asset} PURCHASE HISTORY (Last 5)\n`);
    
    const recentPurchases = purchases.slice(-5).reverse();
    
    recentPurchases.forEach((purchase, index) => {
      const date = new Date(purchase.timestamp).toLocaleDateString();
      console.log(`  ${recentPurchases.length - index}. ${date}: $${purchase.amount.toFixed(2)} at $${purchase.price.toFixed(2)}`);
    });

    if (purchases.length > 5) {
      console.log(`  ... and ${purchases.length - 5} more purchases`);
    }
  }

  /**
   * Export report to JSON
   */
  async exportToJson(filename = 'portfolio_summary.json') {
    try {
      await this.riskManager.loadHistory();

      const btcPrice = 45000 + Math.random() * 5000;
      const ethPrice = 2500 + Math.random() * 500;

      const btcSummary = this.riskManager.getRiskSummary('BTC', btcPrice);
      const ethSummary = this.riskManager.getRiskSummary('ETH', ethPrice);

      const totalInvested = parseFloat(btcSummary.totalInvested) + parseFloat(ethSummary.totalInvested);
      const btcPnL = parseFloat(btcSummary.unrealizedPnL) || 0;
      const ethPnL = parseFloat(ethSummary.unrealizedPnL) || 0;
      const totalPnL = btcPnL + ethPnL;

      const report = {
        timestamp: new Date().toISOString(),
        dryRun: process.env.DRY_RUN !== 'false',
        assets: {
          BTC: btcSummary,
          ETH: ethSummary
        },
        portfolio: {
          totalInvested: totalInvested.toFixed(2),
          totalPnL: totalPnL.toFixed(2),
          totalPnLPercent: totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(2) + '%' : 'N/A'
        },
        configuration: {
          weeklyAmount: process.env.DCA_WEEKLY_AMOUNT || 100,
          btcPercentage: process.env.DCA_BTC_PERCENTAGE || 50,
          ethPercentage: process.env.DCA_ETH_PERCENTAGE || 50,
          stopLossPercent: process.env.RISK_STOP_LOSS_PERCENT || 20,
          takeProfitPercent: process.env.RISK_TAKE_PROFIT_PERCENT || 30
        }
      };

      const outputPath = path.join(__dirname, '../../var', filename);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

      console.log(`\n✅ Report exported to: ${outputPath}\n`);

    } catch (error) {
      console.error('❌ Error exporting report:', error.message);
    }
  }
}

// CLI entry point
if (require.main === module) {
  const command = process.argv[2];
  const report = new DcaSummaryReport();

  if (command === 'export') {
    report.exportToJson().then(() => process.exit(0));
  } else {
    report.generate().then(() => process.exit(0));
  }
}

module.exports = DcaSummaryReport;
