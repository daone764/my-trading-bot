const Transport = require('winston-transport');

module.exports = class WinstonSqliteTransport extends Transport {
  constructor(opts) {
    super(opts);

    if (!opts.database_connection) {
      throw new Error('database_connection is needed');
    }

    if (!opts.table) {
      throw new Error('table is needed');
    }

    this.db = opts.database_connection;
    this.table = opts.table;
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    const parameters = {
      uuid: WinstonSqliteTransport.createUUID(),
      level: info.level,
      message: info.message,
      created_at: Math.floor(Date.now() / 1000)
    };

    try {
      this.db
        .prepare(
          `INSERT INTO ${this.table}(uuid, level, message, created_at) VALUES ($uuid, $level, $message, $created_at)`
        )
        .run(parameters);
    } catch (e) {
      // Silently fail if logs table doesn't exist yet - DB will be initialized
      if (!e.message.includes('no such table')) {
        console.error('Error writing to logs table:', e.message);
      }
    }

    callback();
  }

  static createUUID() {
    let dt = new Date().getTime();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
};
