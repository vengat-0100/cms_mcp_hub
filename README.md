# CMS MCP Hub

Multi-tenant MCP (Model Context Protocol) gateway. Proxies Claude.ai tool calls to one or more remote CMS MCP servers, with per-workspace SSO, connector management, and an admin dashboard.

```
Claude.ai  ──MCP──▶  cms-mcp-hub  ──HTTP──▶  Drupal MCP server
                                  ──HTTP──▶  WordPress MCP server
                                  ──SSE───▶  Any CMS MCP server
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. (Recommended) Set encryption key
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 3. Start dev server (auto-reloads on src/ changes)
npm run dev

# 4. Open browser
open http://localhost:3456
```

Default port: **3456**. Override with `PORT=4000 npm run dev`.

---

## Control Flow

### 1. Server Startup (`src/index.js`)

```
node src/index.js
  └── new WorkspaceRegistry()         reads data/workspaces/ from disk
  └── new McpHubServer(registry)
        └── _setupRoutes()            registers all Express routes + app.param workspace validation
        └── app.listen(PORT)
```

On startup, `app.param('workspace_id', ...)` runs for every route that has `:workspace_id`. It loads the workspace config from disk, attaches it to `req.workspace`, and returns 404 if the workspace doesn't exist.

---

### 2. Creating a Workspace

```
Browser → POST /api/workspaces  { name }
  └── WorkspaceRegistry.create()
        ├── generates  workspace_id = "ws_" + 12 random bytes (hex)
        ├── generates  admin_key    = "ak_" + 24 random bytes (hex)
        ├── stores     admin_key_hash = SHA-256(admin_key)
        └── writes     data/workspaces/{workspace_id}/config.json

Response → { workspace_id, admin_key, name }
           ⚠ admin_key shown ONCE — save it immediately
```

`config.json` structure:
```json
{
  "workspace_id": "ws_abc123...",
  "name": "My Org",
  "admin_key_hash": "sha256hex...",
  "idp": null,
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

---

### 3. Admin Login → Session Cookie

```
Browser → POST /ws/:id/auth/admin  { admin_key }
  └── WorkspaceRegistry.verifyAdminKey()
        └── SHA-256(admin_key) == stored admin_key_hash  (timing-safe compare)
  └── TokenStore.signSession({ workspace_id, exp: now + 24h })
        └── base64url(payload) + "." + HMAC-SHA256(payload, ENCRYPTION_KEY)
        └── Set-Cookie: ws_session=<token>; HttpOnly; SameSite=Lax;
                        Path=/ws/{workspace_id}/; Max-Age=86400

Response → { ok: true }
Browser  → redirects to /ws/:id/ui
```

Session cookie is **path-scoped** to `/ws/{workspace_id}/`. A session for workspace A is not sent to workspace B requests.

---

### 4. Dashboard Load (`/ws/:id/ui`)

Page is static HTML served from `src/web/ui.js`. On load, JavaScript calls 4 APIs in parallel:

```
Browser JS  load()
  ├── GET /ws/:id/health           (no auth — workspace health + tool count)
  ├── GET /ws/:id/api/connectors   (session required)
  ├── GET /ws/:id/auth/sso/status  (session required)
  └── GET /ws/:id/api/idp          (session required)

If any session-required endpoint returns 401:
  └── showAuthWall()  ← overlay with "Session expired" + link to login

If all succeed:
  └── renders workspace name, stats bar, SSO panel, connector cards
```

---

### 5. Connector Connection Flow

```
Admin → POST /ws/:id/api/connectors  { name, url, token?, transport?, sseUrl? }
  └── ConnectorRegistry.connectOne()
        └── transport auto-detection (if not specified):
              1. Direct HTTP  — JSON-RPC POST to url
              2. Streamable HTTP — MCP SDK StreamableHTTPClientTransport
              3. SSE — MCP SDK SSEClientTransport

        └── calls tools/list on remote server
        └── registers each tool as  {safePrefix(name)}__{toolName}
              e.g. drupal-prod__get_node
        └── stores in memory (ConnectorRegistry.connectors Map)
        └── saves to data/workspaces/{id}/connectors.json

