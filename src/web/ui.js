import { Router } from 'express';

export function createWebUiRouter() {
  const router = Router();
  const noCache = (_req, res, next) => { res.setHeader('Cache-Control','no-store'); next(); };
  router.get('/',              noCache, (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(LANDING_HTML); });
  router.get('/ws/:id/ui',    noCache, (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(DASHBOARD_HTML); });
  return router;
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────
const SHARED_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#f1f5f9;color:#0f172a;min-height:100vh;line-height:1.5}
header{background:#0f172a;padding:0 32px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo-icon{width:30px;height:30px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px}
.logo-name{font-size:15px;font-weight:600;color:#fff;letter-spacing:-.01em}
.logo-sub{font-size:11px;color:#64748b;margin-top:-1px}
.container{max-width:980px;margin:0 auto;padding:32px 24px}
.btn{cursor:pointer;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:500;transition:all .15s;border:1.5px solid;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.btn:active{transform:scale(.97)}
.btn-primary{background:#6366f1;color:#fff;border-color:#6366f1}
.btn-primary:hover{background:#4f46e5;border-color:#4f46e5;box-shadow:0 4px 12px rgba(99,102,241,.3)}
.btn-secondary{background:#fff;color:#374151;border-color:#e2e8f0}
.btn-secondary:hover{background:#f8fafc;border-color:#cbd5e1}
.btn-danger{background:#fff;color:#dc2626;border-color:#fca5a5}
.btn-danger:hover{background:#fef2f2}
.btn-ico{width:32px;height:32px;border-radius:7px;border:1.5px solid #e2e8f0;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:#64748b;transition:all .15s}
.btn-ico:hover{background:#f8fafc;color:#0f172a}
.btn-ico.edit:hover{background:#f5f3ff;border-color:#c4b5fd;color:#6366f1}
.btn-ico.refresh:hover{background:#f0fdf4;border-color:#bbf7d0;color:#16a34a}
.btn-ico.reconnect:hover{background:#fffbeb;border-color:#fde68a;color:#d97706}
.btn-ico.danger:hover{background:#fef2f2;border-color:#fca5a5;color:#dc2626}
.card{background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.03);overflow:hidden;transition:box-shadow .2s,transform .15s}
.card:hover{box-shadow:0 6px 20px rgba(0,0,0,.08);transform:translateY(-1px)}
.pill{font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;border:1px solid}
.pill-connected{background:#f0fdf4;color:#16a34a;border-color:#bbf7d0}
.pill-connecting{background:#fffbeb;color:#d97706;border-color:#fde68a}
.pill-error{background:#fef2f2;color:#dc2626;border-color:#fecaca}
.pill-transport{background:#f8fafc;color:#475569;border-color:#e2e8f0}
.pill-tools{background:#f5f3ff;color:#7c3aed;border-color:#ddd6fe}
.pill-sso{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
.backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(6px);z-index:50;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
.backdrop.open{opacity:1;pointer-events:all}
.modal{background:#fff;border-radius:18px;width:100%;padding:28px 28px 24px;box-shadow:0 24px 80px rgba(0,0,0,.22);transform:translateY(16px) scale(.97);transition:transform .25s cubic-bezier(.34,1.56,.64,1);margin:16px}
.backdrop.open .modal{transform:translateY(0) scale(1)}
.modal-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
.modal-title{font-size:17px;font-weight:700;color:#0f172a}
.btn-x{width:30px;height:30px;border-radius:8px;border:1.5px solid #e2e8f0;background:transparent;cursor:pointer;font-size:17px;color:#94a3b8;display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1}
.btn-x:hover{background:#f1f5f9;color:#0f172a}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
.fg{display:flex;flex-direction:column;gap:5px}
.fg.full{grid-column:1/-1}
label{font-size:11.5px;font-weight:600;color:#374151;letter-spacing:.02em}
input,select{border:1.5px solid #e2e8f0;border-radius:9px;padding:9px 12px;font-size:13.5px;width:100%;outline:none;color:#0f172a;background:#fff;transition:border-color .15s,box-shadow .15s;font-family:inherit}
input:focus,select:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.13)}
input::placeholder{color:#94a3b8}
.form-foot{display:flex;justify-content:flex-end;gap:10px;padding-top:2px}
#toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(16px);background:#0f172a;color:#fff;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:500;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap;box-shadow:0 6px 24px rgba(0,0,0,.22);z-index:200}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#toast.ok{background:#16a34a}
#toast.err{background:#dc2626}
@media(max-width:640px){.form-grid{grid-template-columns:1fr}header{padding:0 16px}.container{padding:20px 14px}}
`;

// ─── Landing Page ─────────────────────────────────────────────────────────────
const LANDING_HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CMS MCP Hub</title>
<style>
${SHARED_CSS}
.hero{text-align:center;padding:64px 24px 48px}
.hero h2{font-size:32px;font-weight:800;letter-spacing:-.03em;margin-bottom:12px}
.hero p{font-size:15px;color:#64748b;max-width:480px;margin:0 auto 32px}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:720px;margin:0 auto}
.panel{background:#fff;border-radius:16px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.panel h3{font-size:15px;font-weight:700;margin-bottom:6px}
.panel p{font-size:13px;color:#64748b;margin-bottom:20px}
.field{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.secret-box{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:16px;margin-top:16px}
.secret-box h4{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.secret-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.secret-label{font-size:11.5px;color:#475569;font-weight:500}
.secret-val{font-size:12px;font-family:'SF Mono','Fira Code',monospace;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.copy-btn{font-size:11px;border:1px solid #e2e8f0;background:#fff;border-radius:5px;padding:3px 8px;cursor:pointer;color:#6366f1;flex-shrink:0;margin-left:6px}
.warning{font-size:12px;color:#d97706;background:#fffbeb;border:1px solid #fde68a;border-radius:7px;padding:8px 12px;margin-top:10px}
@media(max-width:640px){.panels{grid-template-columns:1fr}}
.resume-card{background:linear-gradient(135deg,#f5f3ff,#eff6ff);border:1.5px solid #c4b5fd;border-radius:14px;padding:16px 20px;margin:0 auto 24px;max-width:720px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.resume-ws-name{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:2px}
.resume-ws-id{font-size:11px;color:#64748b;font-family:'SF Mono','Fira Code',monospace}
</style></head><body>
<header>
  <a class="logo" href="/"><div class="logo-icon">⚡</div><div><div class="logo-name">CMS MCP Hub</div><div class="logo-sub">Multi-tenant Connector Gateway</div></div></a>
</header>
<div class="container">
  <div class="hero">
    <h2>Connect your CMS to Claude</h2>
    <p>Create a workspace for your organisation, configure your IdP for SSO, and connect Claude.ai to your CMS tools.</p>
  </div>
  <div id="resume-card" style="display:none">
    <div class="resume-card">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⚡</div>
        <div>
          <div style="font-size:11.5px;color:#6366f1;font-weight:600;margin-bottom:2px">Last session</div>
          <div class="resume-ws-name" id="resume-name"></div>
          <div class="resume-ws-id" id="resume-id"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 14px" onclick="clearResume()">Forget</button>
        <button class="btn btn-primary" style="font-size:13px" onclick="resumeSession()">Resume session →</button>
      </div>
    </div>
  </div>
  <div class="panels">
    <!-- Create workspace -->
    <div class="panel">
      <h3>New workspace</h3>
      <p>Create an isolated workspace for your organisation.</p>
      <div class="field"><label>Organisation name</label><input id="ws-name" placeholder="e.g. Acme Corp"></div>
      <button class="btn btn-primary" style="width:100%" onclick="createWorkspace()">Create workspace</button>
      <div id="create-result" style="display:none"></div>
    </div>
    <!-- Access workspace -->
    <div class="panel">
      <h3>Existing workspace</h3>
      <p>Access your workspace dashboard with your workspace ID and admin key.</p>
      <div class="field"><label>Workspace ID</label><input id="ws-id" placeholder="ws_..."></div>
      <div class="field"><label>Admin key</label><input id="ws-key" type="password" placeholder="ak_..."></div>
      <button class="btn btn-primary" style="width:100%" onclick="accessWorkspace()">Open dashboard</button>
      <div id="access-error" style="color:#dc2626;font-size:12px;margin-top:8px"></div>
    </div>
  </div>
</div>
<div id="toast"></div>
<script>
function toast(msg,type=''){const el=document.getElementById('toast');el.textContent=msg;el.className=type?'show '+type:'show';clearTimeout(el._t);el._t=setTimeout(()=>el.className='',2800)}

async function createWorkspace(){
  const name=document.getElementById('ws-name').value.trim();
  if(!name)return toast('Enter a name','err');
  const res=await fetch('/api/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  const data=await res.json();
  if(!res.ok)return toast(data.error,'err');
  const el=document.getElementById('create-result');
  el.style.display='';
  el.innerHTML=\`
    <div class="secret-box">
      <h4>⚠ Save these credentials — shown once only</h4>
      <div class="secret-row">
        <span class="secret-label">Workspace ID</span>
        <span class="secret-val" id="s-id">\${data.workspace_id}</span>
        <button class="copy-btn" onclick="copy('s-id')">Copy</button>
      </div>
      <div class="secret-row">
        <span class="secret-label">Admin key</span>
        <span class="secret-val" id="s-key">\${data.admin_key}</span>
        <button class="copy-btn" onclick="copy('s-key')">Copy</button>
      </div>
      <div class="warning">Store these securely. The admin key cannot be recovered if lost.</div>
      <br>
      <button class="btn btn-primary" onclick="goToDashboard('\${data.workspace_id}','\${data.admin_key}')" style="width:100%">Open dashboard →</button>
    </div>\`;
}

function copy(id){navigator.clipboard.writeText(document.getElementById(id).textContent);toast('Copied','ok')}

async function goToDashboard(id,key){
  const res=await fetch(\`/ws/\${id}/auth/admin\`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({admin_key:key})});
  if(res.ok)window.location.href=\`/ws/\${id}/ui\`;
  else toast('Login failed','err');
}

async function accessWorkspace(){
  const id=document.getElementById('ws-id').value.trim();
  const key=document.getElementById('ws-key').value.trim();
  if(!id||!key)return toast('Enter workspace ID and admin key','err');
  const res=await fetch(\`/ws/\${id}/auth/admin\`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({admin_key:key})});
  if(res.ok){window.location.href=\`/ws/\${id}/ui\`;}
  else{document.getElementById('access-error').textContent='Invalid workspace ID or admin key';}
}
function initResume(){
  try{
    const s=JSON.parse(localStorage.getItem('cms_hub_workspace')||'null');
    if(!s?.id)return;
    document.getElementById('resume-name').textContent=s.name||'Workspace';
    document.getElementById('resume-id').textContent=s.id;
    document.getElementById('resume-card').style.display='';
  }catch{}
}
function resumeSession(){
  try{
    const s=JSON.parse(localStorage.getItem('cms_hub_workspace')||'null');
    if(s?.id)window.location.href=\`/ws/\${s.id}/ui\`;
  }catch{}
}
function clearResume(){
  localStorage.removeItem('cms_hub_workspace');
  document.getElementById('resume-card').style.display='none';
}
initResume();
document.addEventListener('keydown',e=>{if(e.key==='Enter')accessWorkspace()});
</script></body></html>`;

// ─── Workspace Dashboard ──────────────────────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CMS MCP Hub — Dashboard</title>
<style>
${SHARED_CSS}
.hub-pill{font-size:11px;font-weight:500;padding:4px 12px;border-radius:999px;background:#1e293b;color:#64748b;border:1px solid #334155;transition:all .3s}
.hub-pill.online{background:#052e16;color:#4ade80;border-color:#166534}
.header-right{display:flex;align-items:center;gap:10px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
.stat{background:#fff;border-radius:14px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.05);display:flex;align-items:center;gap:12px}
.stat-icon{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.si-purple{background:#f5f3ff}.si-green{background:#f0fdf4}.si-blue{background:#eff6ff}.si-indigo{background:#eef2ff}
.stat-label{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.stat-value{font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-.02em}
.section-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.section-title{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em}

/* SSO section */
.sso-card{background:#fff;border-radius:14px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:28px}
.sso-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.sso-title{font-size:14px;font-weight:700;color:#0f172a}
.sso-connected{display:flex;align-items:center;gap:8px;font-size:13px;color:#16a34a;font-weight:500}
.sso-disconnected{font-size:13px;color:#64748b}
.idp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.idp-row{display:flex;flex-direction:column;gap:4px}
.idp-label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
.idp-val{font-size:12.5px;color:#0f172a;font-family:'SF Mono','Fira Code',monospace;word-break:break-all}
.token-info-box{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:13px 15px;display:flex;flex-direction:column;gap:8px}
.ti-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.ti-lbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;flex-shrink:0}
.ti-val{font-size:12px;color:#0f172a;font-family:'SF Mono','Fira Code',monospace;text-align:right;word-break:break-all}
.ti-ok{color:#16a34a}.ti-err{color:#dc2626}
.expiry-hint{font-size:10px;color:#64748b;margin-left:5px;font-family:inherit}

/* Connector cards */
.card-main{display:flex}
.card-stripe{width:4px;flex-shrink:0}
.s-connected{background:linear-gradient(180deg,#22c55e,#16a34a)}
.s-connecting{background:linear-gradient(180deg,#f59e0b,#d97706)}
.s-error{background:linear-gradient(180deg,#ef4444,#dc2626)}
.card-inner{flex:1;padding:16px 20px 12px;min-width:0}
.card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}
.card-name{font-weight:700;font-size:14px;color:#0f172a;margin-bottom:3px}
.card-url{font-size:11px;color:#64748b;word-break:break-all;font-family:'SF Mono','Fira Code',monospace;margin-bottom:7px}
.card-desc{font-size:12px;color:#64748b;margin-bottom:7px}
.card-badges{display:flex;gap:5px;flex-wrap:wrap}
.card-error{margin-top:8px;font-size:12px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:6px 10px}
.card-actions{display:flex;gap:5px;flex-shrink:0}
.tools-row{border-top:1px solid #f1f5f9;padding:9px 20px 12px;display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.tools-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-right:3px}
.tool-chip{font-size:11px;font-weight:500;padding:2px 9px;border-radius:6px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#475569;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:3px}
.tool-chip:hover{background:#f5f3ff;border-color:#c4b5fd;color:#6366f1;transform:translateY(-1px)}
.empty{text-align:center;padding:56px 24px;color:#94a3b8}
.empty-icon{font-size:44px;margin-bottom:12px;opacity:.5}
.empty p{font-size:13px;margin-bottom:16px}

/* Tool detail modal */
#tool-modal{max-width:560px}
.tool-name-badge{font-size:13px;font-family:'SF Mono','Fira Code',monospace;color:#6366f1;background:#f5f3ff;padding:3px 10px;border-radius:6px;font-weight:600;display:inline-block;margin-bottom:8px}
.tool-desc{font-size:13px;color:#475569;margin-bottom:18px;line-height:1.6}
.schema-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.schema-empty{font-size:12px;color:#94a3b8;font-style:italic}
.param-list{display:flex;flex-direction:column;gap:7px}
.param-item{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:9px 12px}
.param-row{display:flex;align-items:center;gap:7px;margin-bottom:2px}
.param-name{font-size:12px;font-weight:700;font-family:'SF Mono','Fira Code',monospace}
.param-type{font-size:10.5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;padding:1px 6px;font-weight:600}
.param-req{font-size:10px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:1px 6px;font-weight:600}
.param-desc{font-size:11.5px;color:#64748b;line-height:1.5}
.mb16{margin-bottom:16px}
@media(max-width:640px){.stats{grid-template-columns:1fr 1fr}.idp-grid{grid-template-columns:1fr}}
</style></head><body>
<header>
  <a class="logo" href="/"><div class="logo-icon">⚡</div><div><div class="logo-name">CMS MCP Hub</div><div class="logo-sub" id="ws-name">loading…</div></div></a>
  <div class="header-right">
    <span class="hub-pill" id="hub-status">connecting…</span>
    <button class="btn btn-secondary" onclick="logout()" style="font-size:12px;padding:6px 12px">Sign out</button>
  </div>
</header>

<div class="container">
  <div class="stats">
    <div class="stat"><div class="stat-icon si-purple">🔌</div><div><div class="stat-label">Connectors</div><div class="stat-value" id="s-total">—</div></div></div>
    <div class="stat"><div class="stat-icon si-green">✅</div><div><div class="stat-label">Connected</div><div class="stat-value" id="s-conn">—</div></div></div>
    <div class="stat"><div class="stat-icon si-blue">🛠</div><div><div class="stat-label">Tools</div><div class="stat-value" id="s-tools">—</div></div></div>
    <div class="stat"><div class="stat-icon si-indigo">🔐</div><div><div class="stat-label">SSO</div><div class="stat-value" id="s-sso">—</div></div></div>
  </div>

  <!-- SSO / IdP section -->
  <div class="section-hd" style="margin-bottom:12px">
    <span class="section-title">Identity Provider (SSO)</span>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary" onclick="openIdpModal()">⚙ Configure IdP</button>
      <button class="btn btn-primary" id="sso-btn" onclick="startSSO()" disabled style="opacity:.5">🔐 Connect via SSO</button>
    </div>
  </div>
  <div class="sso-card" id="sso-card">
    <div id="sso-status-area"><div style="font-size:13px;color:#94a3b8">IdP not configured yet.</div></div>
  </div>

  <!-- MCP endpoint -->
  <div style="margin-bottom:28px">
    <div class="section-hd"><span class="section-title">Claude.ai MCP endpoint</span></div>
    <div style="background:#fff;border-radius:10px;padding:14px 18px;box-shadow:0 1px 3px rgba(0,0,0,.05);display:flex;align-items:center;gap:12px">
      <code id="mcp-url" style="font-size:12.5px;color:#6366f1;font-family:'SF Mono','Fira Code',monospace;flex:1;word-break:break-all"></code>
      <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="copyMcpUrl()">Copy</button>
    </div>
  </div>

  <!-- Connectors -->
  <div class="section-hd">
    <span class="section-title">Connectors</span>
    <button class="btn btn-primary" onclick="openConnectorModal()">＋ Add connector</button>
  </div>
  <div id="connectors-list"></div>
</div>

<!-- IdP modal -->
<div class="backdrop" id="idp-backdrop" onclick="if(event.target===this)closeIdpModal()">
  <div class="modal" style="max-width:560px">
    <div class="modal-hd"><span class="modal-title">Configure Identity Provider</span><button class="btn-x" onclick="closeIdpModal()">✕</button></div>
    <div class="form-grid">
      <div class="fg"><label>Provider Name</label><input id="idp-name" placeholder="e.g. Okta, Azure AD, Keycloak"></div>
      <div class="fg"><label>Scope</label><input id="idp-scope" placeholder="openid profile email"></div>
      <div class="fg full">
        <label>Callback URL <span style="font-weight:400;color:#94a3b8">(register this with your IdP)</span></label>
        <div style="display:flex;gap:8px">
          <input id="idp-callback-url" readonly style="background:#f8fafc;color:#6366f1;font-family:'SF Mono','Fira Code',monospace;font-size:12px;cursor:default">
          <button type="button" class="btn btn-secondary" style="white-space:nowrap;flex-shrink:0" onclick="copyCallbackUrl()">Copy</button>
        </div>
      </div>
      <div class="fg full"><label>Authorization URL *</label><input id="idp-auth-url" placeholder="https://idp.example.com/oauth/authorize"></div>
      <div class="fg full"><label>Token URL *</label><input id="idp-token-url" placeholder="https://idp.example.com/oauth/token"></div>
      <div class="fg"><label>Client ID *</label><input id="idp-client-id" placeholder="your-client-id"></div>
      <div class="fg"><label>Client Secret</label><input id="idp-client-secret" type="password" placeholder="leave blank to keep existing"></div>
    </div>
    <div class="form-foot">
      <button class="btn btn-secondary" onclick="closeIdpModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveIdp()">Save IdP</button>
    </div>
  </div>
</div>

<!-- Connector add/edit modal -->
<div class="backdrop" id="connector-backdrop" onclick="if(event.target===this)closeConnectorModal()">
  <div class="modal" style="max-width:540px">
    <div class="modal-hd"><span class="modal-title" id="conn-modal-title">Add connector</span><button class="btn-x" onclick="closeConnectorModal()">✕</button></div>
    <div class="form-grid">
      <div class="fg"><label>Name *</label><input id="m-name" placeholder="e.g. drupal-prod"></div>
      <div class="fg"><label>Transport</label>
        <select id="m-transport"><option value="">Auto-detect</option><option value="streamable-http">Streamable HTTP</option><option value="sse">SSE</option></select>
      </div>
      <div class="fg full"><label>MCP server URL *</label><input id="m-url" placeholder="https://yoursite.com/mcp/post"></div>
      <div class="fg full"><label>SSE URL <span style="color:#94a3b8;font-weight:400">(optional)</span></label><input id="m-sseurl" placeholder="https://yoursite.com/mcp/sse"></div>
      <div class="fg full"><label>Static auth token <span style="color:#94a3b8;font-weight:400">(leave blank when using SSO)</span></label><input id="m-token" type="password" placeholder="optional — Basic/Bearer token"></div>
      <div class="fg full"><label>Description</label><input id="m-desc" placeholder="optional"></div>
    </div>
    <div class="form-foot">
      <button class="btn btn-secondary" onclick="closeConnectorModal()">Cancel</button>
      <button class="btn btn-primary" id="conn-submit" onclick="submitConnector()">Connect</button>
    </div>
  </div>
</div>

<!-- Tool detail modal -->
<div class="backdrop" id="tool-backdrop" onclick="if(event.target===this)closeToolModal()">
  <div class="modal" id="tool-modal">
    <div class="modal-hd">
      <div><div class="tool-name-badge" id="td-name"></div></div>
      <button class="btn-x" onclick="closeToolModal()">✕</button>
    </div>
    <div class="tool-desc" id="td-desc"></div>
    <div class="mb16"><div class="schema-title">Input parameters</div><div id="td-input"></div></div>
    <div id="td-out-section"><div class="schema-title">Output schema</div><div id="td-output"></div></div>
  </div>
</div>

<div id="toast"></div>

<script>
const WS_ID = location.pathname.split('/')[2];
let _connectors = [];
let _editingName = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function toast(msg,type=''){const el=document.getElementById('toast');el.textContent=msg;el.className=type?'show '+type:'show';clearTimeout(el._t);el._t=setTimeout(()=>el.className='',2800)}
function api(path,opts={}){return fetch(\`/ws/\${WS_ID}\${path}\`,{...opts,credentials:'include',headers:{...(opts.headers||{}),'Content-Type':'application/json'}})}

// ── Load ─────────────────────────────────────────────────────────────────────
async function load(){
  try{
    const [hr,cr,sr,ir]=await Promise.all([
      api('/health'),api('/api/connectors'),api('/auth/sso/status'),api('/api/idp')
    ]);
    if(cr.status===401||sr.status===401){showAuthWall();return;}
    const [health,connectors,sso,idp]=await Promise.all([hr.json(),cr.json(),sr.json(),ir.json()]);
    _connectors=Array.isArray(connectors)?connectors:[];

    document.getElementById('ws-name').textContent = health.workspace ?? 'Workspace';
    document.getElementById('hub-status').textContent='● Online';
    document.getElementById('hub-status').className='hub-pill online';
    document.getElementById('s-total').textContent=_connectors.length;
    document.getElementById('s-conn').textContent=_connectors.filter(c=>c.status==='connected').length;
    document.getElementById('s-tools').textContent=health.totalTools;
    document.getElementById('s-sso').textContent=sso.connected?(sso.expired?'Expired':'Active'):'None';
    document.getElementById('mcp-url').textContent=\`\${location.origin}/ws/\${WS_ID}/mcp\`;

    renderSsoStatus(sso,idp);
    renderConnectors(_connectors);
    localStorage.setItem('cms_hub_workspace',JSON.stringify({id:WS_ID,name:health.workspace}));
  }catch(e){
    document.getElementById('hub-status').textContent='✕ Offline';
    console.error('[hub] load error:', e);
  }
}

function showAuthWall(){
  document.getElementById('hub-status').textContent='✕ Not logged in';
  const existing=document.getElementById('auth-wall');
  if(existing)return;
  const el=document.createElement('div');
  el.id='auth-wall';
  el.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.7);backdrop-filter:blur(8px);z-index:100;display:flex;align-items:center;justify-content:center';
  el.innerHTML=\`<div style="background:#fff;border-radius:18px;padding:36px 40px;text-align:center;max-width:380px;box-shadow:0 24px 80px rgba(0,0,0,.3)">
    <div style="font-size:36px;margin-bottom:12px">🔐</div>
    <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px">Session expired</div>
    <div style="font-size:13px;color:#64748b;margin-bottom:24px">Your login session has expired or is missing. Go to the landing page to log in again.</div>
    <a href="/" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 28px;border-radius:9px;font-size:14px;font-weight:600;text-decoration:none">Go to login →</a>
  </div>\`;
  document.body.appendChild(el);
}

function formatExpiry(ts){
  const diff=ts-Date.now();
  if(diff<=0)return'expired';
  const m=Math.floor(diff/60000),h=Math.floor(m/60),d=Math.floor(h/24);
  return d>0?d+'d remaining':h>0?h+'h '+( m%60)+'m remaining':m>0?m+'m remaining':'expiring soon';
}

function renderSsoStatus(sso,idp){
  const el=document.getElementById('sso-status-area');
  const btn=document.getElementById('sso-btn');
  if(!idp){
    el.innerHTML='<div style="font-size:13px;color:#94a3b8">No IdP configured. Click "Configure IdP" to set up SSO.</div>';
    btn.disabled=true;btn.style.opacity='.5';btn.textContent='🔐 Connect via SSO';
    return;
  }
  btn.disabled=false;btn.style.opacity='1';
  btn.textContent=sso.connected&&!sso.expired?'🔄 Reconnect SSO':'🔐 Connect via SSO';

  const statusPill=sso.connected&&!sso.expired
    ?'<span class="pill pill-connected">● Active</span>'
    :sso.connected&&sso.expired
      ?'<span class="pill pill-error">⚠ Expired</span>'
      :'<span class="pill" style="background:#f8fafc;color:#64748b;border-color:#e2e8f0">Not connected</span>';

  const expiry=sso.expires_at?new Date(sso.expires_at).toLocaleString():'—';
  const hint=sso.expires_at?formatExpiry(sso.expires_at):'';

  el.innerHTML=\`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:20px">
      <div class="idp-grid" style="flex:1;min-width:220px">
        \${idp.name?'<div class="idp-row" style="grid-column:1/-1"><span class="idp-label">Provider</span><span class="idp-val" style="color:#6366f1;font-family:inherit;font-weight:600">'+esc(idp.name)+'</span></div>':''}
        <div class="idp-row"><span class="idp-label">Auth URL</span><span class="idp-val">\${esc(idp.authorize_url||'—')}</span></div>
        <div class="idp-row"><span class="idp-label">Token URL</span><span class="idp-val">\${esc(idp.token_url||'—')}</span></div>
        <div class="idp-row"><span class="idp-label">Client ID</span><span class="idp-val">\${esc(idp.client_id||'—')}</span></div>
        <div class="idp-row"><span class="idp-label">Scope</span><span class="idp-val">\${esc(idp.scope||'—')}</span></div>
      </div>
      <div style="flex-shrink:0;min-width:210px">
        <div style="margin-bottom:10px">\${statusPill}</div>
        \${sso.connected?\`
          <div class="token-info-box">
            \${sso.sub?'<div class="ti-row"><span class="ti-lbl">User</span><span class="ti-val">'+esc(sso.sub)+'</span></div>':''}
            <div class="ti-row"><span class="ti-lbl">Type</span><span class="ti-val">\${esc(sso.token_type||'Bearer')}</span></div>
            <div class="ti-row"><span class="ti-lbl">Expires</span><span class="ti-val \${sso.expired?'ti-err':''}">\${esc(expiry)}\${hint?'<span class="expiry-hint">('+hint+')</span>':''}</span></div>
            <div class="ti-row"><span class="ti-lbl">Refresh</span><span class="ti-val \${sso.has_refresh?'ti-ok':'ti-err'}">\${sso.has_refresh?'✓ Available':'✕ None'}</span></div>
          </div>
          <button class="btn btn-danger" style="font-size:12px;padding:5px 12px;margin-top:10px;width:100%" onclick="disconnectSSO()">Disconnect SSO</button>
        \`:''}
      </div>
    </div>\`;
}

function renderConnectors(connectors){
  const list=document.getElementById('connectors-list');
  if(!connectors.length){
    list.innerHTML='<div class="empty"><div class="empty-icon">🔌</div><p>No connectors yet.</p><button class="btn btn-primary" onclick="openConnectorModal()">＋ Add connector</button></div>';
    return;
  }
  list.innerHTML=connectors.map(c=>{
    const sc=c.status==='connected'?'s-connected':c.status==='connecting'?'s-connecting':'s-error';
    const pc=c.status==='connected'?'pill-connected':c.status==='connecting'?'pill-connecting':'pill-error';
    const sl=c.status==='connected'?'● Connected':c.status==='connecting'?'◌ Connecting':'✕ Error';
    const tl={['direct-http']:'Direct HTTP',['streamable-http']:'Streamable HTTP',sse:'SSE'}[c.transport]??c.transport??'';
    return \`<div class="card" style="margin-bottom:10px">
      <div class="card-main">
        <div class="card-stripe \${sc}"></div>
        <div class="card-inner">
          <div class="card-top">
            <div style="flex:1;min-width:0">
              <div class="card-name">\${esc(c.name)}</div>
              <div class="card-url">\${esc(c.url)}</div>
              \${c.description?'<div class="card-desc">'+esc(c.description)+'</div>':''}
              <div class="card-badges">
                <span class="pill \${pc}">\${sl}</span>
                \${tl?'<span class="pill pill-transport">'+tl+'</span>':''}
                <span class="pill pill-tools">\${c.toolCount} tool\${c.toolCount!==1?'s':''}</span>
                \${c.transport==='direct-http'?'<span class="pill pill-sso">SSO-ready</span>':''}
              </div>
              \${c.error?'<div class="card-error">⚠ '+esc(c.error)+'</div>':''}
            </div>
            <div class="card-actions">
              \${c.status==='error'?\`<button class="btn-ico reconnect" title="Reconnect" onclick="reconnect('\${esc(c.name)}')">↺</button>\`:''}
              <button class="btn-ico refresh"  title="Refresh tools"  onclick="refresh('\${esc(c.name)}')">⟳</button>
              <button class="btn-ico edit"     title="Edit"           onclick="editConnector('\${esc(c.name)}')">✎</button>
              <button class="btn-ico danger"   title="Remove"         onclick="removeConnector('\${esc(c.name)}')">✕</button>
            </div>
          </div>
        </div>
      </div>
      \${c.tools?.length?\`<div class="tools-row"><span class="tools-label">Tools</span>\${c.tools.map(t=>\`<span class="tool-chip" title="\${esc(t.description)}" onclick="showTool('\${esc(c.name)}','\${esc(t.name)}')">⚙ \${esc(t.title||t.name)}</span>\`).join('')}</div>\`:''}
    </div>\`;
  }).join('');
}

// ── SSO ───────────────────────────────────────────────────────────────────────
function startSSO(){
  const w=600,h=720,left=Math.round(screen.width/2-w/2),top=Math.round(screen.height/2-h/2);
  const popup=window.open(\`/ws/\${WS_ID}/auth/sso/start\`,'sso-login',
    \`width=\${w},height=\${h},left=\${left},top=\${top},toolbar=0,menubar=0,location=0,resizable=1\`);
  if(!popup){toast('Allow popups for this page to use SSO','err');return;}
  const onMsg=e=>{
    if(e.origin!==location.origin||e.data?.type!=='sso-complete')return;
    window.removeEventListener('message',onMsg);
    if(e.data.status==='ok'){toast('SSO connected successfully','ok');load();}
    else toast('SSO error: '+(e.data.error||'Unknown error'),'err');
  };
  window.addEventListener('message',onMsg);
}

async function disconnectSSO(){
  if(!confirm('Disconnect SSO? Claude.ai requests will stop using the SSO token.'))return;
  await api('/auth/sso/disconnect',{method:'POST',body:'{}'});
  toast('SSO disconnected');load();
}

// ── IdP modal ─────────────────────────────────────────────────────────────────
async function openIdpModal(){
  const idp=await api('/api/idp').then(r=>r.json()).catch(()=>null);
  document.getElementById('idp-name').value        =idp?.name??'';
  document.getElementById('idp-callback-url').value=\`\${location.origin}/ws/\${WS_ID}/auth/callback\`;
  document.getElementById('idp-auth-url').value    =idp?.authorize_url??'';
  document.getElementById('idp-token-url').value   =idp?.token_url??'';
  document.getElementById('idp-client-id').value   =idp?.client_id??'';
  document.getElementById('idp-client-secret').value='';
  document.getElementById('idp-scope').value       =idp?.scope??'openid profile email';
  document.getElementById('idp-backdrop').classList.add('open');
  setTimeout(()=>document.getElementById('idp-name').focus(),120);
}
function closeIdpModal(){document.getElementById('idp-backdrop').classList.remove('open')}
function copyCallbackUrl(){navigator.clipboard.writeText(document.getElementById('idp-callback-url').value);toast('Callback URL copied','ok')}

async function saveIdp(){
  const body={
    name:         document.getElementById('idp-name').value.trim(),
    authorize_url:document.getElementById('idp-auth-url').value.trim(),
    token_url:    document.getElementById('idp-token-url').value.trim(),
    client_id:    document.getElementById('idp-client-id').value.trim(),
    client_secret:document.getElementById('idp-client-secret').value.trim(),
    scope:        document.getElementById('idp-scope').value.trim()||'openid profile email',
  };
  if(!body.authorize_url||!body.token_url||!body.client_id)return toast('Authorization URL, Token URL and Client ID are required','err');
  const res=await api('/api/idp',{method:'PATCH',body:JSON.stringify(body)});
  if(res.ok){toast('IdP saved','ok');closeIdpModal();load();}
  else toast((await res.json()).error,'err');
}

// ── Connector modal ───────────────────────────────────────────────────────────
function openConnectorModal(c=null){
  _editingName=c?c.name:null;
  document.getElementById('conn-modal-title').textContent=c?'Edit connector':'Add connector';
  document.getElementById('conn-submit').textContent=c?'Save & Reconnect':'Connect';
  document.getElementById('m-name').value=c?.name??'';
  document.getElementById('m-url').value=c?.url??'';
  document.getElementById('m-sseurl').value=c?.sseUrl??'';
  document.getElementById('m-token').value='';
  document.getElementById('m-desc').value=c?.description??'';
  document.getElementById('m-transport').value=c?.transport??'';
  document.getElementById('m-name').disabled=!!c;
  document.getElementById('connector-backdrop').classList.add('open');
  setTimeout(()=>(c?document.getElementById('m-url'):document.getElementById('m-name')).focus(),120);
}
function closeConnectorModal(){document.getElementById('connector-backdrop').classList.remove('open')}

function editConnector(name){
  const c=_connectors.find(x=>x.name===name);
  if(c)openConnectorModal(c);
}

async function submitConnector(){
  const url=document.getElementById('m-url').value.trim();
  const name=document.getElementById('m-name').value.trim();
  if(!url)return toast('URL is required','err');
  if(!_editingName&&!name)return toast('Name is required','err');
  const btn=document.getElementById('conn-submit');
  const orig=btn.textContent; btn.textContent='Connecting…'; btn.disabled=true;
  try{
    const body={url,description:document.getElementById('m-desc').value.trim()};
    const t=document.getElementById('m-token').value.trim();
    const s=document.getElementById('m-sseurl').value.trim();
    const tr=document.getElementById('m-transport').value;
    if(t)body.token=t; if(s)body.sseUrl=s; if(tr)body.transport=tr;
    if(_editingName){
      const res=await api(\`/api/connectors/\${encodeURIComponent(_editingName)}\`,{method:'PATCH',body:JSON.stringify(body)});
      if(!res.ok)throw new Error((await res.json()).error);
      toast(\`"\${_editingName}" updated\`,'ok');
    }else{
      body.name=name;
      const res=await api('/api/connectors',{method:'POST',body:JSON.stringify(body)});
      if(!res.ok)throw new Error((await res.json()).error);
      toast(\`"\${name}" connected\`,'ok');
    }
    closeConnectorModal(); load();
  }catch(e){toast('Error: '+e.message,'err');}
  finally{btn.textContent=orig;btn.disabled=false;}
}

async function removeConnector(name){
  if(!confirm(\`Remove "\${name}"?\`))return;
  await api(\`/api/connectors/\${encodeURIComponent(name)}\`,{method:'DELETE',body:'{}'});
  toast(\`"\${name}" removed\`); load();
}
async function refresh(name){
  toast(\`Refreshing "\${name}"…\`);
  const res=await api(\`/api/connectors/\${encodeURIComponent(name)}/refresh\`,{method:'POST',body:'{}'});
  if(res.ok)toast(\`"\${name}" refreshed\`,'ok'); else toast('Refresh failed','err');
  load();
}
async function reconnect(name){
  toast(\`Reconnecting "\${name}"…\`);
  const res=await api(\`/api/connectors/\${encodeURIComponent(name)}/reconnect\`,{method:'POST',body:'{}'});
  if(res.ok)toast(\`"\${name}" reconnected\`,'ok'); else toast('Reconnect failed','err');
  load();
}

// ── Tool detail ───────────────────────────────────────────────────────────────
function showTool(connectorName,toolName){
  const c=_connectors.find(x=>x.name===connectorName);
  const t=c?.tools?.find(x=>x.name===toolName);
  if(!t)return;
  document.getElementById('td-name').textContent=t.name;
  document.getElementById('td-desc').textContent=t.description||'No description.';
  const props=t.inputSchema?.properties??{};
  const req=new Set(t.inputSchema?.required??[]);
  const keys=Object.keys(props);
  document.getElementById('td-input').innerHTML=!keys.length
    ?'<div class="schema-empty">No input parameters</div>'
    :'<div class="param-list">'+keys.map(k=>{const p=props[k];return \`<div class="param-item"><div class="param-row"><span class="param-name">\${esc(k)}</span>\${p.type?'<span class="param-type">'+esc(p.type)+'</span>':''}\${req.has(k)?'<span class="param-req">required</span>':''}</div>\${p.description?'<div class="param-desc">'+esc(p.description)+'</div>':''}</div>\`;}).join('')+'</div>';
  const outEl=document.getElementById('td-out-section');
  if(t.outputSchema){
    outEl.style.display='';
    const ok=Object.keys(t.outputSchema.properties??{});
    document.getElementById('td-output').innerHTML=!ok.length
      ?'<div class="schema-empty">No output properties</div>'
      :'<div class="param-list">'+ok.map(k=>{const p=(t.outputSchema.properties)[k];return \`<div class="param-item"><div class="param-row"><span class="param-name">\${esc(k)}</span>\${p.type?'<span class="param-type">'+esc(p.type)+'</span>':''}</div>\${p.description?'<div class="param-desc">'+esc(p.description)+'</div>':''}</div>\`;}).join('')+'</div>';
  }else outEl.style.display='none';
  document.getElementById('tool-backdrop').classList.add('open');
}
function closeToolModal(){document.getElementById('tool-backdrop').classList.remove('open')}

function copyMcpUrl(){navigator.clipboard.writeText(document.getElementById('mcp-url').textContent);toast('MCP URL copied','ok')}

async function logout(){
  await api('/auth/admin/logout',{method:'POST',body:'{}'});
  localStorage.removeItem('cms_hub_workspace');
  window.location.href='/';
}

// Handle SSO redirect params — detect if we are loaded inside the OAuth popup
const params=new URLSearchParams(location.search);
if(window.opener){
  if(params.get('sso')==='ok'){
    window.opener.postMessage({type:'sso-complete',status:'ok'},location.origin);
    window.close();
  }else if(params.get('sso_error')){
    window.opener.postMessage({type:'sso-complete',status:'error',error:params.get('sso_error')},location.origin);
    window.close();
  }
}else{
  if(params.get('sso')==='ok')setTimeout(()=>toast('SSO connected successfully','ok'),300);
  if(params.get('sso_error'))setTimeout(()=>toast('SSO error: '+params.get('sso_error'),'err'),300);
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    ['tool-backdrop','connector-backdrop','idp-backdrop'].forEach(id=>document.getElementById(id).classList.remove('open'));
  }
});

load();
</script></body></html>`;
