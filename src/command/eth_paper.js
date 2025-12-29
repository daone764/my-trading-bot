const path = require('path');
const dotenv = require('dotenv');

const loadConfig = require('../eth_paper/config');
const EthPaperBot = require('../eth_paper/bot');

module.exports = class EthPaperCommand {
  async execute(options = {}) {
    const projectDir = options.projectDir || path.resolve(__dirname, '..', '..');
    const envPath = options.env ? path.resolve(projectDir, options.env) : path.resolve(projectDir, '.env');

    // Load env (optional). If file doesn't exist, dotenv just returns an error.
    dotenv.config({ path: envPath });

    const config = loadConfig(projectDir);
    const bot = new EthPaperBot(config);

    if (options.once) {
      await bot.runOnce();
      return;
    }

    bot.start();
  }
};