On server restart:
  └── ConnectorRegistry.initialize() reconnects all saved connectors in parallel
      Non-blocking: registry returned immediately, connections run in background
```

**Tool prefix rule**: `safePrefix(name)` replaces characters outside `[a-zA-Z0-9_-]` with `_`. Required by Claude.ai tool naming rules.

**Fetch timeout**: `FETCH_TIMEOUT_MS = 120,000` (2 minutes) per tool call.

---

### 6. Claude.ai MCP Request Flow

```
Claude.ai → POST /ws/:id/mcp
  └── checks Mcp-Session-Id header
        ├── existing session → route to cached StreamableHTTPServerTransport
        └── new session      → create MCP Server + StreamableHTTPServerTransport
                                store in httpSessions Map (keyed by session ID)

  └── MCP Server handles:
        ├── tools/list  → ConnectorRegistry.getAllTools()
        │                 all tools from all connected connectors (prefixed)
        └── tools/call  { name: "drupal-prod__get_node", arguments: {...} }
              └── ConnectorRegistry.callTool()
                    ├── strips prefix → finds connector by name
                    ├── calls remote MCP server with original tool name
                    └── returns result to Claude.ai

Claude.ai GET /ws/:id/mcp   ← SSE stream for streaming responses
Claude.ai DELETE /ws/:id/mcp ← close session
```

Connect Claude.ai to: `http://your-host/ws/{workspace_id}/mcp`

---

### 7. SSO / OAuth 2.0 Authorization Code Flow

```
Step 1 — Configure IdP
  Admin → PATCH /ws/:id/api/idp
            { authorize_url, token_url, client_id, client_secret, scope }
  └── saved to config.json idp field

Step 2 — Start SSO
  Admin → GET /ws/:id/auth/sso/start
  └── OAuthManager.buildStartUrl()
        ├── generates random state (20 bytes hex), stores with 10-min expiry
        └── builds IdP redirect URL:
              {authorize_url}?response_type=code
                             &client_id=...
                             &redirect_uri={origin}/ws/{id}/auth/callback
                             &scope=...
                             &state=...
  └── 302 redirect → IdP login page

Step 3 — IdP Callback
  IdP → GET /ws/:id/auth/callback?code=...&state=...
  └── OAuthManager.handleCallback()
        ├── validates state (exists + not expired)
        ├── POST to token_url to exchange code → tokens
        ├── decodes JWT id_token to extract sub claim
        └── WorkspaceRegistry.saveToken(workspace_id, '_service', {
                access_token, refresh_token, expires_at, token_type, sub
              })
              └── AES-256-GCM encrypted → data/workspaces/{id}/tokens/_service.enc
  └── 302 redirect → /ws/:id/ui?sso=ok

Step 4 — Token Auto-Refresh
  On every tool call: WorkspaceRegistry.getToken()
    └── if expires_at - 60s < now && has refresh_token
          POST to idp.token_url with grant_type=refresh_token
          saves updated token
    └── returns current access_token
    └── ConnectorRegistry injects Authorization: Bearer {access_token}
```

---

### 8. Session Verification (all protected routes)

```
_requireAdmin(req, res)
  └── reads Cookie: ws_session=<token>
  └── TokenStore.verifySession(token)
        ├── splits "data.sig"
        ├── recomputes HMAC-SHA256(data, key)
        ├── crypto.timingSafeEqual(sig, expected)
        ├── decodes base64url payload
        └── checks payload.exp > Date.now()
  └── verifies payload.workspace_id === req.params.workspace_id
  └── on failure: sends { error: "..." } with status 401
```

---

