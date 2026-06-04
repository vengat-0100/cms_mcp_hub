/**
 * MCP Hub Server
 *
 * Exposes the connector hub as an MCP server.
 * Claude.ai connects here, sees all prefixed tools from all connectors,
 * and its tool calls get proxied to the right CMS MCP server.
 *
 * Transports supported:
 *   - Streamable HTTP  →  POST /mcp          (recommended, Claude.ai compatible)
 *   - SSE fallback     →  GET  /mcp/sse      (legacy clients)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { randomUUID } from 'crypto';
import { createWebUiRouter } from '../web/ui.js';

export class McpHubServer {
  /**
   * @param {import('../connectors/ConnectorRegistry.js').ConnectorRegistry} registry
   * @param {{ port?: number, logger?: Console }} opts
   */
  constructor(registry, { port = 3456, logger = console } = {}) {
    this.registry = registry;
    this.port = port;
    this.logger = logger;

    this.app = express();
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });

    // Streamable HTTP sessions: sessionId → { server, transport }
    this.httpSessions = new Map();
    // Legacy SSE sessions
    this.sseSessions = new Map();
  }

  _createMcpServer() {
    const server = new Server(
      { name: 'cms-mcp-hub', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    // Handle tools/list — return all prefixed tools from all connectors
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.registry.getAllTools() };
    });

    // Handle tools/call — proxy to the right connector
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      this.logger.info(`[hub] Tool call: ${name}`);
      try {
        const result = await this.registry.callTool(name, args ?? {});
        return result;
      } catch (err) {
        this.logger.error(`[hub] Tool call failed (${name}): ${err.message}`);
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    });

    return server;
  }

  _setupRoutes() {
    const app = this.app;

    // ── Streamable HTTP (recommended for Claude.ai) ──────────────────────────
    const handleMcp = async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      try {
        if (sessionId && this.httpSessions.has(sessionId)) {
          // Route to existing session
          const { transport } = this.httpSessions.get(sessionId);
          await transport.handleRequest(req, res, req.body);
        } else if (req.method === 'POST' && !sessionId) {
          // New session — initialize handshake
          const server = this._createMcpServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });
          transport.onclose = () => {
            if (transport.sessionId) this.httpSessions.delete(transport.sessionId);
          };
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          if (transport.sessionId) {
            this.httpSessions.set(transport.sessionId, { server, transport });
          }
        } else {
          res.status(400).json({ error: 'Bad request: missing or unknown session ID' });
        }
      } catch (err) {
        this.logger.error('[hub] Streamable HTTP error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      }
    };

    app.post('/mcp', handleMcp);
    app.get('/mcp', handleMcp);   // SSE stream for server-initiated messages

    app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (sessionId && this.httpSessions.has(sessionId)) {
        const { transport } = this.httpSessions.get(sessionId);
        await transport.close().catch(() => {});
        this.httpSessions.delete(sessionId);
      }
      res.sendStatus(200);
    });

    // ── SSE transport — GET /mcp/sse (legacy fallback) ───────────────────────
    app.get('/mcp/sse', async (req, res) => {
      const server = this._createMcpServer();
      const transport = new SSEServerTransport('/mcp/sse/message', res);
      this.sseSessions.set(transport.sessionId, transport);
      res.on('close', () => this.sseSessions.delete(transport.sessionId));
      await server.connect(transport);
    });

    app.post('/mcp/sse/message', async (req, res) => {
      const sessionId = req.query.sessionId;
      const transport = this.sseSessions.get(sessionId);
      if (!transport) return res.status(404).json({ error: 'Session not found' });
      await transport.handlePostMessage(req, res, req.body);
    });

    // ── Web UI ────────────────────────────────────────────────────────────────
    app.use(createWebUiRouter());

    // ── Health / status ───────────────────────────────────────────────────────
    app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        connectors: this.registry.getStatus(),
        totalTools: this.registry.getAllTools().length,
      });
    });

    // ── Connector management API (used by Web UI) ─────────────────────────────
    app.get('/api/connectors', (_req, res) => {
      res.json(this.registry.getStatus());
    });

    app.post('/api/connectors', async (req, res) => {
      const { name, url, token, description } = req.body;
      if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
      try {
        await this.registry.connectOne({ name, url, token, description }, this.logger);
        await this.registry.saveConfig();
        res.json(this.registry.getStatus().find(c => c.name === name));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/connectors/:name', async (req, res) => {
      const removed = await this.registry.disconnectOne(req.params.name, this.logger);
      if (!removed) return res.status(404).json({ error: 'Connector not found' });
      await this.registry.saveConfig();
      res.json({ ok: true });
    });

    app.post('/api/connectors/:name/refresh', async (req, res) => {
      try {
        await this.registry.refreshOne(req.params.name, this.logger);
        res.json(this.registry.getStatus().find(c => c.name === req.params.name));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch('/api/connectors/:name', async (req, res) => {
      try {
        await this.registry.updateOne(req.params.name, req.body, this.logger);
        await this.registry.saveConfig();
        const updated = req.body.name ?? req.params.name;
        res.json(this.registry.getStatus().find(c => c.name === updated));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/connectors/:name/reconnect', async (req, res) => {
      try {
        await this.registry.reconnectOne(req.params.name, this.logger);
        res.json(this.registry.getStatus().find(c => c.name === req.params.name));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  async start() {
    this._setupRoutes();
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(this.port, () => {
        this.logger.info(`[hub] MCP Hub running on http://localhost:${this.port}`);
        this.logger.info(`[hub] Claude.ai endpoint  →  http://localhost:${this.port}/mcp`);
        this.logger.info(`[hub] SSE fallback         →  http://localhost:${this.port}/mcp/sse`);
        this.logger.info(`[hub] Web UI               →  http://localhost:${this.port}/ui`);
        this.logger.info(`[hub] Status               →  http://localhost:${this.port}/health`);
        resolve();
      });
    });
  }

  stop() {
    this.httpServer?.close();
  }
}
