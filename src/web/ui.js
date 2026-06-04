/**
 * Web UI router
 * Serves a self-contained HTML dashboard at GET /ui
 * All data comes from the /api/connectors and /health endpoints.
 */

import { Router } from 'express';

export function createWebUiRouter() {
  const router = Router();

  router.get('/ui', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(HTML);
  });

  return router;
}

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CMS MCP Hub</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f5f5f4; color: #1c1917; min-height: 100vh; }
  header { background: #fff; border-bottom: 1px solid #e7e5e4; padding: 0 24px; height: 56px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 16px; font-weight: 600; }
  header .badge { font-size: 12px; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; border-radius: 999px; padding: 2px 10px; }
  .container { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
  .section-title { font-size: 13px; font-weight: 600; color: #78716c; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
  .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .card-name { font-weight: 600; font-size: 15px; }
  .card-url { font-size: 12px; color: #78716c; margin-bottom: 12px; word-break: break-all; }
  .card-desc { font-size: 13px; color: #57534e; margin-bottom: 12px; }
  .card-meta { display: flex; gap: 16px; font-size: 12px; color: #78716c; }
  .status { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 500; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot-connected { background: #22c55e; }
  .dot-connecting { background: #f59e0b; }
  .dot-error { background: #ef4444; }
  .err-msg { font-size: 12px; color: #ef4444; margin-top: 8px; }
  .actions { display: flex; gap: 8px; }
  button { cursor: pointer; border: 1px solid #d6d3d1; background: #fff; border-radius: 6px; padding: 5px 12px; font-size: 13px; color: #1c1917; transition: background .15s; }
  button:hover { background: #f5f5f4; }
  button.danger { color: #dc2626; border-color: #fca5a5; }
  button.danger:hover { background: #fff1f2; }
  button.primary { background: #1c1917; color: #fff; border-color: #1c1917; }
  button.primary:hover { background: #292524; }
  button.reconnect { color: #d97706; border-color: #fcd34d; }
  button.reconnect:hover { background: #fffbeb; }
  .form-card { background: #fff; border: 1px solid #e7e5e4; border-radius: 10px; padding: 24px; margin-bottom: 32px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group.full { grid-column: 1 / -1; }
  label { font-size: 12px; font-weight: 500; color: #57534e; }
  input { border: 1px solid #d6d3d1; border-radius: 6px; padding: 7px 10px; font-size: 14px; width: 100%; outline: none; }
  input:focus { border-color: #a8a29e; box-shadow: 0 0 0 2px #f5f5f4; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 32px; }
  .stat { background: #fff; border: 1px solid #e7e5e4; border-radius: 10px; padding: 16px 20px; }
  .stat-label { font-size: 12px; color: #78716c; margin-bottom: 4px; }
  .stat-value { font-size: 24px; font-weight: 600; }
  #toast { position: fixed; bottom: 24px; right: 24px; background: #1c1917; color: #fff; padding: 10px 18px; border-radius: 8px; font-size: 14px; opacity: 0; transition: opacity .3s; pointer-events: none; }
  #toast.show { opacity: 1; }
  .empty { color: #a8a29e; font-size: 14px; text-align: center; padding: 40px 0; }
</style>
</head>
<body>
<header>
  <h1>CMS MCP Hub</h1>
  <span class="badge" id="hub-status">loading…</span>
</header>

<div class="container">

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Total connectors</div>
      <div class="stat-value" id="stat-connectors">—</div>
    </div>
    <div class="stat">
      <div class="stat-label">Connected</div>
      <div class="stat-value" id="stat-connected">—</div>
    </div>
    <div class="stat">
      <div class="stat-label">Tools exposed to Claude</div>
      <div class="stat-value" id="stat-tools">—</div>
    </div>
  </div>

  <p class="section-title">Add connector</p>
  <div class="form-card">
    <div class="form-grid">
      <div class="form-group">
        <label>Connector name *</label>
        <input id="f-name" placeholder="e.g. drupal-site-a">
      </div>
      <div class="form-group">
        <label>Remote MCP server URL *</label>
        <input id="f-url" placeholder="https://yoursite.com/mcp/sse">
      </div>
      <div class="form-group">
        <label>Auth token (Bearer)</label>
        <input id="f-token" type="password" placeholder="optional">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input id="f-desc" placeholder="optional">
      </div>
    </div>
    <button class="primary" onclick="addConnector()">Connect</button>
  </div>

  <p class="section-title">Connectors</p>
  <div id="connectors-list"></div>

</div>

<div id="toast"></div>

<script>
const BASE = '';

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function dotClass(status) {
  if (status === 'connected')  return 'dot-connected';
  if (status === 'connecting') return 'dot-connecting';
  return 'dot-error';
}

async function load() {
  try {
    const [health, connectors] = await Promise.all([
      fetch('/health').then(r => r.json()),
      fetch('/api/connectors').then(r => r.json()),
    ]);

    document.getElementById('hub-status').textContent = 'running';
    document.getElementById('stat-connectors').textContent = connectors.length;
    document.getElementById('stat-connected').textContent = connectors.filter(c => c.status === 'connected').length;
    document.getElementById('stat-tools').textContent = health.totalTools;

    const list = document.getElementById('connectors-list');
    if (connectors.length === 0) {
      list.innerHTML = '<div class="empty">No connectors yet. Add one above.</div>';
      return;
    }
    list.innerHTML = connectors.map(c => \`
      <div class="card">
        <div class="card-header">
          <div class="card-name">\${c.name}</div>
          <div class="actions">
            \${c.status === 'error' ? \`<button class="reconnect" onclick="reconnect('\${c.name}')">Reconnect</button>\` : ''}
            <button onclick="refresh('\${c.name}')">Refresh tools</button>
            <button class="danger" onclick="remove('\${c.name}')">Remove</button>
          </div>
        </div>
        <div class="card-url">\${c.url}</div>
        \${c.description ? \`<div class="card-desc">\${c.description}</div>\` : ''}
        <div class="card-meta">
          <div class="status">
            <span class="dot \${dotClass(c.status)}"></span>
            \${c.status}
          </div>
          <span>\${c.toolCount} tools</span>
        </div>
        \${c.error ? \`<div class="err-msg">\${c.error}</div>\` : ''}
      </div>
    \`).join('');
  } catch {
    document.getElementById('hub-status').textContent = 'unreachable';
  }
}

async function addConnector() {
  const name  = document.getElementById('f-name').value.trim();
  const url   = document.getElementById('f-url').value.trim();
  const token = document.getElementById('f-token').value.trim();
  const desc  = document.getElementById('f-desc').value.trim();
  if (!name || !url) return toast('Name and URL are required');
  try {
    await fetch('/api/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, token, description: desc }),
    });
    ['f-name','f-url','f-token','f-desc'].forEach(id => document.getElementById(id).value = '');
    toast('Connector added');
    load();
  } catch (e) { toast('Error: ' + e.message); }
}

async function remove(name) {
  if (!confirm(\`Remove connector "\${name}"?\`)) return;
  await fetch(\`/api/connectors/\${name}\`, { method: 'DELETE' });
  toast('Removed');
  load();
}

async function refresh(name) {
  await fetch(\`/api/connectors/\${name}/refresh\`, { method: 'POST' });
  toast(\`"\${name}" refreshed\`);
  load();
}

async function reconnect(name) {
  toast(\`Reconnecting "\${name}"…\`);
  try {
    await fetch(\`/api/connectors/\${name}/reconnect\`, { method: 'POST' });
    toast(\`"\${name}" reconnected\`);
  } catch (e) {
    toast('Reconnect failed: ' + e.message);
  }
  load();
}

load();
setInterval(load, 15000);
</script>
</body>
</html>`;
