/**
 * ConnectorRegistry
 *
 * Manages all CMS connectors. Each connector points to a remote MCP server URL.
 * On connect, it fetches the remote server's tool list via tools/list and registers
 * them locally with a prefix so Claude can call them unambiguously.
 *
 * Prefixing rule:  <connector-name>__<original-tool-name>
 * Example:         drupal-site-a__get_node
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../connectors.json');

/**
 * Minimal JSON-RPC client for MCP servers that skip the initialize handshake
 * (e.g. Drupal mcp_server). Sends tools/list and tools/call directly.
 */
const FETCH_TIMEOUT_MS = 120_000; // 2 min — Drupal cold-start can be slow

class DirectHttpClient {
  constructor(url, headers) {
    this._url = url;
    this._headers = headers;
    this._id = 0;
  }

  async _rpc(method, params = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(this._url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...this._headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this._id, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));
      return data.result;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  listTools()                         { return this._rpc('tools/list'); }
  callTool({ name, arguments: args }) { return this._rpc('tools/call', { name, arguments: args ?? {} }); }
  close()                             {}
}

/** Sanitize connector name for use in tool names: only [a-zA-Z0-9_-] allowed */
function safePrefix(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export class ConnectorRegistry {
  constructor() {
    /** @type {Map<string, ConnectorEntry>} name → entry */
    this.connectors = new Map();
    /** @type {Map<string, {connector: string, originalName: string}>} prefixed tool name → routing info */
    this.toolIndex = new Map();
  }

  // ─── Config ────────────────────────────────────────────────────────────────

  async loadConfig() {
    try {
      const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
      const config = JSON.parse(raw);
      return config.connectors ?? [];
    } catch {
      return [];
    }
  }

  async saveConfig() {
    const connectors = [...this.connectors.values()].map(({ name, url, token, description, sseUrl, preferredTransport }) => ({
      name, url, token: token ?? '', description: description ?? '',
      ...(sseUrl ? { sseUrl } : {}),
      ...(preferredTransport ? { transport: preferredTransport } : {}),
    }));
    await fs.writeFile(CONFIG_PATH, JSON.stringify({ connectors }, null, 2));
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Boot: load config, connect all connectors in parallel */
  async initialize(logger = console) {
    const entries = await this.loadConfig();
    if (entries.length === 0) {
      logger.warn('[hub] No connectors configured yet. Add one via CLI or Web UI.');
      return;
    }
    await Promise.all(entries.map(entry => this.connectOne(entry, logger)));
  }

  /** Connect a single connector, fetch its tools, register them */
  async connectOne({ name, url, token, description, transport: preferredTransport, sseUrl }, logger = console) {
    if (this.connectors.has(name)) {
      logger.warn(`[hub] Connector "${name}" already registered — skipping`);
      return;
    }

    const entry = {
      name,
      url,
      token: token ?? '',
      description: description ?? '',
      preferredTransport: preferredTransport ?? null,
      sseUrl: sseUrl ?? null,
      status: 'connecting',
      tools: [],
      client: null,
      error: null,
    };
    this.connectors.set(name, entry);

    try {
      logger.info(`[hub] Connecting to "${name}" at ${url} …`);

      const headers = {
        ...(token ? { Authorization: `Basic ${token}` } : {}),
        // ngrok free-tier serves an HTML interstitial on first request without this header
        ...(url.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {}),
      };
      let activeClient;
      let usedTransport;
      let cachedTools = null;

      if (preferredTransport === 'sse') {
        // Caller explicitly wants SSE — use sseUrl if provided, otherwise url
        const streamUrl = sseUrl ?? url;
        activeClient = new Client({ name: 'cms-mcp-hub', version: '1.0.0' });
        const transport = new SSEClientTransport(new URL(streamUrl), { requestInit: { headers } });
        await activeClient.connect(transport);
        usedTransport = 'sse';
      } else if (preferredTransport === 'streamable-http') {
        activeClient = new Client({ name: 'cms-mcp-hub', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
        await activeClient.connect(transport);
        usedTransport = 'streamable-http';
      } else {
        // Auto-detect: direct HTTP → Streamable HTTP → SSE
        try {
          activeClient = new DirectHttpClient(url, headers);
          cachedTools = (await activeClient.listTools()).tools; // fast probe, cache result
          usedTransport = 'direct-http';
        } catch (directErr) {
          logger.warn(`[hub] "${name}" direct HTTP failed (${directErr.message}), trying Streamable HTTP…`);
          try {
            activeClient = new Client({ name: 'cms-mcp-hub', version: '1.0.0' });
            const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
            await activeClient.connect(transport);
            usedTransport = 'streamable-http';
          } catch (httpErr) {
            logger.warn(`[hub] "${name}" Streamable HTTP failed (${httpErr.message}), trying SSE…`);
            const streamUrl = sseUrl ?? url.replace(/\/post$/, '/sse');
            activeClient = new Client({ name: 'cms-mcp-hub', version: '1.0.0' });
            const transport = new SSEClientTransport(new URL(streamUrl), { requestInit: { headers } });
            await activeClient.connect(transport);
            usedTransport = 'sse';
          }
        }
      }

      const tools = cachedTools ?? (await activeClient.listTools()).tools;

      logger.info(`[hub] "${name}" — using ${usedTransport} transport`);
      entry.client = activeClient;
      entry.tools = tools;
      entry.status = 'connected';
      entry.transport = usedTransport;

      // Register each tool in the index under its prefixed name
      let collisions = 0;
      for (const tool of tools) {
        const prefixed = `${safePrefix(name)}__${tool.name}`;
        if (this.toolIndex.has(prefixed)) {
          logger.warn(`[hub] Tool name collision: "${prefixed}" already registered`);
          collisions++;
        } else {
          this.toolIndex.set(prefixed, { connector: name, originalName: tool.name });
        }
      }

      logger.info(
        `[hub] "${name}" connected — ${tools.length} tools registered` +
        (collisions ? ` (${collisions} collisions skipped)` : '')
      );
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message;
      logger.error(`[hub] Failed to connect "${name}": ${err.message}`);
    }
  }

  /** Disconnect and remove a connector */
  async disconnectOne(name, logger = console) {
    const entry = this.connectors.get(name);
    if (!entry) return false;

    // Remove its tools from the index
    for (const tool of entry.tools) {
      this.toolIndex.delete(`${safePrefix(name)}__${tool.name}`);
    }

    try {
      await entry.client?.close();
    } catch { /* best-effort */ }

    this.connectors.delete(name);
    logger.info(`[hub] Connector "${name}" disconnected`);
    return true;
  }

  /** Fully disconnect then reconnect a connector */
  async reconnectOne(name, logger = console) {
    const entry = this.connectors.get(name);
    if (!entry) throw new Error(`Connector "${name}" not found`);

    const config = {
      name: entry.name,
      url: entry.url,
      token: entry.token,
      description: entry.description,
      transport: entry.preferredTransport,
      sseUrl: entry.sseUrl,
    };

    await this.disconnectOne(name, logger);
    await this.connectOne(config, logger);
  }

  /** Refresh tools for one connector without restarting the hub */
  async refreshOne(name, logger = console) {
    const entry = this.connectors.get(name);
    if (!entry) throw new Error(`Connector "${name}" not found`);

    // Remove old tools from index
    for (const tool of entry.tools) {
      this.toolIndex.delete(`${safePrefix(name)}__${tool.name}`);
    }
    entry.tools = [];

    try {
      const { tools } = await entry.client.listTools();
      entry.tools = tools;
      for (const tool of tools) {
        const prefixed = `${safePrefix(name)}__${tool.name}`;
        this.toolIndex.set(prefixed, { connector: name, originalName: tool.name });
      }
      logger.info(`[hub] "${name}" refreshed — ${tools.length} tools`);
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message;
      throw err;
    }
  }

  // ─── Tool registry helpers ─────────────────────────────────────────────────

  /** Return all tools across all connected connectors, in prefixed form */
  getAllTools() {
    const tools = [];
    for (const [prefixed, { connector, originalName }] of this.toolIndex) {
      const entry = this.connectors.get(connector);
      if (!entry || entry.status !== 'connected') continue;
      const original = entry.tools.find(t => t.name === originalName);
      if (!original) continue;
      tools.push({
        ...original,
        name: prefixed,
        description: `[${connector}] ${original.description ?? ''}`.trim(),
      });
    }
    return tools;
  }

  /** Route a prefixed tool call to the correct connector client */
  async callTool(prefixedName, args) {
    const route = this.toolIndex.get(prefixedName);
    if (!route) throw new Error(`Unknown tool: "${prefixedName}"`);

    const entry = this.connectors.get(route.connector);
    if (!entry || entry.status !== 'connected') {
      throw new Error(`Connector "${route.connector}" is not connected`);
    }

    return entry.client.callTool({ name: route.originalName, arguments: args });
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  getStatus() {
    return [...this.connectors.values()].map(({ name, url, status, tools, error, description, transport }) => ({
      name, url, status, description, transport: transport ?? null,
      toolCount: tools.length,
      error: error ?? null,
    }));
  }
}
