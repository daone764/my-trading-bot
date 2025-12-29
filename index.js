const program = require('commander');
const TradeCommand = require('./src/command/trade.js');
const ServerCommand = require('./src/command/server.js');
const Backfill = require('./src/command/backfill.js');
const EthPaperCommand = require('./src/command/eth_paper.js');
const EthPaperUiCommand = require('./src/command/eth_paper_ui.js');
const CombinedUiCommand = require('./src/command/combined_ui.js');
const UnifiedDashboardCommand = require('./src/command/unified_dashboard.js');

// init
const services = require('./src/modules/services');

program
  .command('trade')
  .description('start crypto trading bot')
  .option('-i, --instance <file>', 'Instance file to load (default: instance.js)', 'instance')
  .action(async options => {
    await services.boot(__dirname, { instanceFile: options.instance });

    const cmd = new TradeCommand();
    cmd.execute();
  });

program
  .command('backfill')
  .description('process historical data collection')
  .option('-e, --exchange <exchange>')
  .option('-s, --symbol <symbol>')
  .option('-p, --period <period>', '1m 5m, 15m, 1h', '15m')
  .option('-d, --date <date>', 'days in past to collect start', '7')
  .action(async options => {
    if (!options.exchange || !options.symbol || !options.period || !options.date) {
      throw new Error('Not all options are given');
    }

    await services.boot(__dirname);

    const cmd = new Backfill();
    await cmd.execute(options.exchange, options.symbol, options.period, options.date);

    process.exit();
  });

program
  .command('server')
  .description('')
  .option('-i, --instance <file>', 'Instance file to load (default: instance.js)', 'instance')
  .action(async options => {
    await services.boot(__dirname, { instanceFile: options.instance });

    const cmd = new ServerCommand();
    cmd.execute();
  });

program
  .command('eth-paper')
  .description('start ETH/USD paper trading bot (EMA crossover + RSI)')
  .option('-e, --env <file>', 'Env file path relative to repo root', '.env')
  .option('--once', 'Run a single tick and exit (useful for smoke tests)')
  .action(async options => {
    const cmd = new EthPaperCommand();
    await cmd.execute({ env: options.env, projectDir: __dirname, once: Boolean(options.once) });

    if (options.once) {
      process.exit(0);
    }
  });
program
  .command('eth-paper-ui')
  .description('start a lightweight localhost UI for ETH paper trading state/logs')
  .option('-p, --port <port>', 'Port to bind', '8081')
  .action(async options => {
    const cmd = new EthPaperUiCommand();
    await cmd.execute({ projectDir: __dirname, port: Number(options.port) || 8081 });
  });

program
  .command('dashboard')
  .description('start combined dashboard showing all trading bots (ETH, BTC, etc.)')
  .option('-p, --port <port>', 'Port to bind', '8082')
  .option('-i, --instance <file>', 'Instance file to load (default: instance.js)', 'instance')
  .action(async options => {
    await services.boot(__dirname, { instanceFile: options.instance });
    const cmd = new CombinedUiCommand();
    await cmd.execute({ projectDir: __dirname, port: Number(options.port) || 8082, services });
  });

program
  .command('unified')
  .description('start unified dashboard with TradingView charts, signals, logs, and bot status')
  .option('-p, --port <port>', 'Port to bind', '8089')
  .action(async options => {
    const cmd = new UnifiedDashboardCommand();
    await cmd.execute({ projectDir: __dirname, port: Number(options.port) || 8089 });
  });

program.parse(process.argv);
