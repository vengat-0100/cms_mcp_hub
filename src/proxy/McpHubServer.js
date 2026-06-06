/**
 * McpHubServer — multi-tenant MCP gateway
 *
 * Route structure:
 *   GET  /                              Landing page
 *   POST /api/workspaces                Create workspace
 *
 *   GET  /ws/:id/ui                     Workspace dashboard (admin session required)
 *   POST /ws/:id/auth/admin             Admin login → sets session cookie
 *   GET  /ws/:id/auth/sso/start         Begin IdP SSO flow
 *   GET  /ws/:id/auth/callback          OAuth callback from IdP
 *   POST /ws/:id/auth/sso/disconnect    Remove service token
 *
 *   POST /ws/:id/mcp                    MCP endpoint for Claude.ai
 *   GET  /ws/:id/mcp                    MCP SSE stream
 *   DELETE /ws/:id/mcp                  Close MCP session
 *
 *   GET  /ws/:id/health                 Workspace health (no auth)
 *   GET  /ws/:id/api/connectors         (admin)
 *   POST /ws/:id/api/connectors         (admin)
 *   PATCH /ws/:id/api/connectors/:name  (admin)
 *   DELETE /ws/:id/api/connectors/:name (admin)
 *   POST /ws/:id/api/connectors/:name/refresh   (admin)
 *   POST /ws/:id/api/connectors/:name/reconnect (admin)
 *   GET  /ws/:id/api/idp                (admin)
 *   PATCH /ws/:id/api/idp               (admin)
 */

import { Server }                          from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport }              from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport }   from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express   from 'express';
import { randomUUID } from 'crypto';
import { createWebUiRouter } from '../web/ui.js';
import { signSession, verifySession } from '../workspaces/TokenStore.js';
import { OAuthManager } from '../workspaces/OAuthManager.js';

