/**
 * routes.js — All HTTP endpoints for CMS MCP Hub.
 *
 * Rules:
 *   1. Every endpoint is documented: method, path, auth requirement, description.
 *   2. Each handler delegates to a service/registry class — no inline business logic.
 *   3. Protected routes declare requireAdmin as the second argument.
 *   4. All :workspace_id routes are validated via the workspaceParam callback before
 *      any handler runs.
 *   5. Async handlers are wrapped with `wrap()` so unhandled rejections reach the
 *      central error handler instead of crashing the process.
 *
 * Service classes used:
 *   WorkspaceRegistry  — workspace CRUD, token store, connector registry factory
 *   OAuthManager       — OAuth 2.0 authorization code flow
 *   McpSessionManager  — MCP server factory + Streamable HTTP session lifecycle
 *   (middleware/auth)  — session cookie helpers, requireAdmin, workspaceParam
 */

import express                 from 'express';
import { createWebUiRouter }   from './web/ui.js';
import { McpSessionManager }   from './services/McpSessionManager.js';
import {
  requireAdmin,
  workspaceParam,
  setSessionCookie,
  clearSessionCookie,
} from './middleware/auth.js';

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Derive the public base URL from a request, respecting reverse-proxy headers. */
function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
  return `${proto}://${req.headers.host}`;
}

/**
 * Wrap an async route handler so any thrown error is forwarded to Express's
 * error middleware instead of leaving the request hanging.
 */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// ── Router factory ─────────────────────────────────────────────────────────────

/**
 * Create and return the main Express router with all endpoints registered.
 *
 * @param {import('./workspaces/WorkspaceRegistry.js').WorkspaceRegistry} workspaceRegistry
 * @param {import('./workspaces/OAuthManager.js').OAuthManager} oauthManager
 * @param {object} logger
 */
