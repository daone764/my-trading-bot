const express = require('express');
const path = require('path');
const fs = require('fs');
const cronParser = require('cron-parser');

/**
 * Combined Dashboard UI for multiple trading bots (ETH, BTC, etc.)
 * Shows all bots side by side with shared Coinbase balance info.
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

function pctToFrac(pct) {
  if (pct === null || typeof pct === 'undefined') return null;
  return Number(pct) / 100;
}

function computeNextRunAt(scheduleCron) {
  try {
    let expr = null;
    if (typeof cronParser.parseExpression === 'function') {
      expr = cronParser.parseExpression(scheduleCron, { currentDate: new Date() });
    } else if (cronParser.CronExpressionParser?.parse) {
      expr = cronParser.CronExpressionParser.parse(scheduleCron, { currentDate: new Date() });
    }
    return expr ? expr.next().toISOString() : null;
  } catch {
    return null;
  }
}

function computeTradeStats(tradeHistory = []) {
  const sells = tradeHistory.filter(t => t.action === 'SELL');
  const pnls = sells.map(s => Number(s.pnlUsd || 0));
  const totalTrades = sells.length;
  const wins = pnls.filter(p => p > 0).length;
  const losses = pnls.filter(p => p < 0).length;
  const realizedPnlUsd = pnls.reduce((a, b) => a + b, 0);
  const feesPaidUsd = tradeHistory.reduce((acc, t) => acc + Number(t.feeUsd || 0), 0);
  return {
    sells: totalTrades,
    wins,
    losses,
    winRate: totalTrades ? wins / totalTrades : null,
    realizedPnlUsd,
    feesPaidUsd
  };
}

function computePositionRisk(openPosition, price, cfg) {
  if (!openPosition || price === null) return null;
  const stopLossFrac = pctToFrac(cfg.stopLossPercent);
  const takeProfitFrac = pctToFrac(cfg.takeProfitPercent);
  const trailingFrac = pctToFrac(cfg.trailingStopPercent);
  const entry = Number(openPosition.entryPrice);
  const peak = Number(openPosition.peakPrice || openPosition.entryPrice);
  return {
    stopLossPrice: stopLossFrac === null ? null : entry * (1 - stopLossFrac),
    takeProfitPrice: takeProfitFrac === null ? null : entry * (1 + takeProfitFrac),
    trailingStopPrice: trailingFrac === null ? null : peak * (1 - trailingFrac)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot status builder
// ─────────────────────────────────────────────────────────────────────────────

function buildBotStatus({ projectDir, envFile, label }) {
  const envPath = path.join(projectDir, envFile);
  if (!fs.existsSync(envPath)) {
    return { label, error: `Env file not found: ${envFile}`, envFile };
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  const env = parseDotEnv(raw);

  const paperTrading = toBool(env.PAPER_TRADING);
  const enableLiveTrading = toBool(env.ENABLE_LIVE_TRADING);
  const mode = paperTrading === false && enableLiveTrading === true ? 'LIVE' : 'PAPER';

  const pair = env.PAIR_WHITELIST || 'UNKNOWN';
  const asset = pair.split('/')[0] || 'ASSET';

  const config = {
    pair,
    scheduleCron: env.SCHEDULE_CRON || '*/15 * * * *',
    totalCapitalUsd: toNum(env.TOTAL_CAPITAL_USD),
    emaShort: toNum(env.EMA_SHORT),
    emaLong: toNum(env.EMA_LONG),
    rsiOversold: toNum(env.RSI_OVERSOLD),
    rsiOverbought: toNum(env.RSI_OVERBOUGHT),
    stopLossPercent: toNum(env.STOP_LOSS_PERCENT),
    takeProfitPercent: toNum(env.TAKE_PROFIT_PERCENT),
    trailingStopPercent: toNum(env.TRAILING_STOP_PERCENT)
  };

  const statePath = path.join(projectDir, env.STATE_FILE || `var/${asset.toLowerCase()}_paper_state.json`);
  const logPath = path.join(projectDir, env.LOG_FILE || `logs/${asset.toLowerCase()}_trades.log`);

  const state = safeReadJson(statePath);
  const lastTick = state?.lastTick || null;
  const price = lastTick?.close ?? lastTick?.lastClose ?? null;

  const health = (() => {
    const lastTickAt = lastTick?.at || null;
    if (!lastTickAt) return { lastTickAt: null, secondsSinceLastTick: null, stale: null };
    const ageSec = Math.round((Date.now() - Date.parse(lastTickAt)) / 1000);
    return {
      lastTickAt,
      secondsSinceLastTick: Number.isFinite(ageSec) ? ageSec : null,
      stale: Number.isFinite(ageSec) ? ageSec > 60 * 20 : null
    };
  })();

  const tradeStats = computeTradeStats(state?.tradeHistory || []);
  const positionRisk = computePositionRisk(state?.openPosition, price, config);

  const wallet = state?.wallet || { usd: 0, eth: 0 };
  const assetQty = wallet.eth || wallet[asset.toLowerCase()] || 0;
  const equityUsd = price !== null ? Number(wallet.usd || 0) + Number(assetQty) * Number(price) : null;

  const open = state?.openPosition || null;
  const unrealizedPnlUsd = open && price !== null
    ? Number(open.qtyEth || 0) * Number(price) - Number(open.costUsd || 0) - Number(open.feeUsd || 0)
    : null;

  const recentTrades = (state?.tradeHistory || []).slice(-5).reverse();

  return {
    label: label || pair,
    envFile,
    pair,
    asset,
    mode,
    config,
    health,
    price,
    wallet: { usd: wallet.usd, asset: assetQty },
    equityUsd,
    unrealizedPnlUsd,
    openPosition: open,
    positionRisk,
    tradeStats,
    recentTrades,
    logTail: tailFile(logPath, 16 * 1024),
    statePath,
    logPath,
    nextRunAt: computeNextRunAt(config.scheduleCron),
    indicators: lastTick?.indicators || {},
    signals: lastTick?.signals || {},
    decision: lastTick?.decision || {}
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Express server
// ─────────────────────────────────────────────────────────────────────────────

module.exports = class CombinedUiCommand {
  async execute({ projectDir, port = 8082, services = null } = {}) {
    const app = express();
    
    // Initialize services if passed (for full bot integration)
    let signalHttp, pairsHttp, logsHttp, candleExportHttp, exchangeManager, ordersHttp, tickers, ta, systemUtil;
    if (services) {
      signalHttp = services.getSignalHttp ? services.getSignalHttp() : null;
      pairsHttp = services.getPairsHttp ? services.getPairsHttp() : null;
      logsHttp = services.getLogsHttp ? services.getLogsHttp() : null;
      candleExportHttp = services.getCandleExportHttp ? services.getCandleExportHttp() : null;
      exchangeManager = services.getExchangeManager ? services.getExchangeManager() : null;
      ordersHttp = services.getOrdersHttp ? services.getOrdersHttp() : null;
      tickers = services.getTickers ? services.getTickers() : null;
      ta = services.getTa ? services.getTa() : null;
      systemUtil = services.getSystemUtil ? services.getSystemUtil() : null;
    }

    // Bot configurations - add more here if needed
    const bots = [
      { envFile: '.env', label: 'ETH' },
      { envFile: '.env.btc', label: 'BTC' }
    ];

    const getAllStatus = () => {
      return bots.map(b => buildBotStatus({ projectDir, envFile: b.envFile, label: b.label }));
    };

    const escapeHtml = value =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const fmtNum = (value, digits = 2) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'n/a';
      return n.toFixed(digits);
    };

    const fmtUsd = value => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'n/a';
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
    };

    const fmtPct = (value, digits = 0) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'n/a';
      return `${(n * 100).toFixed(digits)}%`;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Database helpers (read bot.db from trading bot)
    // ─────────────────────────────────────────────────────────────────────────
    
    const getDbConnection = () => {
      try {
        const Sqlite = require('better-sqlite3');
        const dbPath = path.join(projectDir, 'bot.db');
        if (!fs.existsSync(dbPath)) return null;
        return Sqlite(dbPath);
      } catch {
        return null;
      }
    };
    
    const getSignalsFromDb = () => {
      const db = getDbConnection();
      if (!db) return [];
      try {
        const signals = db.prepare('SELECT * FROM signals ORDER BY income_at DESC LIMIT 100').all();
        db.close();
        return signals;
      } catch (e) {
        console.error('Error getting signals from DB:', e.message);
        try { db.close(); } catch {}
        return [];
      }
    };
    
    const getTradesFromDb = () => {
      const db = getDbConnection();
      if (!db) return [];
      try {
        const trades = db.prepare('SELECT * FROM trades ORDER BY time DESC LIMIT 50').all();
        db.close();
        return trades;
      } catch (e) {
        console.error('Error getting trades from DB:', e.message);
        try { db.close(); } catch {}
        return [];
      }
    };
    
    const getLogsFromDb = () => {
      const db = getDbConnection();
      if (!db) return [];
      try {
        // Try with 'id' column first, fallback to rowid if that doesn't work
        try {
          const logs = db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 200').all();
          db.close();
          return logs;
        } catch (e) {
          // If id column doesn't exist, try with created_at or just limit
          try {
            const logs = db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200').all();
            db.close();
            return logs;
          } catch {
            const logs = db.prepare('SELECT * FROM logs LIMIT 200').all();
            db.close();
            return logs;
          }
        }
      } catch (e) {
        console.error('Error getting logs from DB:', e.message);
        try { db.close(); } catch {}
        return [];
      }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // API endpoints
    // ─────────────────────────────────────────────────────────────────────────
    
    app.get('/api/status', (req, res) => {
      res.json({ 
        now: new Date().toISOString(), 
        bots: getAllStatus(),
        signals: getSignalsFromDb(),
        trades: getTradesFromDb(),
        logs: getLogsFromDb().slice(0, 50)
      });
    });
    
    app.get('/api/signals', (req, res) => {
      res.json(getSignalsFromDb());
    });
    
    app.get('/api/trades', (req, res) => {
      res.json(getTradesFromDb());
    });
    
    app.get('/api/logs', (req, res) => {
      res.json(getLogsFromDb());
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Main dashboard
    // ─────────────────────────────────────────────────────────────────────────
    
    app.get('/', async (req, res) => {
      try {
        const allBots = getAllStatus();
        const now = new Date().toISOString();
        
        // Get trading data from database
        const signals = getSignalsFromDb();
        const trades = getTradesFromDb();
        const logs = getLogsFromDb();
        
        // Get technical analysis data if ta service available
        let taData = null;
        if (ta && systemUtil) {
          try {
            taData = await ta.getTaForPeriods(systemUtil.getConfig('dashboard.periods', ['15m', '1h']));
          } catch (e) {
            console.error('Error getting TA data:', e.message);
          }
        }

        // Aggregate stats
        const totalEquity = allBots.reduce((sum, b) => sum + (b.equityUsd || 0), 0);
        const totalPnl = allBots.reduce((sum, b) => sum + (b.tradeStats?.realizedPnlUsd || 0), 0);
        const totalUnrealized = allBots.reduce((sum, b) => sum + (b.unrealizedPnlUsd || 0), 0);

      const renderBotCard = (bot) => {
        if (bot.error) {
          return `
            <div class="bot-card error">
              <h3>${escapeHtml(bot.label)} <span class="pill error">ERROR</span></h3>
              <div class="muted">${escapeHtml(bot.error)}</div>
            </div>
          `;
        }

        const ind = bot.indicators;
        const sig = bot.signals;
        const dec = bot.decision;
        const pos = bot.openPosition;
        const risk = bot.positionRisk;
        const cfg = bot.config;

        return `
          <div class="bot-card">
            <div class="bot-header">
              <h3>${escapeHtml(bot.pair)} <span class="pill ${bot.mode === 'LIVE' ? 'live' : 'paper'}">${bot.mode}</span></h3>
              <div class="muted">Next: ${escapeHtml(bot.nextRunAt || 'unknown')}</div>
            </div>
            
            <div class="bot-grid">
              <div class="stat-box">
                <div class="stat-label">Price</div>
                <div class="stat-value">${fmtUsd(bot.price)}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Equity</div>
                <div class="stat-value">${fmtUsd(bot.equityUsd)}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Realized P&L</div>
                <div class="stat-value ${bot.tradeStats.realizedPnlUsd >= 0 ? 'profit' : 'loss'}">${fmtUsd(bot.tradeStats.realizedPnlUsd)}</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Unrealized</div>
                <div class="stat-value ${(bot.unrealizedPnlUsd || 0) >= 0 ? 'profit' : 'loss'}">${bot.unrealizedPnlUsd !== null ? fmtUsd(bot.unrealizedPnlUsd) : 'n/a'}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Indicators</div>
              <div class="indicator-row">
                <span>EMA${cfg.emaShort || 12}: ${fmtNum(ind.emaShort, 2)}</span>
                <span>EMA${cfg.emaLong || 26}: ${fmtNum(ind.emaLong, 2)}</span>
                <span>RSI: ${fmtNum(ind.rsi, 1)}</span>
              </div>
              <div class="indicator-row">
                <span>Crossed: ${sig.crossedUp === true ? '✅ UP' : sig.crossedUp === false ? '❌ NO' : 'n/a'}</span>
                <span>RSI OK: ${sig.inRsiBand === true ? '✅' : sig.inRsiBand === false ? '❌' : 'n/a'}</span>
                <span>Decision: <strong>${escapeHtml(dec.action || 'n/a')}</strong></span>
              </div>
            </div>

            ${pos ? `
              <div class="section position">
                <div class="section-title">Open Position</div>
                <div class="pos-grid">
                  <div><span class="label">Entry:</span> ${fmtUsd(pos.entryPrice)}</div>
                  <div><span class="label">Qty:</span> ${fmtNum(pos.qtyEth, 6)} ${bot.asset}</div>
                  <div><span class="label">Peak:</span> ${fmtUsd(pos.peakPrice)}</div>
                  <div><span class="label">Cost:</span> ${fmtUsd(pos.costUsd)}</div>
                </div>
                <div class="stops">
                  SL: ${risk?.stopLossPrice ? fmtUsd(risk.stopLossPrice) : 'n/a'} |
                  TP: ${risk?.takeProfitPrice ? fmtUsd(risk.takeProfitPrice) : 'n/a'} |
                  Trail: ${risk?.trailingStopPrice ? fmtUsd(risk.trailingStopPrice) : 'n/a'}
                </div>
              </div>
            ` : `
              <div class="section no-position">
                <div class="muted">No open position</div>
              </div>
            `}

            <div class="section">
              <div class="section-title">Stats (${bot.tradeStats.sells} trades)</div>
              <div class="stats-row">
                <span>Wins: ${bot.tradeStats.wins}</span>
                <span>Losses: ${bot.tradeStats.losses}</span>
                <span>Win Rate: ${bot.tradeStats.winRate !== null ? fmtPct(bot.tradeStats.winRate) : 'n/a'}</span>
                <span>Fees: ${fmtUsd(bot.tradeStats.feesPaidUsd)}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Health</div>
              <div class="health-row">
                <span>Last tick: ${escapeHtml(bot.health.lastTickAt || 'never')}</span>
                ${bot.health.stale ? '<span class="pill stale">STALE</span>' : '<span class="pill ok">OK</span>'}
              </div>
            </div>

            <details class="log-section">
              <summary>Recent Logs</summary>
              <pre class="log-content">${escapeHtml(bot.logTail || 'No logs yet')}</pre>
            </details>
          </div>
        `;
      };

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="10" />
  <title>Trading Dashboard</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      margin: 0; padding: 16px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e8e8e8;
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    
    .header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
    }
    .header h1 { margin: 0; font-size: 24px; color: #fff; }
    .header .muted { color: #888; font-size: 12px; }
    
    .summary-bar {
      display: flex; gap: 24px; flex-wrap: wrap;
      background: rgba(255,255,255,0.05);
      border-radius: 12px; padding: 16px 24px;
      margin-bottom: 20px;
    }
    .summary-item { text-align: center; }
    .summary-item .label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
    .summary-item .value { font-size: 22px; font-weight: 600; color: #fff; }
    .summary-item .value.profit { color: #4ade80; }
    .summary-item .value.loss { color: #f87171; }
    
    .bots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
      gap: 16px;
    }
    
    .bot-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
    }
    .bot-card.error {
      border-color: #f87171;
      background: rgba(248,113,113,0.1);
    }
    
    .bot-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
    .bot-header h3 { margin: 0; font-size: 18px; color: #fff; }
    
    .pill {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 10px; text-transform: uppercase; font-weight: 600;
    }
    .pill.paper { background: #3b82f6; color: #fff; }
    .pill.live { background: #f59e0b; color: #000; }
    .pill.stale { background: #f59e0b; color: #000; }
    .pill.ok { background: #4ade80; color: #000; }
    .pill.error { background: #f87171; color: #fff; }
    
    .muted { color: #888; font-size: 12px; }
    
    .bot-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
      margin-bottom: 12px;
    }
    .stat-box {
      background: rgba(255,255,255,0.05);
      border-radius: 8px; padding: 8px; text-align: center;
    }
    .stat-label { font-size: 10px; text-transform: uppercase; color: #888; }
    .stat-value { font-size: 14px; font-weight: 600; color: #fff; margin-top: 2px; }
    .stat-value.profit { color: #4ade80; }
    .stat-value.loss { color: #f87171; }
    
    .section { margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; }
    .section-title { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 0.04em; }
    
    .indicator-row, .stats-row, .health-row {
      display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px;
    }
    .indicator-row span, .stats-row span { color: #ccc; }
    
    .position { border-left: 3px solid #3b82f6; }
    .pos-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; font-size: 12px; }
    .pos-grid .label { color: #888; }
    .stops { margin-top: 6px; font-size: 11px; color: #888; }
    
    .no-position { text-align: center; padding: 16px; }
    
    .health-row { align-items: center; }
    
    .log-section { margin-top: 8px; }
    .log-section summary {
      cursor: pointer; font-size: 12px; color: #888;
      padding: 4px 0;
    }
    .log-content {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px; line-height: 1.4;
      background: #0d0d0d; border: 1px solid #333;
      padding: 8px; border-radius: 6px;
      max-height: 200px; overflow: auto;
      white-space: pre-wrap; word-break: break-all;
      color: #aaa;
    }
    
    .footer { text-align: center; margin-top: 20px; color: #555; font-size: 11px; }
    .footer a { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>📈 Trading Dashboard</h1>
        <div class="muted">Auto-refreshes every 10s • API: <a href="/api/status" style="color:#3b82f6">/api/status</a></div>
      </div>
      <div class="muted">${escapeHtml(now)}</div>
    </div>

    <div class="summary-bar">
      <div class="summary-item">
        <div class="label">Active Bots</div>
        <div class="value">${allBots.filter(b => !b.error).length}</div>
      </div>
      <div class="summary-item">
        <div class="label">Total Equity</div>
        <div class="value">${fmtUsd(totalEquity)}</div>
      </div>
      <div class="summary-item">
        <div class="label">Realized P&L</div>
        <div class="value ${totalPnl >= 0 ? 'profit' : 'loss'}">${fmtUsd(totalPnl)}</div>
      </div>
      <div class="summary-item">
        <div class="label">Unrealized</div>
        <div class="value ${totalUnrealized >= 0 ? 'profit' : 'loss'}">${fmtUsd(totalUnrealized)}</div>
      </div>
    </div>

    <div class="bots-grid">
      ${allBots.map(renderBotCard).join('')}
    </div>

    <!-- Technical Analysis Table -->
    ${taData && taData.rows ? `
    <div style="margin-top: 30px;">
      <h2 style="color: #fff; margin-bottom: 16px;">📈 Technical Analysis & Indicators</h2>
      <div class="section">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: rgba(0,0,0,0.3);">
            <thead>
              <tr style="border-bottom: 2px solid rgba(255,255,255,0.2);">
                <th style="padding: 10px; text-align: left; color: #888; position: sticky; left: 0; background: rgba(13,13,13,0.95); z-index: 2;" rowspan="2">Symbol</th>
                <th style="padding: 10px; text-align: left; color: #888; position: sticky; left: 100px; background: rgba(13,13,13,0.95); z-index: 2;" rowspan="2">Price</th>
                <th style="padding: 10px; text-align: left; color: #888;" rowspan="2">24h</th>
                ${taData.periods.map(p => `<th style="padding: 10px; text-align: center; color: #4ade80; font-weight: 600; border-left: 1px solid rgba(255,255,255,0.1);" colspan="10">${escapeHtml(p)}</th>`).join('')}
              </tr>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                ${taData.periods.map(() => `
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px; text-transform: uppercase; border-left: 1px solid rgba(255,255,255,0.05);">T</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">S200/50</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">E200/55</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">RSI</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">CCI</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">SRSI</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">AO</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">MACD</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">MFI</th>
                  <th style="padding: 6px; text-align: center; color: #666; font-size: 10px;">BB</th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${Object.entries(taData.rows).map(([symbol, row]) => {
                const pctChange = row.percentage_change || 0;
                const price = row.ticker?.bid || 0;
                return `
                  <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 10px; color: #fff; font-weight: 600; position: sticky; left: 0; background: rgba(13,13,13,0.95);">${escapeHtml(symbol)}</td>
                    <td style="padding: 10px; color: #ccc; position: sticky; left: 100px; background: rgba(13,13,13,0.95);">${price ? fmtUsd(price) : 'n/a'}</td>
                    <td style="padding: 10px;">
                      <span style="font-weight: 600;" class="${pctChange >= 0 ? 'profit' : 'loss'}">${pctChange >= 0 ? '+' : ''}${fmtNum(pctChange, 1)}%</span>
                    </td>
                    ${taData.periods.map(period => {
                      const ta = row.ta?.[period] || {};
                      const rsi = ta.rsi?.value || 0;
                      const cci = ta.cci?.value || 0;
                      const ema55 = ta.ema_55?.value || 0;
                      const ema200 = ta.ema_200?.value || 0;
                      const sma50 = ta.sma_50?.value || 0;
                      const sma200 = ta.sma_200?.value || 0;
                      const macd = ta.macd?.value?.histogram || 0;
                      const ao = ta.ao?.value || 0;
                      const mfi = ta.mfi?.value || 0;
                      const srsi = ta.stoch_rsi?.value || {};
                      
                      return `
                        <td style="padding: 8px; text-align: center; border-left: 1px solid rgba(255,255,255,0.05);">
                          <span style="font-size: 16px;" class="${ema55 > ema200 ? 'profit' : 'loss'}">${ema55 > ema200 ? '↑' : '↓'}</span>
                        </td>
                        <td style="padding: 8px; text-align: center;">
                          <span class="${price > sma200 ? 'profit' : 'loss'}">${price > sma200 ? '↑' : '↓'}</span>
                          <span class="${price > sma50 ? 'profit' : 'loss'}" style="font-size: 10px; margin-left: 2px;">${price > sma50 ? '↑' : '↓'}</span>
                        </td>
                        <td style="padding: 8px; text-align: center;">
                          <span class="${price > ema200 ? 'profit' : 'loss'}">${price > ema200 ? '↑' : '↓'}</span>
                          <span class="${price > ema55 ? 'profit' : 'loss'}" style="font-size: 10px; margin-left: 2px;">${price > ema55 ? '↑' : '↓'}</span>
                        </td>
                        <td style="padding: 8px; text-align: center; font-weight: ${rsi >= 80 || rsi <= 20 ? 'bold' : 'normal'}; color: ${rsi <= 30 ? '#4ade80' : rsi >= 70 ? '#f87171' : '#ccc'};">
                          ${fmtNum(rsi, 0)}
                        </td>
                        <td style="padding: 8px; text-align: center; font-weight: ${cci >= 250 || cci <= -250 ? 'bold' : 'normal'}; color: ${cci <= -100 ? '#4ade80' : cci >= 100 ? '#f87171' : '#ccc'};">
                          ${fmtNum(cci, 0)}
                        </td>
                        <td style="padding: 8px; text-align: center; font-size: 14px;">
                          ${srsi.stoch_k >= 80 && srsi.stoch_d >= 80 ? '🔴' : srsi.stoch_k <= 20 && srsi.stoch_d <= 20 ? '🟢' : '⚪'}
                        </td>
                        <td style="padding: 8px; text-align: center;">
                          <span class="${ao > 0 ? 'profit' : 'loss'}" style="font-size: 16px;">${ao > 0 ? '↑' : '↓'}</span>
                        </td>
                        <td style="padding: 8px; text-align: center;">
                          <span class="${macd > 0 ? 'profit' : 'loss'}" style="font-size: 16px;">${macd > 0 ? '↑' : '↓'}</span>
                        </td>
                        <td style="padding: 8px; text-align: center; color: ${mfi <= 20 ? '#4ade80' : mfi >= 80 ? '#f87171' : '#ccc'};">
                          ${mfi ? fmtNum(mfi, 0) : '-'}
                        </td>
                        <td style="padding: 8px; text-align: center; font-size: 14px;">
                          ${ta.bb?.value ? (price <= ta.bb.value.lower ? '↓' : price >= ta.bb.value.upper ? '↑' : '·') : '-'}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Trading Data Sections -->
    <div style="margin-top: 30px;">
      <h2 style="color: #fff; margin-bottom: 16px;">📊 Trading Activity</h2>
      
      <!-- Signals Table -->
      <div class="section">
        <div class="section-title">Recent Signals (Last 20)</div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <th style="padding: 8px; text-align: left; color: #888;">Time</th>
                <th style="padding: 8px; text-align: left; color: #888;">Symbol</th>
                <th style="padding: 8px; text-align: left; color: #888;">Strategy</th>
                <th style="padding: 8px; text-align: left; color: #888;">Signal</th>
                <th style="padding: 8px; text-align: left; color: #888;">Price</th>
              </tr>
            </thead>
            <tbody id="signals-tbody">
              ${(() => {
                if (signals.length === 0) {
                  return '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #666;">No signals yet</td></tr>';
                }
                return signals.slice(0, 20).map(s => `
                  <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 8px; color: #ccc;">${new Date(s.income_at * 1000).toLocaleString()}</td>
                    <td style="padding: 8px; color: #ccc;">${escapeHtml(s.symbol || '')}</td>
                    <td style="padding: 8px; color: #ccc;">${escapeHtml(s.strategy || '')}</td>
                    <td style="padding: 8px;">
                      <span class="pill ${s.signal === 'long' ? 'ok' : s.signal === 'short' ? 'error' : 'paper'}">${escapeHtml(s.signal || '')}</span>
                    </td>
                    <td style="padding: 8px; color: #ccc;">${s.price ? fmtUsd(s.price) : 'n/a'}</td>
                  </tr>
                `).join('');
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Trades Table -->
      <div class="section" style="margin-top: 16px;">
        <div class="section-title">Recent Trades (Last 15)</div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <th style="padding: 8px; text-align: left; color: #888;">Time</th>
                <th style="padding: 8px; text-align: left; color: #888;">Symbol</th>
                <th style="padding: 8px; text-align: left; color: #888;">Side</th>
                <th style="padding: 8px; text-align: left; color: #888;">Price</th>
                <th style="padding: 8px; text-align: left; color: #888;">Amount</th>
                <th style="padding: 8px; text-align: left; color: #888;">P&L</th>
              </tr>
            </thead>
            <tbody id="trades-tbody">
              ${(() => {
                if (trades.length === 0) {
                  return '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #666;">No trades yet</td></tr>';
                }
                return trades.slice(0, 15).map(t => {
                  const pnl = t.profit ? Number(t.profit) : 0;
                  return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                      <td style="padding: 8px; color: #ccc;">${new Date(t.time * 1000).toLocaleString()}</td>
                      <td style="padding: 8px; color: #ccc;">${escapeHtml(t.symbol || '')}</td>
                      <td style="padding: 8px;">
                        <span class="pill ${t.side === 'long' || t.side === 'buy' ? 'ok' : 'error'}">${escapeHtml(t.side || '')}</span>
                      </td>
                      <td style="padding: 8px; color: #ccc;">${t.price ? fmtUsd(t.price) : 'n/a'}</td>
                      <td style="padding: 8px; color: #ccc;">${t.amount ? fmtNum(t.amount, 6) : 'n/a'}</td>
                      <td style="padding: 8px;" class="${pnl >= 0 ? 'profit' : 'loss'}">${pnl !== 0 ? fmtUsd(pnl) : '-'}</td>
                    </tr>
                  `;
                }).join('');
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Logs Section -->
      <div class="section" style="margin-top: 16px;">
        <div class="section-title">Recent Logs (Last 30)</div>
        <div class="log-content" style="max-height: 300px;">
${(() => {
  if (logs.length === 0) {
    return 'No logs yet';
  }
  return logs.slice(0, 30).map(log => {
    const ts = new Date(log.created_at).toLocaleString();
    const level = log.level || 'info';
    const msg = String(log.message || '').substring(0, 200);
    return `[${ts}] [${level.toUpperCase()}] ${escapeHtml(msg)}`;
  }).join('\n');
})()}
        </div>
      </div>
    </div>

    <div class="footer" style="margin-top: 30px;">
      Combined Trading Dashboard • <a href="/">Refresh</a> • <a href="/api/status">API</a>
    </div>
  </div>

  <script>
    // Auto-refresh every 10 seconds
    setTimeout(() => location.reload(), 10000);
  </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
      } catch (error) {
        console.error('Error rendering dashboard:', error.message, error.stack);
        res.status(500).send(`<h1>Error</h1><pre>${error.message}\n\n${error.stack}</pre>`);
      }
    });

    app.listen(port, '127.0.0.1', () => {
      // eslint-disable-next-line no-console
      console.log(`Combined Trading Dashboard listening on http://127.0.0.1:${port}`);
    });
  }
};
