const express = require('express');

const { buildStatusAsync } = require('../eth_paper/ui_status');

module.exports = class EthPaperUiCommand {
  async execute({ projectDir, port = 8081 } = {}) {
    const app = express();

    const getStatus = async () => buildStatusAsync({ projectDir });

    const escapeHtml = value =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const fmtBool = value => (value === null || value === undefined ? 'unknown' : String(Boolean(value)));
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

    app.get('/api/eth-paper/status', async (req, res) => {
      res.json(await getStatus());
    });

    app.get('/', async (req, res) => {
      const status = await getStatus();
      const { flags, env, health, state, derived, files, logTail } = status;

      const cfg = env?.config || {};
      const lastTick = state?.lastTick || null;
      const indicators = lastTick?.indicators || {};
      const signals = lastTick?.signals || {};
      const decision = lastTick?.decision || {};

      const safeStatePath = escapeHtml(files.statePath);
      const safeLogPath = escapeHtml(files.logPath);
      const safeNow = escapeHtml(status.now);
      const safeNextRun = escapeHtml(env?.nextRunAt || 'unknown');

      const trades = Array.isArray(derived?.recentTrades) ? derived.recentTrades : [];
      const cb = derived?.coinbaseBalances || null;

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="5" />
  <title>ETH Paper UI</title>
  <style>
    :root {
      color-scheme: light;
    }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      background: #fafafa;
      color: #111;
      line-height: 1.35;
    }
    a { color: inherit; }
    h1, h2, h3 { margin: 0 0 8px 0; }
    h2 { font-size: 20px; }
    h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #333; }
    .container { max-width: 1100px; margin: 0 auto; }
    .topbar { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; margin-bottom: 12px; }
    .muted { color: #555; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
    .card {
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 10px;
      padding: 12px;
    }
    .card.full { grid-column: 1 / -1; }
    .kv { margin: 0; }
    .kv > div { display: grid; grid-template-columns: 160px 1fr; gap: 10px; padding: 4px 0; border-bottom: 1px dashed #eee; }
    .kv > div:last-child { border-bottom: 0; }
    .kv dt { font-weight: 600; color: #333; }
    .kv dd { margin: 0; color: #111; word-break: break-word; }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid #ddd;
      background: #f6f6f6;
      vertical-align: middle;
    }
    .pill.stale { border-color: #c9c9c9; background: #fff3cd; }
    code.path {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      background: #f6f6f6;
      border: 1px solid #eee;
      padding: 1px 6px;
      border-radius: 6px;
      word-break: break-word;
    }
    pre.code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      line-height: 1.4;
      background: #f7f7f7;
      border: 1px solid #eee;
      padding: 12px;
      border-radius: 10px;
      max-height: 420px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 8px 0 0 0;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; font-size: 12px; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    th { font-weight: 600; color: #333; background: #fafafa; position: sticky; top: 0; }
    td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="topbar">
      <div>
        <h2>ETH Paper Trading UI</h2>
        <div class="muted">Auto-refreshes every 5 seconds. API: <a href="/api/eth-paper/status">/api/eth-paper/status</a></div>
      </div>
      <div class="muted">Rendered at <span class="mono">${safeNow}</span></div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Mode</h3>
        <dl class="kv">
          <div><dt>Mode</dt><dd><span class="pill">${escapeHtml(flags.mode)}</span></dd></div>
          <div><dt>PAPER_TRADING</dt><dd>${escapeHtml(fmtBool(flags.paperTrading))}</dd></div>
          <div><dt>ENABLE_LIVE_TRADING</dt><dd>${escapeHtml(fmtBool(flags.enableLiveTrading))}</dd></div>
          <div><dt>Next run (UTC)</dt><dd class="mono">${safeNextRun}</dd></div>
        </dl>
      </div>

      <div class="card">
        <h3>Health</h3>
        <dl class="kv">
          <div><dt>State file</dt><dd><code class="path">${safeStatePath}</code></dd></div>
          <div><dt>Log file</dt><dd><code class="path">${safeLogPath}</code></dd></div>
          <div><dt>Last tick</dt><dd class="mono">${escapeHtml(health.lastTickAt || 'never')}</dd></div>
          <div><dt>Age</dt><dd>
            ${health.secondsSinceLastTick === null ? 'n/a' : `${health.secondsSinceLastTick}s`}
            ${health.stale ? '<span class="pill stale">STALE</span>' : ''}
          </dd></div>
        </dl>
      </div>

      <div class="card">
        <h3>Market / Indicators</h3>
        ${
          lastTick
            ? `
              <dl class="kv">
                <div><dt>Candle time</dt><dd class="mono">${escapeHtml(lastTick.candleTime || 'n/a')}</dd></div>
                <div><dt>Close</dt><dd>${fmtNum(lastTick.close, 2)}</dd></div>
                <div><dt>EMA${escapeHtml(cfg.emaShort || 12)}</dt><dd>${fmtNum(indicators.emaShort, 6)}</dd></div>
                <div><dt>EMA${escapeHtml(cfg.emaLong || 26)}</dt><dd>${fmtNum(indicators.emaLong, 6)}</dd></div>
                <div><dt>RSI(14)</dt><dd>${fmtNum(indicators.rsi, 2)}</dd></div>
                <div><dt>Crossed up</dt><dd>${signals.crossedUp === undefined ? 'n/a' : escapeHtml(String(signals.crossedUp))}</dd></div>
                <div><dt>RSI in band</dt><dd>${signals.inRsiBand === undefined ? 'n/a' : escapeHtml(String(signals.inRsiBand))}</dd></div>
                 <div><dt>Decision</dt><dd>${escapeHtml(decision.action || 'n/a')}${
                decision.reason ? ` <span class="muted">(${escapeHtml(decision.reason)})</span>` : ''
              }</dd></div>
              </dl>
            `
            : `<div class="muted">No lastTick data yet.</div>`
        }
      </div>

      <div class="card">
        <h3>Wallet / Performance</h3>
        ${
          state
            ? `
              <dl class="kv">
                <div><dt>Wallet source</dt><dd><span class="pill">${escapeHtml(derived.walletSource || 'n/a')}</span></dd></div>
                <div><dt>Paper USD</dt><dd>${fmtUsd(state.wallet?.usd)}</dd></div>
                <div><dt>Paper ETH</dt><dd>${fmtNum(state.wallet?.eth, 6)}</dd></div>
                <div><dt>Price</dt><dd>${derived.price === null ? 'n/a' : fmtNum(derived.price, 2)}</dd></div>
                <div><dt>Equity</dt><dd>${derived.equityUsd === null ? 'n/a' : fmtUsd(derived.equityUsd)}</dd></div>
                <div><dt>Realized PnL</dt><dd>${fmtUsd(derived.tradeStats.realizedPnlUsd)}</dd></div>
                <div><dt>Fees paid</dt><dd>${fmtUsd(derived.tradeStats.feesPaidUsd)}</dd></div>
                 <div><dt>Sells / Win rate</dt><dd>${escapeHtml(String(derived.tradeStats.sells))} / ${
                derived.tradeStats.winRate === null ? 'n/a' : fmtPct(derived.tradeStats.winRate, 0)
              }</dd></div>
              </dl>
              ${
                flags.mode === 'PAPER'
                  ? `<div class="muted" style="margin-top: 8px;">In PAPER mode, this wallet is simulated and starts from <span class="mono">TOTAL_CAPITAL_USD</span> (default 100).</div>`
                  : ''
              }
            `
            : `<div class="muted">No state loaded.</div>`
        }
      </div>

      <div class="card">
        <h3>Coinbase balances (read-only)</h3>
        ${
          cb
            ? `
              <dl class="kv">
                <div><dt>Status</dt><dd>${
                  cb.error ? `<span class="pill stale">ERROR</span> <span class="muted">${escapeHtml(cb.error)}</span>` : '<span class="pill">OK</span>'
                }</dd></div>
                <div><dt>Fetched at</dt><dd class="mono">${escapeHtml(cb.fetchedAt || 'n/a')}</dd></div>
                <div><dt>Free USD</dt><dd>${cb.free ? fmtUsd(cb.free.usd) : 'n/a'}</dd></div>
                <div><dt>Free ETH</dt><dd>${cb.free ? fmtNum(cb.free.eth, 6) : 'n/a'}</dd></div>
              </dl>
              <div class="muted" style="margin-top: 8px;">Shown automatically when <span class="mono">COINBASE_API_KEY</span> + <span class="mono">COINBASE_API_SECRET</span> exist. Disable by setting <span class="mono">SHOW_COINBASE_BALANCES=false</span>. This does not enable trading.</div>
            `
            : `<div class="muted">No Coinbase API credentials detected. Add <span class="mono">COINBASE_API_KEY</span> and <span class="mono">COINBASE_API_SECRET</span> to <span class="mono">.env</span> to display your real balances here (read-only).</div>`
        }
      </div>

      <div class="card full">
        <h3>Position / Risk</h3>
        ${
          state?.openPosition
            ? `
              <dl class="kv">
                <div><dt>Pair</dt><dd>${escapeHtml(state.openPosition.pair)}</dd></div>
                <div><dt>Entry</dt><dd>${fmtNum(state.openPosition.entryPrice, 2)}</dd></div>
                <div><dt>Qty ETH</dt><dd>${fmtNum(state.openPosition.qtyEth, 6)}</dd></div>
                <div><dt>Peak</dt><dd>${fmtNum(state.openPosition.peakPrice, 2)}</dd></div>
                <div><dt>Unrealized PnL</dt><dd>${
                  derived.positionRisk?.unrealizedPnlUsd === null || derived.positionRisk?.unrealizedPnlUsd === undefined
                    ? 'n/a'
                    : fmtUsd(derived.positionRisk.unrealizedPnlUsd)
                }</dd></div>
                <div><dt>Stops</dt><dd>
                  SL ${derived.positionRisk?.stopLossPrice ? fmtNum(derived.positionRisk.stopLossPrice, 2) : 'n/a'} | 
                  TP ${derived.positionRisk?.takeProfitPrice ? fmtNum(derived.positionRisk.takeProfitPrice, 2) : 'n/a'} | 
                  Trail ${derived.positionRisk?.trailingStopPrice ? fmtNum(derived.positionRisk.trailingStopPrice, 2) : 'n/a'}
                </dd></div>
              </dl>
            `
            : `<div class="muted">No open position.</div>`
        }
      </div>

      <div class="card full">
        <h3>Recent trades (last 10)</h3>
        ${
          trades.length
            ? `
              <div style="overflow:auto; max-height: 360px; border: 1px solid #eee; border-radius: 10px;">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Price</th>
                      <th>USD</th>
                      <th>ETH</th>
                      <th>Fee</th>
                      <th>PnL</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${trades
                      .map(t => {
                        const at = escapeHtml(t.at || t.time || '');
                        const action = escapeHtml(t.action || '');
                        const reason = escapeHtml(t.reason || '');
                        const price = fmtNum(t.price, 2);
                        const amountUsd = fmtUsd(t.amountUsd);
                        const qtyEth = fmtNum(t.qtyEth, 6);
                        const feeUsd = fmtUsd(t.feeUsd);
                        const pnlUsd = fmtUsd(t.pnlUsd);
                        return `
                          <tr>
                            <td class="mono">${at}</td>
                            <td>${action}</td>
                            <td class="mono">${price}</td>
                            <td class="mono">${amountUsd}</td>
                            <td class="mono">${qtyEth}</td>
                            <td class="mono">${feeUsd}</td>
                            <td class="mono">${pnlUsd}</td>
                            <td>${reason}</td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
            : `<div class="muted">No trades yet.</div>`
        }
      </div>

      <div class="card full">
        <h3>Config snapshot (safe)</h3>
        <pre class="code">${escapeHtml(JSON.stringify(cfg || {}, null, 2))}</pre>
      </div>

      <div class="card full">
        <h3>Recent logs</h3>
        <div class="muted">Tailing <code class="path">${safeLogPath}</code></div>
        <pre class="code">${escapeHtml(logTail || '')}</pre>
      </div>
    </div>
  </div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });

    app.listen(port, '127.0.0.1', () => {
      // eslint-disable-next-line no-console
      console.log(`ETH Paper UI listening on http://127.0.0.1:${port}`);
    });
  }
};
