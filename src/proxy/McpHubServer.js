/**
 * proxy/McpHubServer.js — Express application bootstrap.
 *
 * Responsibilities (only):
 *   1. Create the Express app.
 *   2. Register shared middleware: JSON body parser, CORS.
 *   3. Mount the central router from src/routes.js.
 *   4. Bind to the HTTP port and manage server lifecycle (start / stop).
 *
 * All route definitions live in src/routes.js.
 * All business logic lives in the service and registry classes it imports.
 */

import express          from 'express';
import { createRouter } from '../routes.js';

export class McpHubServer {
  /**
   * @param {import('../workspaces/WorkspaceRegistry.js').WorkspaceRegistry} workspaceRegistry
   * @param {{ port?: number, logger?: object }} opts
   */
  constructor(workspaceRegistry, { port = 3456, logger = console } = {}) {
    this.port   = port;
    this.logger = logger;

    this.app = express();

    // ── Shared middleware ────────────────────────────────────────────────────
    this.app.use(express.json());

    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin',  '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });

    // ── Routes ───────────────────────────────────────────────────────────────
    this.app.use(createRouter(workspaceRegistry, null, logger));
  }

  /** Start listening. Returns a Promise that resolves once the port is bound. */
  start() {
    return new Promise(resolve => {
      this.httpServer = this.app.listen(this.port, '0.0.0.0', () => {
        this.logger.info(`[hub] MCP Hub running on http://localhost:${this.port}`);
        this.logger.info(`[hub] Landing page  →  http://localhost:${this.port}/`);
        this.logger.info(`[hub] Workspace MCP →  http://localhost:${this.port}/ws/{workspace_id}/mcp`);
        resolve();
      });
    });
  }

  /** Gracefully close the HTTP server. */
  stop() { this.httpServer?.close(); }
}