export function createRouter(workspaceRegistry, oauthManager, logger) {
  const router      = express.Router();
  const mcpSessions = new McpSessionManager(workspaceRegistry, logger);

  // Validate :workspace_id and attach req.workspace before any workspace route runs
  router.param('workspace_id', workspaceParam(workspaceRegistry));

  // ── Static pages ───────────────────────────────────────────────────────────
  // Served with Cache-Control: no-store to prevent browser caching stale JS
  router.use(createWebUiRouter());

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/workspaces
   * Create a new isolated workspace. Generates a unique workspace_id and admin_key.
   * The admin_key is returned once and never stored in plaintext.
   * Auth: none
   */
  router.post('/api/workspaces', wrap(async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    res.json(await workspaceRegistry.create(name.trim()));
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /ws/:workspace_id/auth/admin
   * Verify admin_key against the stored SHA-256 hash (timing-safe compare).
   * On success, issue a signed HttpOnly session cookie scoped to this workspace.
   * Auth: none — this is the login endpoint
   */
  router.post('/ws/:workspace_id/auth/admin', wrap(async (req, res) => {
    const { admin_key } = req.body;
    if (!admin_key) return res.status(400).json({ error: 'admin_key required' });
    if (!workspaceRegistry.verifyAdminKey(admin_key, req.workspace.admin_key_hash))
      return res.status(401).json({ error: 'Invalid admin key' });
    setSessionCookie(res, req.params.workspace_id);
    res.json({ ok: true });
  }));

  /**
   * POST /ws/:workspace_id/auth/admin/logout
   * Expire the session cookie for this workspace immediately.
   * Auth: none — safe to call even without a valid session
   */
  router.post('/ws/:workspace_id/auth/admin/logout', (req, res) => {
    clearSessionCookie(res, req.params.workspace_id);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SSO / OAUTH 2.0
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ws/:workspace_id/auth/sso/start
   * Generate a random state token (10-min TTL), build the IdP authorization URL,
   * and redirect the browser to begin the OAuth 2.0 Authorization Code flow.
   * Auth: admin session
   */
  router.get('/ws/:workspace_id/auth/sso/start', requireAdmin, (req, res) => {
    const { idp } = req.workspace;
    if (!idp?.authorize_url) return res.status(400).json({ error: 'IdP not configured' });
    res.redirect(oauthManager.buildStartUrl(req.params.workspace_id, idp, baseUrl(req)));
  });

  /**
   * GET /ws/:workspace_id/auth/callback
   * OAuth 2.0 redirect callback from the IdP.
   * Validates the state token, exchanges the code for access + refresh tokens,
   * and stores them AES-256-GCM encrypted on disk.
   * On success: redirects to /ws/:id/ui?sso=ok (popup posts message and closes itself).
   * On failure: redirects to /ws/:id/ui?sso_error=<message>.
   * Auth: none — called directly by the IdP
   */
  router.get('/ws/:workspace_id/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const id = req.params.workspace_id;
    if (error) return res.redirect(`/ws/${id}/ui?sso_error=${encodeURIComponent(error)}`);
    try {
      await oauthManager.handleCallback(code, state, workspaceRegistry, baseUrl(req));
      res.redirect(`/ws/${id}/ui?sso=ok`);
    } catch (err) {
      logger.error('[hub] OAuth callback error:', err.message);
      res.redirect(`/ws/${id}/ui?sso_error=${encodeURIComponent(err.message)}`);
    }
  });

  /**
   * GET /ws/:workspace_id/auth/sso/status
   * Return the current SSO token status for this workspace:
   * { connected, expired, expires_at, has_refresh, sub, token_type }
   * Auth: admin session
   */
  router.get('/ws/:workspace_id/auth/sso/status', requireAdmin, wrap(async (req, res) => {
    res.json(await workspaceRegistry.tokenStatus(req.params.workspace_id));
  }));

  /**
   * POST /ws/:workspace_id/auth/sso/disconnect
   * Delete the stored service token, disconnecting SSO for this workspace.
   * Auth: admin session
   */
  router.post('/ws/:workspace_id/auth/sso/disconnect', requireAdmin, wrap(async (req, res) => {
    await workspaceRegistry.deleteToken(req.params.workspace_id, '_service');
    res.json({ ok: true });
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ws/:workspace_id/health
   * Workspace health snapshot: connector statuses, total tool count, SSO status.
   * Called by the dashboard on load — no auth required so the page can detect
   * session state and show the auth wall when needed.
   * Auth: none
   */
  router.get('/ws/:workspace_id/health', wrap(async (req, res) => {
    const registry = await workspaceRegistry.getRegistry(req.params.workspace_id, logger);
    const sso      = await workspaceRegistry.tokenStatus(req.params.workspace_id);
    res.json({
      status:     'ok',
      workspace:  req.workspace.name,
      sso,
      connectors: registry?.getStatus()         ?? [],
      totalTools: registry?.getAllTools().length ?? 0,
    });
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTORS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ws/:workspace_id/api/connectors
   * List all connectors with status, transport type, tool count, and tool schemas.
   * Auth: admin session
   */
  router.get('/ws/:workspace_id/api/connectors', requireAdmin, wrap(async (req, res) => {
    const registry = await workspaceRegistry.getRegistry(req.params.workspace_id, logger);
    res.json(registry?.getStatus() ?? []);
  }));

  /**
   * POST /ws/:workspace_id/api/connectors
   * Add a new connector and attempt to connect to it.
   * Transport is auto-detected (Direct HTTP → Streamable HTTP → SSE) unless specified.
   * Body: { name*, url*, token?, transport?, sseUrl?, description? }
   * Auth: admin session
   */
  router.post('/ws/:workspace_id/api/connectors', requireAdmin, wrap(async (req, res) => {
    const { name, url, token, description, transport, sseUrl } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    const registry = await workspaceRegistry.getRegistry(req.params.workspace_id, logger);
    await registry.connectOne({ name, url, token, description, transport, sseUrl }, logger);
    await registry.saveConfig();
    res.json(registry.getStatus().find(c => c.name === name));
  }));

  /**
   * PATCH /ws/:workspace_id/api/connectors/:name
   * Update connector configuration and trigger a full disconnect + reconnect.
   * Body: { url?, token?, transport?, sseUrl?, description? }
   * Auth: admin session
   */
  router.patch('/ws/:workspace_id/api/connectors/:name', requireAdmin, wrap(async (req, res) => {
    const registry    = await workspaceRegistry.getRegistry(req.params.workspace_id, logger);
    await registry.updateOne(req.params.name, req.body, logger);
    await registry.saveConfig();
    const updatedName = req.body.name ?? req.params.name;
    res.json(registry.getStatus().find(c => c.name === updatedName));
  }));

  /**
   * DELETE /ws/:workspace_id/api/connectors/:name
   * Disconnect and permanently remove a connector, deregistering all its prefixed tools.
   * Auth: admin session
   */
  router.delete('/ws/:workspace_id/api/connectors/:name', requireAdmin, wrap(async (req, res) => {
    const registry = await workspaceRegistry.getRegistry(req.params.workspace_id, logger);
    const removed  = await registry.disconnectOne(req.params.name, logger);
    if (!removed) return res.status(404).json({ error: 'Connector not found' });
    await registry.saveConfig();
    res.json({ ok: true });
  }));

  /**
   * POST /ws/:workspace_id/api/connectors/:name/refresh
   * Re-fetch the tool list from a connected connector without interrupting the connection.
   * Auth: admin session
   */
  router.post('/ws/:workspace_id/api/connectors/:name/refresh', requireAdmin, wrap(async (req, res) => {
    const registry = await workspaceRegistry.getRegistry(req.params.workspace_id, logger);
    await registry.refreshOne(req.params.name, logger);
    res.json(registry.getStatus().find(c => c.name === req.params.name));
  }));

  /**
   * POST /ws/:workspace_id/api/connectors/:name/reconnect
   * Fully disconnect and reconnect a connector, re-fetching all tools from scratch.
   * Auth: admin session
   */
  router.post('/ws/:workspace_id/api/connectors/:name/reconnect', requireAdmin, wrap(async (req, res) => {
    const registry = await workspaceRegistry.getRegistry(req.params.workspace_id, logger);
    await registry.reconnectOne(req.params.name, logger);
    res.json(registry.getStatus().find(c => c.name === req.params.name));
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY PROVIDER (IdP)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ws/:workspace_id/api/idp
   * Retrieve the current IdP OAuth2 configuration.
   * client_secret is masked as '••••••••' in the response.
   * Auth: admin session
   */
  router.get('/ws/:workspace_id/api/idp', requireAdmin, (req, res) => {
    const { idp } = req.workspace;
    if (!idp) return res.json(null);
    res.json({ ...idp, client_secret: idp.client_secret ? '••••••••' : '' });
  });

  /**
   * PATCH /ws/:workspace_id/api/idp
   * Create or update the IdP OAuth2 configuration for this workspace.
   * Omitting client_secret or sending '••••••••' preserves the existing value.
   * Body: { name?, authorize_url*, token_url*, client_id*, client_secret?, scope? }
   * Auth: admin session
   */
  router.patch('/ws/:workspace_id/api/idp', requireAdmin, wrap(async (req, res) => {
    const existing = req.workspace.idp ?? {};
    await workspaceRegistry.updateIdp(req.params.workspace_id, {
      name:          req.body.name          ?? existing.name          ?? '',
      authorize_url: req.body.authorize_url ?? existing.authorize_url,
      token_url:     req.body.token_url     ?? existing.token_url,
      client_id:     req.body.client_id     ?? existing.client_id,
      client_secret: (req.body.client_secret && req.body.client_secret !== '••••••••')
                       ? req.body.client_secret : existing.client_secret,
      scope:         req.body.scope         ?? existing.scope ?? 'openid profile email',
    });
    res.json({ ok: true });
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // MCP  (Claude.ai connects here)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /ws/:workspace_id/mcp
   * Streamable HTTP MCP endpoint.
   * Without Mcp-Session-Id: creates a new MCP session (initialize handshake).
   * With Mcp-Session-Id: routes the request to the matching active session.
   * Auth: none — Claude.ai connects here directly
   */
  router.post('/ws/:workspace_id/mcp', (req, res) =>
    mcpSessions.handle(req, res, req.params.workspace_id)
  );

  /**
   * GET /ws/:workspace_id/mcp
   * SSE stream for an active MCP session.
   * Requires Mcp-Session-Id header from a previously established POST session.
   * Auth: none
   */
  router.get('/ws/:workspace_id/mcp', (req, res) =>
    mcpSessions.handle(req, res, req.params.workspace_id)
  );

  /**
   * DELETE /ws/:workspace_id/mcp
   * Close and clean up an active MCP session.
   * Requires Mcp-Session-Id header identifying the session to terminate.
   * Auth: none
   */
  router.delete('/ws/:workspace_id/mcp', (req, res) =>
    mcpSessions.close(req, res, req.params.workspace_id)
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CENTRAL ERROR HANDLER
  // ═══════════════════════════════════════════════════════════════════════════

  // Catches any error forwarded by wrap() from the handlers above.
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    logger.error('[hub] Unhandled route error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  return router;
}
