/**
 * services/McpSessionManager.js — Direct JSON-RPC handler (no SDK server/transport).
 *
 * Every POST to /ws/:id/mcp:
 *   1. Verify Authorization: Bearer <hub_token> — 401 with WWW-Authenticate if missing/invalid.
 *   2. Resolve (workspace_id, sub) from the verified token.
 *   3. Fetch the cached ConnectorRegistry (instant after first call).
 *   4. Dispatch method directly — no MCP Server/Transport instantiation per request.
 *
 * Handled methods:
 *   initialize          → return server capabilities
 *   tools/list          → registry.getAllTools()
 *   tools/call          → registry.callTool() with per-user IdP token
 *   notifications/*     → acknowledged silently (no response — notifications have no id)
 */

import { hubSessions, userTokens } from '../routes/oauth.js';

const SERVER_INFO = { name: 'cms-mcp-hub', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';

export class McpSessionManager {
  constructor(workspaceRegistry, logger) {
    this._workspaceRegistry = workspaceRegistry;
    this._logger            = logger;
  }

  // ── Bearer-token auth ───────────────────────────────────────────────────────

  _verifyRequest(req, workspace_id) {
    const auth  = req.headers['authorization'] ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    if (!token) return null;
    const session = hubSessions.verify(token);
    if (!session || session.workspace_id !== workspace_id) return null;
    return session;
  }

  // ── Main handler ────────────────────────────────────────────────────────────

  async handle(req, res, workspace_id) {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const identity = this._verifyRequest(req, workspace_id);
    if (!identity) {
      const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
      const base  = `${proto}://${req.headers.host}/ws/${workspace_id}`;
      res.setHeader(
        'WWW-Authenticate',
        `Bearer realm="CMS MCP Hub", resource_metadata="${base}/.well-known/oauth-protected-resource"`
      );
      return res.status(401).json({ error: 'Unauthorized — connect via OAuth first' });
    }

    const { sub } = identity;
    const { jsonrpc, id, method, params } = req.body ?? {};
    // Notifications have no id — acknowledge with 202, no body
    if (id === undefined || id === null) {
      if (method?.startsWith('notifications/')) return res.sendStatus(202);
    }

    const ok  = (result) => res.json({ jsonrpc: '2.0', id: id ?? null, result });
    const err = (code, message) => res.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

    // ── 2. Dispatch ──────────────────────────────────────────────────────────
    try {
      if (method === 'initialize') {
        return ok({
          protocolVersion: PROTOCOL_VERSION,
          capabilities:    { tools: {} },
          serverInfo:      SERVER_INFO,
        });
      }

      // Registry is cached after first call — no overhead on subsequent requests
      const registry = await this._workspaceRegistry.getRegistry(workspace_id, this._logger);
      if (method === 'tools/list') {
        return ok({ tools: registry.getAllTools() });
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params ?? {};
        if (!name) return err(-32602, 'params.name is required');

        const config      = this._workspaceRegistry.getConfig(workspace_id);
        const accessToken = await userTokens.getValidToken(workspace_id, sub, config?.idp ?? null);
        const result      = await registry.callTool(name, args ?? {}, accessToken);
        return ok(result);
      }

      return err(-32601, `Method not supported: ${method}`);

    } catch (e) {
      this._logger.error('[hub] MCP error:', e);
      return err(-32000, e);
    }
  }

  /** DELETE /ws/:id/mcp — stateless; nothing to tear down server-side. */
  close(_req, res) {
    res.sendStatus(200);
  }
}