### 9. Token Encryption (TokenStore)

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key source**: `ENCRYPTION_KEY` env var (64 hex chars = 32 bytes). Falls back to `scrypt("cms-mcp-hub-dev-key", "cms-salt-v1", 32)` if unset — **not safe for production**
- **Key is cached** after first derivation — `scryptSync` only runs once per process
- **Format** stored in `.enc` files:
  ```json
  { "iv": "<12-byte hex>", "tag": "<16-byte hex>", "data": "<ciphertext hex>" }
  ```

---

## File Structure

```
cms-mcp-hub/
├── src/
│   ├── index.js                    entry point — creates WorkspaceRegistry + McpHubServer
│   ├── proxy/
│   │   └── McpHubServer.js         Express app, all route handlers, MCP session factory
│   ├── connectors/
│   │   └── ConnectorRegistry.js    connector lifecycle, transport detection, tool routing
│   ├── workspaces/
│   │   ├── WorkspaceRegistry.js    workspace CRUD, per-workspace ConnectorRegistry factory
│   │   ├── OAuthManager.js         OAuth 2.0 authorization code flow
│   │   └── TokenStore.js           AES-256-GCM encrypt/decrypt, HMAC session sign/verify
│   └── web/
│       └── ui.js                   landing page + dashboard HTML (served as template strings)
└── data/
    └── workspaces/
        └── {workspace_id}/
            ├── config.json         workspace name, admin_key_hash, idp config
            ├── connectors.json     saved connector configs
            └── tokens/
                └── _service.enc    encrypted SSO service token
```

---

## All API Endpoints

### Public (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Landing page — create or open a workspace |
| `POST` | `/api/workspaces` | Create a new workspace |
| `GET` | `/ws/:id/ui` | Workspace admin dashboard (HTML) |
| `GET` | `/ws/:id/health` | Workspace health — connectors + tool count |

**POST /api/workspaces**
```
Body:     { "name": "My Org" }
Response: { "workspace_id": "ws_...", "admin_key": "ak_...", "name": "My Org" }
```

**GET /ws/:id/health**
```json
{
  "status": "ok",
  "workspace": "My Org",
  "sso": { "connected": false },
  "connectors": [{ "name": "drupal-prod", "status": "connected", "toolCount": 8 }],
  "totalTools": 8
}
```

---

### Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ws/:id/auth/admin` | Login with admin key — sets session cookie |
| `POST` | `/ws/:id/auth/admin/logout` | Logout — clears session cookie |

**POST /ws/:id/auth/admin**
```
Body:       { "admin_key": "ak_..." }
Response:   { "ok": true }
Set-Cookie: ws_session=...; HttpOnly; SameSite=Lax; Path=/ws/{id}/; Max-Age=86400
```

---

### SSO / OAuth (requires admin session)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ws/:id/auth/sso/start` | Redirect to IdP authorization page |
| `GET` | `/ws/:id/auth/callback` | OAuth callback — handles code→token exchange |
| `GET` | `/ws/:id/auth/sso/status` | Current SSO token status |
| `POST` | `/ws/:id/auth/sso/disconnect` | Delete stored service token |

**GET /ws/:id/auth/sso/status**
```json
{ "connected": true,  "expired": false, "expires_at": 1749123456789, "has_refresh": true }
{ "connected": false }
```

---

### Connector Management (requires admin session)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ws/:id/api/connectors` | List all connectors, status, and tools |
| `POST` | `/ws/:id/api/connectors` | Add and connect a new connector |
| `PATCH` | `/ws/:id/api/connectors/:name` | Update connector config and reconnect |
| `DELETE` | `/ws/:id/api/connectors/:name` | Disconnect and remove a connector |
| `POST` | `/ws/:id/api/connectors/:name/refresh` | Re-fetch tool list (no reconnect) |
| `POST` | `/ws/:id/api/connectors/:name/reconnect` | Full disconnect + reconnect |

**POST /ws/:id/api/connectors — request body**
```json
{
  "name":        "drupal-prod",
  "url":         "https://cms.example.com/mcp",
  "token":       "Basic abc123",
  "transport":   "streamable-http",
  "sseUrl":      "https://cms.example.com/mcp/sse",
  "description": "Production Drupal"
}
```
`token`, `transport`, `sseUrl`, `description` are all optional. If `transport` is omitted, auto-detection runs.

