/**
 * DCA Command
 * Command-line interface for the DCA bot
 */

require('dotenv').config();
const DcaStrategy = require('../dca/strategy');
const DcaScheduler = require('../dca/scheduler');
const DcaLogger = require('../dca/logger');

class DcaCommand {
  constructor() {
    this.logger = new DcaLogger();
  }

  /**
   * Execute DCA bot
   */
  async execute(mode = 'schedule') {
    // Display startup banner
    this.displayBanner();

    // Determine if running in dry run mode
    const dryRun = process.env.DRY_RUN !== 'false';
    
    // Initialize strategy with the configured dry run setting
    const strategy = new DcaStrategy(null, {
      dryRun: dryRun
    });

    this.logger.logStartup({
      dryRun: dryRun,
      exchange: process.env.EXCHANGE || 'coinbase',
      weeklyAmount: parseFloat(process.env.DCA_WEEKLY_AMOUNT || 100),
      schedule: process.env.DCA_SCHEDULE || '0 9 * * 1'
    });

    // Safety summary and warning if live trading is enabled
    if (!dryRun) {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║                                                                ║');
      console.log('║          ⚠️  LIVE TRADING MODE - PRE-EXECUTION SAFETY  ⚠️        ║');
      console.log('║                                                                ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      
      const weeklyAmount = parseFloat(process.env.DCA_WEEKLY_AMOUNT || 100);
      const btcPercent = parseFloat(process.env.DCA_BTC_PERCENTAGE || 50);
      const ethPercent = parseFloat(process.env.DCA_ETH_PERCENTAGE || 50);
      const minOrderSize = parseFloat(process.env.MIN_ORDER_SIZE_USD || 10);
      const minBalance = parseFloat(process.env.MIN_BALANCE_TO_TRADE || 20);
      
      console.log('📊 Trade Configuration:');
      console.log(`   Total per execution: $${weeklyAmount.toFixed(2)}`);
      console.log(`   BTC (${btcPercent}%): $${(weeklyAmount * btcPercent / 100).toFixed(2)}`);
      console.log(`   ETH (${ethPercent}%): $${(weeklyAmount * ethPercent / 100).toFixed(2)}`);
      console.log(`\n💰 Capital Requirements:`);
      console.log(`   Minimum per asset: $${minOrderSize.toFixed(2)}`);
      console.log(`   Minimum balance to trade: $${minBalance.toFixed(2)}`);
      console.log(`   Estimated fee (~0.6%): $${(weeklyAmount * 0.006).toFixed(2)}`);
      console.log(`\n🔒 Safety Checks:`);
      console.log(`   ✓ Balance verification enabled`);
      console.log(`   ✓ Minimum order size enforcement`);
      console.log(`   ✓ Fee-aware validation`);
      console.log(`   ✓ Accumulation mode for small balances`);
      
      console.log('\n⏰ You have 10 seconds to cancel (Ctrl+C)...\n');
      
      // Give user 10 seconds to cancel
      await new Promise(resolve => setTimeout(resolve, 10000));
      console.log('✅ Proceeding with live trading...\n');
    }

    if (mode === 'once') {
      // Execute once and exit
      console.log('\n📊 Executing DCA strategy once...\n');
      try {
        const result = await strategy.execute();
        console.log('\n✅ Execution completed');
        console.log('Summary:', result.summary);
        process.exit(0);
      } catch (error) {
        console.error('\n❌ Execution failed:', error.message);
        process.exit(1);
      }
    } else {
      // Start scheduler
      const scheduler = new DcaScheduler(strategy);
      console.log('\n⏰ Starting DCA scheduler...');
      console.log(`Schedule: ${scheduler.getScheduleDescription()}\n`);
      
      scheduler.start();

      // Keep process alive
      console.log('Bot is running. Press Ctrl+C to stop.\n');

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n\n⏸️  Shutting down gracefully...');
        scheduler.stop();
        console.log('✅ Bot stopped\n');
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\n\n⏸️  Shutting down gracefully...');
        scheduler.stop();
        console.log('✅ Bot stopped\n');
        process.exit(0);
      });
    }
  }

  /**
   * Display startup banner
   */
  displayBanner() {
    const banner = `
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║               🤖 CRYPTO DCA BOT - SAFE INVESTING 🤖             ║
║                                                                ║
║  Dollar-Cost Averaging Strategy                               ║
║  Conservative • Long-Term • Automated                         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`;

    console.log(banner);

    // Display configuration
    const config = {
      'Dry Run Mode': process.env.DRY_RUN !== 'false' ? '✅ ENABLED (Safe)' : '❌ DISABLED',
      'Exchange': process.env.EXCHANGE || 'coinbase',
      'Weekly Amount': `$${process.env.DCA_WEEKLY_AMOUNT || 100}`,
      'BTC Allocation': `${process.env.DCA_BTC_PERCENTAGE || 50}%`,
      'ETH Allocation': `${process.env.DCA_ETH_PERCENTAGE || 50}%`,
      'Schedule': process.env.DCA_SCHEDULE || '0 9 * * 1 (Mon 9AM)'
    };

    console.log('Configuration:');
    Object.entries(config).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    // Display warnings
    if (process.env.DRY_RUN !== 'false') {
      console.log('\n⚠️  DRY RUN MODE: No real trades will be executed');
    } else {
      console.log('\n⚠️  LIVE TRADING MODE: Real money at risk!');
    }
  }

  /**
   * Display help
   */
  static displayHelp() {
    console.log(`
Crypto DCA Bot - Command Line Interface

USAGE:
  node src/command/dca.js [mode]

MODES:
  schedule    Start the bot with scheduled weekly execution (default)
  once        Execute DCA strategy once and exit
  help        Display this help message

EXAMPLES:
  node src/command/dca.js schedule
  node src/command/dca.js once

CONFIGURATION:
  Edit .env file to configure the bot
  See .env.example for all available options

SAFETY:
  - DRY_RUN=true by default (simulated trades only)
  - Use testnet/sandbox API keys for testing
  - Never grant withdrawal permissions to API keys
`);
  }
}

// CLI entry point
if (require.main === module) {
  const mode = process.argv[2] || 'schedule';

  if (mode === 'help' || mode === '--help' || mode === '-h') {
    DcaCommand.displayHelp();
    process.exit(0);
  }

  const cmd = new DcaCommand();
  cmd.execute(mode).catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = DcaCommand;
