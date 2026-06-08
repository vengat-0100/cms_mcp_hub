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

import express                            from 'express';
import { createWebUiRouter }              from './web/ui.js';
import { McpSessionManager }              from './services/McpSessionManager.js';
import { createOAuthRouter, stateStore, userTokens } from './routes/oauth.js';
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

  // ── OAuth 2.0 AS endpoints (discovery, authorize, callback, token) ─────────
  router.use(createOAuthRouter(workspaceRegistry));

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
  // SSO / OAUTH 2.0  (admin test + per-user flows unified via /oauth/callback)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ws/:workspace_id/auth/sso/start
   * Admin triggers an IdP test from the dashboard.
   * Creates an admin-test OAuth state (is_admin_test=true, no PKCE) and redirects
   * to the IdP. The unified /oauth/callback detects the flag, decodes the response,
   * stores a temp result, and redirects the popup back with ?idp_test=<result_id>.
   * Auth: admin session
   */
  router.get('/ws/:workspace_id/auth/sso/start', requireAdmin, (req, res) => {
    const { idp } = req.workspace;
    if (!idp?.authorize_url) return res.status(400).json({ error: 'IdP not configured' });
    const hub_state = stateStore.createAdminTestState(req.params.workspace_id);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     idp.client_id,
      redirect_uri:  `${baseUrl(req)}/ws/${req.params.workspace_id}/oauth/callback`,
      scope:         idp.scope ?? 'openid profile email',
      state:         hub_state,
    });
    res.redirect(`${idp.authorize_url}?${params}`);
  });

  /**
   * GET /ws/:workspace_id/auth/sso/status
   * Return all users who have authenticated via SSO for this workspace.
   * { users: [{ sub, email, name, expires_at, updated_at, token_type }] }
   * Auth: admin session
   */
  router.get('/ws/:workspace_id/auth/sso/status', requireAdmin, (req, res) => {
    res.json({ users: userTokens.listUsers(req.params.workspace_id) });
  });

  /**
   * GET /ws/:workspace_id/auth/sso/test-result/:id
   * Fetch and consume a pending admin IdP test result (TTL: 5 min, single-use).
   * Auth: admin session
   */
  router.get('/ws/:workspace_id/auth/sso/test-result/:id', requireAdmin, (req, res) => {
    const result = stateStore.consumeTestResult(req.params.id);
    if (!result) return res.status(404).json({ error: 'Result not found or expired' });
    res.json(result);
  });

  /**
   * DELETE /ws/:workspace_id/auth/sso/users/:sub
   * Revoke a specific user's stored IdP token (forces re-authentication on next MCP call).
   * Auth: admin session
   */
  router.delete('/ws/:workspace_id/auth/sso/users/:sub', requireAdmin, (req, res) => {
    userTokens.deleteToken(req.params.workspace_id, decodeURIComponent(req.params.sub));
    res.json({ ok: true });
  });

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
    res.json({
      status:          'ok',
      workspace:       req.workspace.name,
      sso:             { connected_users: userTokens.listUsers(req.params.workspace_id).length },
      connectors:      registry?.getStatus()         ?? [],
      totalTools:      registry?.getAllTools().length ?? 0,
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
