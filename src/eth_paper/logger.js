const fs = require('fs');
const path = require('path');

module.exports = class EthPaperLogger {
  constructor(config = {}) {
    this.logFile = config.logFile || process.env.LOG_FILE || 'logs/eth_trades.log';
    this.logToConsole = config.logToConsole !== false && process.env.LOG_CONSOLE !== 'false';
    this.logLevel = config.logLevel || process.env.LOG_LEVEL || 'info';

    // Show timestamps in both UTC and local (EST/EDT) by default.
    // Override via LOG_TIMEZONE (IANA name), e.g. "America/New_York".
    this.timeZone = process.env.LOG_TIMEZONE || 'America/New_York';

    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  timestamp(date = new Date()) {
    const utc = date.toISOString();

    let local;
    try {
      local = new Intl.DateTimeFormat('en-US', {
        timeZone: this.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      }).format(date);
    } catch (e) {
      // Fallback to system local time if the timezone is invalid.
      local = date.toLocaleString();
    }

    return `${utc} | ${local}`;
  }

  write(line) {
    try {
      fs.appendFileSync(this.logFile, line + '\n');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to write to log file:', error.message);
    }
  }

  log(level, message, data = null) {
    const line = `[${this.timestamp()}] [${String(level).toUpperCase()}] ${message}`;

    if (this.logToConsole) {
      // eslint-disable-next-line no-console
      console.log(line);
      if (data) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(data, null, 2));
      }
    }

    this.write(line);
    if (data) {
      this.write(JSON.stringify(data, null, 2));
    }
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  error(message, data = null) {
    this.log('error', message, data);
  }
};
