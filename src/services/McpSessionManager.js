/**
 * services/McpSessionManager.js — MCP Streamable HTTP session lifecycle.
 *
 * Each Claude.ai connection creates a session keyed by `${workspace_id}:${session_id}`.
 * Sessions live in memory and are removed when the transport closes.
 *
 * Responsibilities:
 *   - Create and wire up an MCP Server for a given workspace on first connection.
 *   - Route subsequent requests to the correct existing session.
 *   - Handle session teardown cleanly.
 */

import { Server }                        from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID }                    from 'crypto';

export class McpSessionManager {
  /**
   * @param {import('../workspaces/WorkspaceRegistry.js').WorkspaceRegistry} workspaceRegistry
   * @param {object} logger
   */
  constructor(workspaceRegistry, logger) {
    this._workspaceRegistry = workspaceRegistry;
    this._logger            = logger;
    /** @type {Map<string, { server: Server, transport: StreamableHTTPServerTransport }>} */
    this._sessions          = new Map(); // key: `${workspace_id}:${session_id}`
  }

  // ── MCP Server factory ──────────────────────────────────────────────────────

  /**
   * Create an MCP Server wired to the workspace's ConnectorRegistry.
   * Registers handlers for tools/list and tools/call.
   */
  async _createServer(workspace_id) {
    const registry = await this._workspaceRegistry.getRegistry(workspace_id, this._logger);
    const server   = new Server(
      { name: 'cms-mcp-hub', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: registry?.getAllTools() ?? [],
    }));

    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const { name, arguments: args } = params;
      if (!registry) return { content: [{ type: 'text', text: 'No connectors configured' }], isError: true };
      try {
        return await registry.callTool(name, args ?? {});
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    });

    return server;
  }

  // ── Request handlers ────────────────────────────────────────────────────────

  /**
   * handle — Route a POST or GET to the MCP endpoint.
   *
   * POST without Mcp-Session-Id → creates a new session (initialise handshake).
   * POST / GET with Mcp-Session-Id → forwards to the matching existing session.
   */
  async handle(req, res, workspace_id) {
    const sessionId = req.headers['mcp-session-id'];
    const key       = `${workspace_id}:${sessionId}`;

    try {
      if (sessionId && this._sessions.has(key)) {
        // Existing session — route directly to its transport
        await this._sessions.get(key).transport.handleRequest(req, res, req.body);

      } else if (req.method === 'POST' && !sessionId) {
        // New session — create server + transport, then handle the initialise request
        const server    = await this._createServer(workspace_id);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        transport.onclose = () => {
          if (transport.sessionId) this._sessions.delete(`${workspace_id}:${transport.sessionId}`);
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        if (transport.sessionId) {
          this._sessions.set(`${workspace_id}:${transport.sessionId}`, { server, transport });
        }

      } else {
        res.status(400).json({ error: 'Missing or unknown MCP session ID' });
      }
    } catch (err) {
      this._logger.error('[hub] MCP error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  }

  /**
   * close — Tear down an active session identified by the Mcp-Session-Id header.
   */
  async close(req, res, workspace_id) {
    const key     = `${workspace_id}:${req.headers['mcp-session-id']}`;
    const session = this._sessions.get(key);
    if (session) {
      await session.transport.close().catch(() => {});
      this._sessions.delete(key);
    }
    res.sendStatus(200);
  }
}
