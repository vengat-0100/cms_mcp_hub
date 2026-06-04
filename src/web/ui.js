/**
 * Web UI router — modern dashboard with edit/add modal + tool detail view
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

const HTML = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CMS MCP Hub</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#f1f5f9;color:#0f172a;min-height:100vh;line-height:1.5}

/* ── Header ── */
header{background:#0f172a;padding:0 32px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;box-shadow:0 1px 0 rgba(255,255,255,.06)}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo-icon{width:30px;height:30px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.logo-name{font-size:15px;font-weight:600;color:#fff;letter-spacing:-.01em}
.logo-sub{font-size:11px;color:#64748b;margin-top:-1px}
.hub-pill{font-size:11px;font-weight:500;padding:4px 12px;border-radius:999px;background:#1e293b;color:#64748b;border:1px solid #334155;transition:all .3s}
.hub-pill.online{background:#052e16;color:#4ade80;border-color:#166534}

/* ── Container ── */
.container{max-width:980px;margin:0 auto;padding:32px 24px}

/* ── Stats ── */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:32px}
.stat{background:#fff;border-radius:14px;padding:20px 22px;box-shadow:0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.03);display:flex;align-items:center;gap:14px;transition:box-shadow .2s}
.stat:hover{box-shadow:0 4px 12px rgba(0,0,0,.08)}
.stat-icon{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.si-purple{background:#f5f3ff}.si-green{background:#f0fdf4}.si-blue{background:#eff6ff}
.stat-label{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
.stat-value{font-size:28px;font-weight:800;color:#0f172a;letter-spacing:-.03em}

/* ── Section header ── */
.section-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.section-title{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em}

/* ── Buttons ── */
.btn{cursor:pointer;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:500;transition:all .15s;border:1.5px solid;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.btn:active{transform:scale(.97)}
.btn-primary{background:#6366f1;color:#fff;border-color:#6366f1}
.btn-primary:hover{background:#4f46e5;border-color:#4f46e5;box-shadow:0 4px 12px rgba(99,102,241,.3)}
.btn-secondary{background:#fff;color:#374151;border-color:#e2e8f0}
.btn-secondary:hover{background:#f8fafc;border-color:#cbd5e1}

/* ── Icon buttons ── */
.btn-ico{width:32px;height:32px;border-radius:7px;border:1.5px solid #e2e8f0;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:#64748b;transition:all .15s;flex-shrink:0}
.btn-ico:hover{background:#f8fafc;border-color:#cbd5e1;color:#0f172a}
.btn-ico.edit:hover{background:#f5f3ff;border-color:#c4b5fd;color:#6366f1}
.btn-ico.reconnect:hover{background:#fffbeb;border-color:#fde68a;color:#d97706}
.btn-ico.refresh:hover{background:#f0fdf4;border-color:#bbf7d0;color:#16a34a}
.btn-ico.danger:hover{background:#fef2f2;border-color:#fca5a5;color:#dc2626}

/* ── Cards ── */
.card{background:#fff;border-radius:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.03);overflow:hidden;transition:box-shadow .2s,transform .15s}
.card:hover{box-shadow:0 6px 20px rgba(0,0,0,.08);transform:translateY(-1px)}
.card-main{display:flex}
.card-stripe{width:4px;flex-shrink:0}
.s-connected{background:linear-gradient(180deg,#22c55e,#16a34a)}
.s-connecting{background:linear-gradient(180deg,#f59e0b,#d97706)}
.s-error{background:linear-gradient(180deg,#ef4444,#dc2626)}
.card-inner{flex:1;padding:18px 20px 14px;min-width:0}
.card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
.card-left{min-width:0;flex:1}
.card-name{font-weight:700;font-size:15px;color:#0f172a;margin-bottom:4px}
.card-url{font-size:11.5px;color:#64748b;word-break:break-all;font-family:'SF Mono','Fira Code',monospace;margin-bottom:8px}
.card-desc{font-size:12.5px;color:#64748b;margin-bottom:8px}
.card-badges{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.pill{font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;border:1px solid}
.pill-connected{background:#f0fdf4;color:#16a34a;border-color:#bbf7d0}
.pill-connecting{background:#fffbeb;color:#d97706;border-color:#fde68a}
.pill-error{background:#fef2f2;color:#dc2626;border-color:#fecaca}
.pill-transport{background:#f8fafc;color:#475569;border-color:#e2e8f0}
.pill-tools{background:#f5f3ff;color:#7c3aed;border-color:#ddd6fe}
.card-error{margin-top:10px;font-size:12px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;padding:7px 11px}
.card-actions{display:flex;gap:6px;align-items:flex-start;flex-shrink:0;padding-top:1px}

/* ── Tool chips row ── */
.tools-row{border-top:1px solid #f1f5f9;padding:10px 20px 14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tools-label{font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-right:2px}
.tool-chip{font-size:11.5px;font-weight:500;padding:3px 10px;border-radius:7px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#475569;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:4px}
.tool-chip:hover{background:#f5f3ff;border-color:#c4b5fd;color:#6366f1;transform:translateY(-1px);box-shadow:0 2px 6px rgba(99,102,241,.12)}
.tool-chip::before{content:'⚙';font-size:10px;opacity:.6}

/* ── Empty ── */
.empty{text-align:center;padding:64px 24px;color:#94a3b8}
.empty-icon{font-size:48px;margin-bottom:14px;opacity:.5}
.empty p{font-size:14px;margin-bottom:18px}

/* ── Shared modal backdrop ── */
.backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:50;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
.backdrop.open{opacity:1;pointer-events:all}
.modal{background:#fff;border-radius:18px;width:100%;padding:28px 28px 24px;box-shadow:0 24px 80px rgba(0,0,0,.22);transform:translateY(16px) scale(.97);transition:transform .25s cubic-bezier(.34,1.56,.64,1);margin:16px}
.backdrop.open .modal{transform:translateY(0) scale(1)}
.modal-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
.modal-title{font-size:17px;font-weight:700;color:#0f172a}
.btn-x{width:30px;height:30px;border-radius:8px;border:1.5px solid #e2e8f0;background:transparent;cursor:pointer;font-size:17px;color:#94a3b8;display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1}
.btn-x:hover{background:#f1f5f9;color:#0f172a;border-color:#cbd5e1}

/* ── Connector modal ── */
#connector-modal{max-width:540px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
.fg{display:flex;flex-direction:column;gap:5px}
.fg.full{grid-column:1/-1}
label{font-size:11.5px;font-weight:600;color:#374151;letter-spacing:.02em}
input,select{border:1.5px solid #e2e8f0;border-radius:9px;padding:9px 12px;font-size:13.5px;width:100%;outline:none;color:#0f172a;background:#fff;transition:border-color .15s,box-shadow .15s;font-family:inherit}
input:focus,select:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.13)}
input::placeholder{color:#94a3b8}
.form-foot{display:flex;justify-content:flex-end;gap:10px;padding-top:2px}

/* ── Tool detail modal ── */
#tool-modal{max-width:560px}
.tool-modal-name{font-size:13px;font-family:'SF Mono','Fira Code',monospace;color:#6366f1;background:#f5f3ff;padding:3px 10px;border-radius:6px;font-weight:600;margin-bottom:6px;display:inline-block}
.tool-modal-desc{font-size:13.5px;color:#475569;margin-bottom:20px;line-height:1.6}
.schema-section{margin-bottom:16px}
.schema-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px}
.schema-empty{font-size:12.5px;color:#94a3b8;font-style:italic}
.param-list{display:flex;flex-direction:column;gap:8px}
.param-item{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:9px;padding:10px 14px}
.param-row{display:flex;align-items:center;gap:8px;margin-bottom:3px}
.param-name{font-size:12.5px;font-weight:700;font-family:'SF Mono','Fira Code',monospace;color:#0f172a}
.param-type{font-size:11px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:5px;padding:1px 7px;font-weight:600}
.param-req{font-size:10px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:5px;padding:1px 6px;font-weight:600}
.param-desc{font-size:12px;color:#64748b;line-height:1.5}

/* ── Toast ── */
#toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(16px);background:#0f172a;color:#fff;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:500;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap;box-shadow:0 6px 24px rgba(0,0,0,.22);z-index:200}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#toast.ok{background:#16a34a}
#toast.err{background:#dc2626}

@media(max-width:640px){
  .stats{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.card-actions{flex-wrap:wrap}
  header{padding:0 16px}.container{padding:20px 14px}
}
</style>
</head>
<body>

<header>
  <a class="logo" href="/ui">
    <div class="logo-icon">⚡</div>
    <div>
      <div class="logo-name">CMS MCP Hub</div>
      <div class="logo-sub">Connector Gateway</div>
    </div>
  </a>
  <span class="hub-pill" id="hub-status">connecting…</span>
</header>

<div class="container">
  <div class="stats">
    <div class="stat">
      <div class="stat-icon si-purple">🔌</div>
      <div><div class="stat-label">Connectors</div><div class="stat-value" id="stat-total">—</div></div>
    </div>
    <div class="stat">
      <div class="stat-icon si-green">✅</div>
      <div><div class="stat-label">Connected</div><div class="stat-value" id="stat-connected">—</div></div>
    </div>
    <div class="stat">
      <div class="stat-icon si-blue">🛠</div>
      <div><div class="stat-label">Tools available</div><div class="stat-value" id="stat-tools">—</div></div>
    </div>
  </div>

  <div class="section-hd">
    <span class="section-title">Connectors</span>
    <button class="btn btn-primary" onclick="openConnectorModal()">＋ Add connector</button>
  </div>
  <div id="connectors-list"></div>
</div>

<!-- Connector add / edit modal -->
<div class="backdrop" id="connector-backdrop" onclick="handleBackdropClick(event,'connector-backdrop')">
  <div class="modal" id="connector-modal">
    <div class="modal-hd">
      <span class="modal-title" id="connector-modal-title">Add connector</span>
      <button class="btn-x" onclick="closeConnectorModal()">✕</button>
    </div>
    <div class="form-grid">
      <div class="fg">
        <label>Name *</label>
        <input id="m-name" placeholder="e.g. drupal-prod">
      </div>
      <div class="fg">
        <label>Transport</label>
        <select id="m-transport">
          <option value="">Auto-detect</option>
          <option value="streamable-http">Streamable HTTP</option>
          <option value="sse">SSE</option>
        </select>
      </div>
      <div class="fg full">
        <label>MCP server URL *</label>
        <input id="m-url" placeholder="https://yoursite.com/mcp/post">
      </div>
      <div class="fg full">
        <label>SSE URL <span style="color:#94a3b8;font-weight:400">(optional override)</span></label>
        <input id="m-sseurl" placeholder="https://yoursite.com/mcp/sse">
      </div>
      <div class="fg full">
        <label>Auth token <span style="color:#94a3b8;font-weight:400">(Begin the token with {'Basic ' / 'Bearer '} {token})</span></label>
        <input id="m-token" type="password" placeholder="leave blank to keep existing">
      </div>
      <div class="fg full">
        <label>Description</label>
        <input id="m-desc" placeholder="optional">
      </div>
    </div>
    <div class="form-foot">
      <button class="btn btn-secondary" onclick="closeConnectorModal()">Cancel</button>
      <button class="btn btn-primary" id="connector-submit" onclick="submitConnectorModal()">Connect</button>
    </div>
  </div>
</div>

<!-- Tool detail modal -->
<div class="backdrop" id="tool-backdrop" onclick="handleBackdropClick(event,'tool-backdrop')">
  <div class="modal" id="tool-modal">
    <div class="modal-hd">
      <div>
        <div class="tool-modal-name" id="td-name"></div>
      </div>
      <button class="btn-x" onclick="closeToolModal()">✕</button>
    </div>
    <div class="tool-modal-desc" id="td-desc"></div>
    <div class="schema-section">
      <div class="schema-title">Input parameters</div>
      <div id="td-input"></div>
    </div>
    <div class="schema-section" id="td-output-section">
      <div class="schema-title">Output schema</div>
      <div id="td-output"></div>
    </div>
  </div>
</div>

<div id="toast"></div>

<script>
let _editingName = null;
let _connectorsData = [];

// ── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type ? \`show \${type}\` : 'show';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = '', 2800);
}

// ── Backdrop click ───────────────────────────────────────────────────────────
function handleBackdropClick(e, id) {
  if (e.target === document.getElementById(id)) {
    if (id === 'connector-backdrop') closeConnectorModal();
    else closeToolModal();
  }
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('tool-backdrop').classList.contains('open')) closeToolModal();
  else closeConnectorModal();
});

// ── Connector modal ──────────────────────────────────────────────────────────
function openConnectorModal(connector = null) {
  _editingName = connector ? connector.name : null;
  const isEdit = !!connector;
  document.getElementById('connector-modal-title').textContent = isEdit ? 'Edit connector' : 'Add connector';
  document.getElementById('connector-submit').textContent      = isEdit ? 'Save & Reconnect' : 'Connect';
  document.getElementById('m-name').value      = connector?.name        ?? '';
  document.getElementById('m-url').value       = connector?.url         ?? '';
  document.getElementById('m-sseurl').value    = connector?.sseUrl      ?? '';
  document.getElementById('m-token').value     = '';
  document.getElementById('m-desc').value      = connector?.description ?? '';
  document.getElementById('m-transport').value = connector?.transport   ?? '';
  document.getElementById('m-name').disabled   = isEdit;
  document.getElementById('connector-backdrop').classList.add('open');
  setTimeout(() => (isEdit ? document.getElementById('m-url') : document.getElementById('m-name')).focus(), 120);
}
function closeConnectorModal() {
  document.getElementById('connector-backdrop').classList.remove('open');
}

async function submitConnectorModal() {
  const name      = document.getElementById('m-name').value.trim();
  const url       = document.getElementById('m-url').value.trim();
  const sseUrl    = document.getElementById('m-sseurl').value.trim();
  const token     = document.getElementById('m-token').value.trim();
  const desc      = document.getElementById('m-desc').value.trim();
  const transport = document.getElementById('m-transport').value;

  if (!url)              return toast('URL is required', 'err');
  if (!_editingName && !name) return toast('Name is required', 'err');

  const btn = document.getElementById('connector-submit');
  const orig = btn.textContent;
  btn.textContent = _editingName ? 'Reconnecting…' : 'Connecting…';
  btn.disabled = true;

  try {
    if (_editingName) {
      const body = { url, description: desc };
      if (transport) body.transport = transport;
      if (sseUrl)    body.sseUrl    = sseUrl;
      if (token)     body.token     = token;
      await fetch(\`/api/connectors/\${encodeURIComponent(_editingName)}\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast(\`"\${_editingName}" saved & reconnected\`, 'ok');
    } else {
      const body = { name, url, description: desc };
      if (transport) body.transport = transport;
      if (sseUrl)    body.sseUrl    = sseUrl;
      if (token)     body.token     = token;
      await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast(\`"\${name}" connected\`, 'ok');
    }
    closeConnectorModal();
    load();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

// ── Tool detail modal ────────────────────────────────────────────────────────
function showTool(connectorName, toolName) {
  const c = _connectorsData.find(x => x.name === connectorName);
  const t = c?.tools?.find(x => x.name === toolName);
  if (!t) return;

  document.getElementById('td-name').textContent = t.name;
  document.getElementById('td-desc').textContent = t.description || 'No description provided.';

  // Input params
  const props    = t.inputSchema?.properties ?? {};
  const required = new Set(t.inputSchema?.required ?? []);
  const inputEl  = document.getElementById('td-input');
  const propKeys = Object.keys(props);
  if (!propKeys.length) {
    inputEl.innerHTML = '<div class="schema-empty">No input parameters</div>';
  } else {
    inputEl.innerHTML = \`<div class="param-list">\${propKeys.map(k => {
      const p = props[k];
      return \`<div class="param-item">
        <div class="param-row">
          <span class="param-name">\${esc(k)}</span>
          \${p.type ? \`<span class="param-type">\${esc(p.type)}</span>\` : ''}
          \${required.has(k) ? '<span class="param-req">required</span>' : ''}
        </div>
        \${p.description ? \`<div class="param-desc">\${esc(p.description)}</div>\` : ''}
      </div>\`;
    }).join('')}</div>\`;
  }

  // Output schema
  const outEl = document.getElementById('td-output');
  const outSection = document.getElementById('td-output-section');
  if (t.outputSchema) {
    outSection.style.display = '';
    const outProps = t.outputSchema.properties ?? {};
    const outKeys  = Object.keys(outProps);
    if (!outKeys.length) {
      outEl.innerHTML = '<div class="schema-empty">No output properties defined</div>';
    } else {
      outEl.innerHTML = \`<div class="param-list">\${outKeys.map(k => {
        const p = outProps[k];
        return \`<div class="param-item">
          <div class="param-row">
            <span class="param-name">\${esc(k)}</span>
            \${p.type ? \`<span class="param-type">\${esc(p.type)}</span>\` : ''}
          </div>
          \${p.description ? \`<div class="param-desc">\${esc(p.description)}</div>\` : ''}
        </div>\`;
      }).join('')}</div>\`;
    }
  } else {
    outSection.style.display = 'none';
  }

  document.getElementById('tool-backdrop').classList.add('open');
}
function closeToolModal() {
  document.getElementById('tool-backdrop').classList.remove('open');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function stripeClass(s) { return s==='connected'?'s-connected':s==='connecting'?'s-connecting':'s-error'; }
function pillClass(s)   { return s==='connected'?'pill-connected':s==='connecting'?'pill-connecting':'pill-error'; }
function statusLabel(s) { return s==='connected'?'● Connected':s==='connecting'?'◌ Connecting':'✕ Error'; }
function transportLabel(t) {
  return {['direct-http']:'Direct HTTP',['streamable-http']:'Streamable HTTP',sse:'SSE'}[t] ?? t ?? '';
}

// ── Load & render ─────────────────────────────────────────────────────────────
async function load() {
  try {
    const [health, connectors] = await Promise.all([
      fetch('/health').then(r => r.json()),
      fetch('/api/connectors').then(r => r.json()),
    ]);
    _connectorsData = connectors;

    document.getElementById('hub-status').textContent = '● Online';
    document.getElementById('hub-status').className   = 'hub-pill online';
    document.getElementById('stat-total').textContent     = connectors.length;
    document.getElementById('stat-connected').textContent = connectors.filter(c => c.status==='connected').length;
    document.getElementById('stat-tools').textContent     = health.totalTools;

    const list = document.getElementById('connectors-list');
    if (!connectors.length) {
      list.innerHTML = \`
        <div class="empty">
          <div class="empty-icon">🔌</div>
          <p>No connectors yet.</p>
          <button class="btn btn-primary" onclick="openConnectorModal()">＋ Add your first connector</button>
        </div>\`;
      return;
    }

    list.innerHTML = connectors.map(c => \`
      <div class="card">
        <div class="card-main">
          <div class="card-stripe \${stripeClass(c.status)}"></div>
          <div class="card-inner">
            <div class="card-top">
              <div class="card-left">
                <div class="card-name">\${esc(c.name)}</div>
                <div class="card-url">\${esc(c.url)}</div>
                \${c.description ? \`<div class="card-desc">\${esc(c.description)}</div>\` : ''}
                <div class="card-badges">
                  <span class="pill \${pillClass(c.status)}">\${statusLabel(c.status)}</span>
                  \${c.transport ? \`<span class="pill pill-transport">\${transportLabel(c.transport)}</span>\` : ''}
                  <span class="pill pill-tools">\${c.toolCount} tool\${c.toolCount!==1?'s':''}</span>
                </div>
                \${c.error ? \`<div class="card-error">⚠ \${esc(c.error)}</div>\` : ''}
              </div>
              <div class="card-actions">
                \${c.status==='error' ? \`<button class="btn-ico reconnect" title="Reconnect" onclick="reconnect('\${esc(c.name)}')">↺</button>\` : ''}
                <button class="btn-ico refresh"  title="Refresh tools" onclick="refresh('\${esc(c.name)}')">⟳</button>
                <button class="btn-ico edit"     title="Edit"          onclick="editConnector('\${esc(c.name)}')">✎</button>
                <button class="btn-ico danger"   title="Remove"        onclick="remove('\${esc(c.name)}')">✕</button>
              </div>
            </div>
          </div>
        </div>
        \${c.tools?.length ? \`
        <div class="tools-row">
          <span class="tools-label">Tools</span>
          \${c.tools.map(t => \`
            <span class="tool-chip" onclick="showTool('\${esc(c.name)}','\${esc(t.name)}')"
                  title="\${esc(t.description)}">\${esc(t.title || t.name)}</span>
          \`).join('')}
        </div>\` : ''}
      </div>
    \`).join('');
  } catch {
    document.getElementById('hub-status').textContent = '✕ Offline';
    document.getElementById('hub-status').className   = 'hub-pill';
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────
function editConnector(name) {
  const c = _connectorsData.find(x => x.name === name);
  if (c) openConnectorModal(c);
}

async function remove(name) {
  if (!confirm(\`Remove "\${name}"? This cannot be undone.\`)) return;
  await fetch(\`/api/connectors/\${encodeURIComponent(name)}\`, { method: 'DELETE' });
  toast(\`"\${name}" removed\`);
  load();
}

async function refresh(name) {
  toast(\`Refreshing "\${name}"…\`);
  try {
    await fetch(\`/api/connectors/\${encodeURIComponent(name)}/refresh\`, { method: 'POST' });
    toast(\`"\${name}" refreshed\`, 'ok');
  } catch(e) { toast('Refresh failed: ' + e.message, 'err'); }
  load();
}

async function reconnect(name) {
  toast(\`Reconnecting "\${name}"…\`);
  try {
    await fetch(\`/api/connectors/\${encodeURIComponent(name)}/reconnect\`, { method: 'POST' });
    toast(\`"\${name}" reconnected\`, 'ok');
  } catch(e) { toast('Reconnect failed: ' + e.message, 'err'); }
  load();
}

load();
setInterval(load, 15000);
</script>
</body>
</html>`;