const SESSION_COOKIE = 'ws_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export class McpHubServer {
  constructor(workspaceRegistry, { port = 3456, logger = console } = {}) {
    this.workspaceRegistry = workspaceRegistry;
    this.port   = port;
    this.logger = logger;
    this.oauth  = new OAuthManager();

    // MCP sessions: `${workspace_id}:${session_id}` → { server, transport }
    this.httpSessions = new Map();
    this.sseSessions  = new Map();

    this.app = express();
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

  // ── Auth helpers ─────────────────────────────────────────────────────────────

  _setSessionCookie(res, workspace_id) {
    const token = signSession({ workspace_id, exp: Date.now() + SESSION_TTL_MS });
    res.setHeader('Set-Cookie',
      `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/ws/${workspace_id}/; Max-Age=${SESSION_TTL_MS / 1000}`
    );
  }

  _clearSessionCookie(res, workspace_id) {
    res.setHeader('Set-Cookie',
      `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/ws/${workspace_id}/; Max-Age=0`
    );
  }

  _getSession(req) {
    const raw = req.headers.cookie ?? '';
    for (const part of raw.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === SESSION_COOKIE) {
        try { return verifySession(decodeURIComponent(v.join('='))); } catch { return null; }
      }
    }
    return null;
  }

  _requireAdmin(req, res) {
    const session = this._getSession(req);
    if (!session || session.workspace_id !== req.params.workspace_id) {
      res.status(401).json({ error: 'Unauthorized — please log in' });
      return false;
    }
    return true;
  }

  _baseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
    return `${proto}://${req.headers.host}`;
  }

  // ── MCP server factory ────────────────────────────────────────────────────────

  async _createMcpServer(workspace_id) {
    console.log("create mcp server")
    const registry = await this.workspaceRegistry.getRegistry(workspace_id, this.logger);
    const server   = new Server({ name: 'cms-mcp-hub', version: '1.0.0' }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: registry ? registry.getAllTools() : [],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      if (!registry) return { content: [{ type: 'text', text: 'No connectors configured' }], isError: true };
      try {
        return await registry.callTool(name, args ?? {});
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    });

    return server;
  }

  // ── Route setup ───────────────────────────────────────────────────────────────

  _setupRoutes() {
    const app = this.app;
    const wr  = this.workspaceRegistry;

    // ── Landing page + workspace creation ─────────────────────────────────────
    app.use(createWebUiRouter());

    app.post('/api/workspaces', async (req, res) => {
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
      try {
        const result = await wr.create(name.trim());
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ── Workspace middleware ───────────────────────────────────────────────────
    app.param('workspace_id', async (req, res, next, workspace_id) => {
      const config = await wr.getConfig(workspace_id);
      if (!config) return res.status(404).json({ error: 'Workspace not found' });
      req.workspace = config;
      next();
    });

    // ── Admin login ───────────────────────────────────────────────────────────
    app.post('/ws/:workspace_id/auth/admin', async (req, res) => {
      const { admin_key } = req.body;
      if (!admin_key) return res.status(400).json({ error: 'admin_key required' });
      if (!wr.verifyAdminKey(admin_key, req.workspace.admin_key_hash)) {
        return res.status(401).json({ error: 'Invalid admin key' });
      }
      this._setSessionCookie(res, req.params.workspace_id);
      res.json({ ok: true });
    });

    app.post('/ws/:workspace_id/auth/admin/logout', (req, res) => {
      this._clearSessionCookie(res, req.params.workspace_id);
      res.json({ ok: true });
    });

    // ── SSO OAuth flow ────────────────────────────────────────────────────────
    app.get('/ws/:workspace_id/auth/sso/start', (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      const idp = req.workspace.idp;
      if (!idp?.authorize_url) return res.status(400).json({ error: 'IdP not configured' });
      const url = this.oauth.buildStartUrl(req.params.workspace_id, idp, this._baseUrl(req));
      res.redirect(url);
    });

    app.get('/ws/:workspace_id/auth/callback', async (req, res) => {
      const { code, state, error } = req.query;
      if (error) return res.redirect(`/ws/${req.params.workspace_id}/ui?sso_error=${encodeURIComponent(error)}`);
      try {
        await this.oauth.handleCallback(code, state, wr, this._baseUrl(req));
        res.redirect(`/ws/${req.params.workspace_id}/ui?sso=ok`);
      } catch (err) {
        this.logger.error('[hub] OAuth callback error:', err.message);
        res.redirect(`/ws/${req.params.workspace_id}/ui?sso_error=${encodeURIComponent(err.message)}`);
      }
    });

    app.post('/ws/:workspace_id/auth/sso/disconnect', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      await wr.deleteToken(req.params.workspace_id, '_service');
      res.json({ ok: true });
    });

    app.get('/ws/:workspace_id/auth/sso/status', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      res.json(await wr.tokenStatus(req.params.workspace_id));
    });

    // ── MCP endpoint (workspace-scoped) ──────────────────────────────────────
    const handleMcp = async (req, res) => {
      const { workspace_id } = req.params;
      const sessionId = req.headers['mcp-session-id'];
      const sessionKey = `${workspace_id}:${sessionId}`;

      try {
        if (sessionId && this.httpSessions.has(sessionKey)) {
          const { transport } = this.httpSessions.get(sessionKey);
          await transport.handleRequest(req, res, req.body);
        } else if (req.method === 'POST' && !sessionId) {
          const server    = await this._createMcpServer(workspace_id);
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
          transport.onclose = () => { if (transport.sessionId) this.httpSessions.delete(`${workspace_id}:${transport.sessionId}`); };
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          if (transport.sessionId) this.httpSessions.set(`${workspace_id}:${transport.sessionId}`, { server, transport });
        } else {
          res.status(400).json({ error: 'Missing or unknown session' });
        }
      } catch (err) {
        this.logger.error('[hub] MCP error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      }
    };

    app.post('/ws/:workspace_id/mcp', handleMcp);
    app.get('/ws/:workspace_id/mcp',  handleMcp);

    app.delete('/ws/:workspace_id/mcp', async (req, res) => {
      const key = `${req.params.workspace_id}:${req.headers['mcp-session-id']}`;
      const session = this.httpSessions.get(key);
      if (session) { await session.transport.close().catch(() => {}); this.httpSessions.delete(key); }
      res.sendStatus(200);
    });

    // ── Health ────────────────────────────────────────────────────────────────
    app.get('/ws/:workspace_id/health', async (req, res) => {
      try {
        const registry = await wr.getRegistry(req.params.workspace_id, this.logger);
        const sso      = await wr.tokenStatus(req.params.workspace_id);
        res.json({
          status: 'ok',
          workspace: req.workspace.name,
          sso,
          connectors:  registry?.getStatus() ?? [],
          totalTools:  registry?.getAllTools().length ?? 0,
        });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Connector management API ──────────────────────────────────────────────
    app.get('/ws/:workspace_id/api/connectors', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      const registry = await wr.getRegistry(req.params.workspace_id, this.logger);
      res.json(registry?.getStatus() ?? []);
    });

    app.post('/ws/:workspace_id/api/connectors', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      const { name, url, token, description, transport, sseUrl } = req.body;
      if (!name || !url) return res.status(400).json({ error: 'name and url required' });
      try {
        const registry = await wr.getRegistry(req.params.workspace_id, this.logger);
        await registry.connectOne({ name, url, token, description, transport, sseUrl }, this.logger);
        await registry.saveConfig();
        res.json(registry.getStatus().find(c => c.name === name));
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.patch('/ws/:workspace_id/api/connectors/:name', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      try {
        const registry = await wr.getRegistry(req.params.workspace_id, this.logger);
        await registry.updateOne(req.params.name, req.body, this.logger);
        await registry.saveConfig();
        const updated = req.body.name ?? req.params.name;
        res.json(registry.getStatus().find(c => c.name === updated));
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/ws/:workspace_id/api/connectors/:name', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      try {
        const registry = await wr.getRegistry(req.params.workspace_id, this.logger);
        const removed  = await registry.disconnectOne(req.params.name, this.logger);
        if (!removed) return res.status(404).json({ error: 'Connector not found' });
        await registry.saveConfig();
        res.json({ ok: true });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/ws/:workspace_id/api/connectors/:name/refresh', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      try {
        const registry = await wr.getRegistry(req.params.workspace_id, this.logger);
        await registry.refreshOne(req.params.name, this.logger);
        res.json(registry.getStatus().find(c => c.name === req.params.name));
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/ws/:workspace_id/api/connectors/:name/reconnect', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      try {
        const registry = await wr.getRegistry(req.params.workspace_id, this.logger);
        await registry.reconnectOne(req.params.name, this.logger);
        res.json(registry.getStatus().find(c => c.name === req.params.name));
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── IdP config ────────────────────────────────────────────────────────────
    app.get('/ws/:workspace_id/api/idp', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      const { idp } = req.workspace;
      // Mask client_secret
      if (!idp) return res.json(null);
      res.json({ ...idp, client_secret: idp.client_secret ? '••••••••' : '' });
    });

    app.patch('/ws/:workspace_id/api/idp', async (req, res) => {
      if (!this._requireAdmin(req, res)) return;
      try {
        const existing = req.workspace.idp ?? {};
        const idp = {
          name:          req.body.name          ?? existing.name ?? '',
          authorize_url: req.body.authorize_url ?? existing.authorize_url,
          token_url:     req.body.token_url     ?? existing.token_url,
          client_id:     req.body.client_id     ?? existing.client_id,
          // Only update secret if a new non-masked value provided
          client_secret: (req.body.client_secret && req.body.client_secret !== '••••••••')
                           ? req.body.client_secret
                           : existing.client_secret,
          scope:         req.body.scope         ?? existing.scope ?? 'openid profile email',
        };
        await wr.updateIdp(req.params.workspace_id, idp);
        res.json({ ok: true });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
  }

  async start() {
    this._setupRoutes();
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(this.port, () => {
        this.logger.info(`[hub] MCP Hub running on http://localhost:${this.port}`);
        this.logger.info(`[hub] Landing page  →  http://localhost:${this.port}/`);
        this.logger.info(`[hub] Workspace MCP →  http://localhost:${this.port}/ws/{workspace_id}/mcp`);
        resolve();
      });
    });
  }

  stop() { this.httpServer?.close(); }
}