**GET /ws/:id/api/connectors — response item**
```json
{
  "name":      "drupal-prod",
  "url":       "https://...",
  "status":    "connected",
  "transport": "direct-http",
  "toolCount": 8,
  "tools": [
    {
      "name":        "get_node",
      "title":       "Get Node",
      "description": "...",
      "inputSchema": { "type": "object", "properties": {} }
    }
  ],
  "error": null
}
```

---

### IdP Configuration (requires admin session)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ws/:id/api/idp` | Get current IdP config (client_secret masked) |
| `PATCH` | `/ws/:id/api/idp` | Create or update IdP config |

**PATCH /ws/:id/api/idp**
```json
{
  "authorize_url": "https://idp.example.com/oauth/authorize",
  "token_url":     "https://idp.example.com/oauth/token",
  "client_id":     "your-client-id",
  "client_secret": "your-secret",
  "scope":         "openid profile email"
}
```
Send `"client_secret": "••••••••"` (or omit it) to keep the existing secret.

---

### MCP Endpoint (Claude.ai connects here)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ws/:id/mcp` | Create new MCP session or send to existing |
| `GET` | `/ws/:id/mcp` | SSE stream for active session |
| `DELETE` | `/ws/:id/mcp` | Close MCP session |

New session: POST without `Mcp-Session-Id` header.
Existing session: POST/GET with `Mcp-Session-Id: <id>` header.

**In Claude.ai → Settings → Integrations**: enter `http://your-host/ws/{workspace_id}/mcp`

---

## Connector Transport Auto-Detection

When `transport` is not specified, tried in order:

| Order | Transport | Method | Works with |
|-------|-----------|--------|------------|
| 1 | **Direct HTTP** | JSON-RPC POST to `url` | Drupal `mcp_server`, simple REST MCP |
| 2 | **Streamable HTTP** | MCP SDK `StreamableHTTPClientTransport` | Modern MCP servers |
| 3 | **SSE** | MCP SDK `SSEClientTransport` (to `sseUrl ?? url`) | Legacy MCP servers |

Force a specific transport: `"transport": "streamable-http"` or `"transport": "sse"`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default: `3456`) |
| `ENCRYPTION_KEY` | Recommended | 64-char hex string (32 bytes) for AES-256-GCM + HMAC. Falls back to hardcoded dev key if unset |

Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

In dev, source before starting:
```bash
export ENCRYPTION_KEY=your64hexchars
npm run dev
```

Or use a `.env` file with a loader (e.g. `dotenv`) — the `export ENCRYPTION_KEY=...` syntax in `.env.dev` only works after `source .env.dev`, not with dotenv.

---

## npm Scripts

| Script | Command | Use |
|--------|---------|-----|
| `npm start` | `node src/index.js` | Production |
| `npm run dev` | `nodemon --watch src ...` | Dev — auto-reloads on any `src/` JS/JSON change |
| `npm run sync` | `nodemon --watch connectors.json ...` | Only reloads on connector config JSON changes |
| `npm run cli` | `node src/cli/index.js` | CLI interface |

Use `npm run dev` for development. `npm run sync` does **not** watch JS files.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Dashboard stuck on "Loading..." | JS not reloaded after code change | Hard refresh: `Ctrl+Shift+R` |
| "Session expired" overlay immediately | Cookie not set, or wrong workspace path | Log in at `POST /ws/:id/auth/admin` |
| `EADDRINUSE :::3456` | Another process on port 3456 | `kill $(lsof -ti:3456)` then restart |
| `[warn] ENCRYPTION_KEY not set` | Env var missing | Set `ENCRYPTION_KEY` before starting |
| Connector stuck in "connecting" | Remote MCP server unreachable | Check URL + network; see `/ws/:id/api/connectors` for error field |
| SSO button disabled | IdP not configured | Configure IdP first via "Configure IdP" button |
