const express = require('express');
const path = require('path');
const fs = require('fs');
const twig = require('twig');
const cronParser = require('cron-parser');

/**
 * Unified Dashboard - Single page showing everything:
 * - TradingView charts
 * - Bot status & health
 * - Recent signals
 * - Position/portfolio summary
 * - Live logs
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function tailFile(filePath, maxBytes = 32 * 1024) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const len = stat.size - start;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function parseDotEnv(raw) {
  const map = {};
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function toBool(v) {
  if (v === null || typeof v === 'undefined') return null;
  return String(v).trim().toLowerCase() === 'true';
}

function toNum(v) {
  if (v === null || typeof v === 'undefined' || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

module.exports = class UnifiedDashboardCommand {
  async execute({ projectDir, port = 8089, services } = {}) {
    const app = express();

    app.set('views', path.join(projectDir, 'templates'));
    app.set('twig options', { allow_async: true, strict_variables: false });
    app.use(express.static(path.join(projectDir, 'web', 'static'), { maxAge: 3600000 }));
    app.use(express.json());

    // ─────────────────────────────────────────────────────────────────────────
    // API: Get all bot statuses
    // ─────────────────────────────────────────────────────────────────────────
    
    const getBotStatus = () => {
      const bots = [];
      
      // Check for ETH paper bot
      const ethEnvPath = path.join(projectDir, '.env');
      if (fs.existsSync(ethEnvPath)) {
        const env = parseDotEnv(fs.readFileSync(ethEnvPath, 'utf8'));
        const statePath = path.join(projectDir, env.STATE_FILE || 'var/eth_paper_state.json');
        const state = safeReadJson(statePath);
        bots.push({
          id: 'eth-paper',
          label: 'ETH Paper',
          pair: env.PAIR_WHITELIST || 'ETH/USD',
          mode: toBool(env.PAPER_TRADING) === false ? 'LIVE' : 'PAPER',
          state,
          logPath: path.join(projectDir, env.LOG_FILE || 'logs/eth_trades.log')
        });
      }
      
      // Check for BTC paper bot
      const btcEnvPath = path.join(projectDir, '.env.btc');
      if (fs.existsSync(btcEnvPath)) {
        const env = parseDotEnv(fs.readFileSync(btcEnvPath, 'utf8'));
        const statePath = path.join(projectDir, env.STATE_FILE || 'var/btc_paper_state.json');
        const state = safeReadJson(statePath);
        bots.push({
          id: 'btc-paper',
          label: 'BTC Paper',
          pair: env.PAIR_WHITELIST || 'BTC/USD',
          mode: toBool(env.PAPER_TRADING) === false ? 'LIVE' : 'PAPER',
          state,
          logPath: path.join(projectDir, env.LOG_FILE || 'logs/btc_trades.log')
        });
      }
      
      return bots;
    };

    const getSignalsFromDb = () => {
      try {
        const dbPath = path.join(projectDir, 'bot.db');
        // Also check parent directory for bot.db (VS Code workspace quirk)
        const parentDbPath = path.join(projectDir, '..', 'bot.db');
        
        let Sqlite, db;
        try {
          Sqlite = require('better-sqlite3');
          if (fs.existsSync(dbPath)) {
            db = Sqlite(dbPath);
          } else if (fs.existsSync(parentDbPath)) {
            db = Sqlite(parentDbPath);
          } else {
            return [];
          }
        } catch {
          return [];
        }
        
        const signals = db.prepare(`
          SELECT * FROM signals 
          ORDER BY income_at DESC 
          LIMIT 50
        `).all();
        
        db.close();
        return signals;
      } catch {
        return [];
      }
    };

    const getLogsFromDb = () => {
      try {
        const dbPath = path.join(projectDir, 'bot.db');
        const parentDbPath = path.join(projectDir, '..', 'bot.db');
        
        let Sqlite, db;
        try {
          Sqlite = require('better-sqlite3');
          if (fs.existsSync(dbPath)) {
            db = Sqlite(dbPath);
          } else if (fs.existsSync(parentDbPath)) {
            db = Sqlite(parentDbPath);
          } else {
            return [];
          }
        } catch {
          return [];
        }
        
        const logs = db.prepare(`
          SELECT * FROM logs 
          ORDER BY id DESC 
          LIMIT 100
        `).all();
        
        db.close();
        return logs;
      } catch {
        return [];
      }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Routes
    // ─────────────────────────────────────────────────────────────────────────

    app.get('/', (req, res) => {
      res.render('unified_dashboard.html.twig', {
        title: 'Unified Trading Dashboard',
        timestamp: new Date().toISOString()
      });
    });

    app.get('/api/status', (req, res) => {
      const bots = getBotStatus();
      const signals = getSignalsFromDb();
      const logs = getLogsFromDb();
      
      res.json({
        timestamp: new Date().toISOString(),
        bots,
        signals,
        logs,
        health: {
          uptime: process.uptime(),
          memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        }
      });
    });

    app.get('/api/signals', (req, res) => {
      res.json(getSignalsFromDb());
    });

    app.get('/api/logs', (req, res) => {
      res.json(getLogsFromDb());
    });

    app.get('/api/logs/file/:bot', (req, res) => {
      const bot = req.params.bot;
      let logPath;
      
      if (bot === 'btc') {
        logPath = path.join(projectDir, 'logs', 'btc_trades.log');
      } else if (bot === 'eth') {
        logPath = path.join(projectDir, 'logs', 'eth_trades.log');
      } else {
        logPath = path.join(projectDir, 'var', 'log', 'log.log');
      }
      
      res.json({ log: tailFile(logPath, 64 * 1024) });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Start server
    // ─────────────────────────────────────────────────────────────────────────

    app.listen(port, '127.0.0.1', () => {
      console.log(`\n🚀 Unified Trading Dashboard running at http://127.0.0.1:${port}\n`);
    });
  }
};
