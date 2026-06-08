/**
 * ConnectorRegistry
 *
 * Manages all CMS connectors for a workspace. Each connector points to a remote
 * MCP server. On connect, fetches the remote tool list and registers each tool
 * locally under a prefixed name so Claude can call them unambiguously.
 *
 * Prefixing rule:  <safeConnectorName>__<originalToolName>
 * Example:         drupal_site_a__get_node
 */

import { Client }                        from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport }            from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConnectorRepository }           from '../db/repositories/ConnectorRepository.js';

// ── Direct HTTP client ────────────────────────────────────────────────────────
// Minimal JSON-RPC client for MCP servers that expose a plain HTTP endpoint
// (e.g. Drupal mcp_server). Bypasses the SDK initialize handshake and calls
// tools/list + tools/call directly.

const FETCH_TIMEOUT_MS = 120_000; // 2 min — Drupal cold-start can be slow

class DirectHttpClient {
  constructor(url, staticHeaders, getToken = null) {
    this._url      = url;
    this._headers  = staticHeaders;
    this._getToken = getToken;
    this._id       = 0;
  }

  async _buildHeaders(overrideToken = null) {
    const headers = { ...this._headers };
    if (!headers['Authorization'] && overrideToken) {
      headers['Authorization'] = overrideToken.startsWith('Bearer ')
        ? overrideToken
        : `Bearer ${overrideToken}`;
      return headers;
    }
    if (!headers['Authorization'] && this._getToken) {
      const token = await this._getToken();
      if (token) {
        headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      }
    }
    return headers;
  }

  async _rpc(method, params = {}, overrideToken = null) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers = await this._buildHeaders(overrideToken);
      const res     = await fetch(this._url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body:    JSON.stringify({ jsonrpc: '2.0', id: ++this._id, method, params }),
        signal:  controller.signal,
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

  listTools()                                      { return this._rpc('tools/list'); }
  callTool({ name, arguments: args }, accessToken) { return this._rpc('tools/call', { name, arguments: args ?? {} }, accessToken ?? null); }
  close()                                          {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safePrefix(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ── ConnectorRegistry ─────────────────────────────────────────────────────────

export class ConnectorRegistry {
  constructor({ workspaceId, getToken } = {}) {
    this.connectors   = new Map();  // name → entry
    this.toolIndex    = new Map();  // prefixedName → { connector, originalName }
    this._workspaceId = workspaceId ?? null;
    this._getToken    = getToken    ?? null;
    this._repo        = new ConnectorRepository();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async initialize(logger = console) {
    const entries = this._workspaceId ? this._repo.findAll(this._workspaceId) : [];
    if (entries.length === 0) {
      logger.warn('[hub] No connectors configured yet.');
      return;
    }
    await Promise.all(entries.map(e => this.connectOne(e, logger)));
  }

  async connectOne({ name, url, token, description, transport: preferredTransport, sseUrl, toolsJson = null }, logger = console) {
    if (this.connectors.has(name)) {
      logger.warn(`[hub] Connector "${name}" already registered — skipping`);
      return;
    }

    const entry = {
      name,
      url,
      token:              token              ?? '',
      description:        description        ?? '',
      preferredTransport: preferredTransport ?? null,
      sseUrl:             sseUrl             ?? null,
      status:             'connecting',
      tools:              [],
      client:             null,
      error:              null,
    };
    this.connectors.set(name, entry);

    try {
      logger.info(`[hub] Connecting to "${name}" at ${url} …`);

      const headers = {
        ...(token ? { Authorization: token } : {}),
        ...(url.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {}),
      };

      let client;
      let usedTransport;
      let cachedTools = null;

      if (preferredTransport === 'sse') {
        client = new Client({ name: 'cms-mcp-hub', version: '1.0.0' });
        await client.connect(new SSEClientTransport(new URL(sseUrl ?? url), { requestInit: { headers } }));
        usedTransport = 'sse';

      } else if (preferredTransport === 'streamable-http') {
        client = new Client({ name: 'cms-mcp-hub', version: '1.0.0' });
        await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
        usedTransport = 'streamable-http';

      } else {
        try {
          client        = new DirectHttpClient(url, headers, this._getToken);
          cachedTools   = (await client.listTools()).tools;
          usedTransport = 'direct-http';
        } catch (directErr) {
          logger.warn(`[hub] "${name}" direct HTTP failed (${directErr.message}), trying Streamable HTTP…`);
          try {
            client = new Client({ name: 'cms-mcp-hub', version: '1.0.0' });
            await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
            usedTransport = 'streamable-http';
          } catch (httpErr) {
            logger.warn(`[hub] "${name}" Streamable HTTP failed (${httpErr.message}), trying SSE…`);
            client = new Client({ name: 'cms-mcp-hub', version: '1.0.0' });
            await client.connect(new SSEClientTransport(
              new URL(sseUrl ?? url.replace(/\/post$/, '/sse')),
              { requestInit: { headers } }
            ));
            usedTransport = 'sse';
          }
        }
      }

      const tools = cachedTools ?? (await client.listTools()).tools;

      entry.client    = client;
      entry.tools     = tools;
      entry.status    = 'connected';
      entry.transport = usedTransport;

      if (this._workspaceId) {
        this._repo.upsert(this._workspaceId, {
          name, url, token, description,
          transport:  usedTransport,
          sseUrl,
          toolsJson:  JSON.stringify(tools),
        });
      }

      let collisions = 0;
      for (const tool of tools) {
        const prefixed = `${safePrefix(name)}__${tool.name}`;
        if (this.toolIndex.has(prefixed)) {
          logger.warn(`[hub] Tool name collision: "${prefixed}" — skipping duplicate`);
          collisions++;
        } else {
          this.toolIndex.set(prefixed, { connector: name, originalName: tool.name });
        }
      }

      logger.info(
        `[hub] "${name}" connected via ${usedTransport} — ${tools.length} tools` +
        (collisions ? ` (${collisions} collisions skipped)` : '')
      );

    } catch (err) {
      entry.status = 'error';
      entry.error  = err.message;
      logger.error(`[hub] Failed to connect "${name}": ${err.message}`);

      // Fallback: load cached tools from DB so tool list survives connector downtime
      const cachedJson = toolsJson ?? (this._workspaceId
        ? this._repo.getToolsJson(this._workspaceId, name)
        : null);

      if (cachedJson) {
        try {
          const cached = JSON.parse(cachedJson);
          if (cached.length > 0) {
            entry.tools  = cached;
            entry.status = 'cached';
            for (const tool of cached) {
              const prefixed = `${safePrefix(name)}__${tool.name}`;
              if (!this.toolIndex.has(prefixed)) {
                this.toolIndex.set(prefixed, { connector: name, originalName: tool.name });
              }
            }
            logger.warn(`[hub] "${name}" offline — serving ${cached.length} cached tools from DB`);
          }
        } catch {
          logger.warn(`[hub] "${name}" tools_json in DB is invalid — skipping cache`);
        }
      }
    }
  }

  async disconnectOne(name, logger = console) {
    const entry = this.connectors.get(name);
    if (!entry) return false;

    for (const tool of entry.tools) {
      this.toolIndex.delete(`${safePrefix(name)}__${tool.name}`);
    }
    try { await entry.client?.close(); } catch { /* best-effort */ }
    this.connectors.delete(name);

    if (this._workspaceId) {
      this._repo.remove(this._workspaceId, name);
    }

    logger.info(`[hub] Connector "${name}" disconnected`);
    return true;
  }

  async updateOne(name, updates, logger = console) {
    const entry = this.connectors.get(name);
    if (!entry) throw new Error(`Connector "${name}" not found`);
    await this.disconnectOne(name, logger);
    await this.connectOne({
      name:        updates.name        ?? entry.name,
      url:         updates.url         ?? entry.url,
      token:       updates.token       !== undefined ? updates.token : entry.token,
      description: updates.description ?? entry.description,
      transport:   updates.transport   ?? entry.preferredTransport,
      sseUrl:      updates.sseUrl      ?? entry.sseUrl,
    }, logger);
  }

  async reconnectOne(name, logger = console) {
    const entry = this.connectors.get(name);
    if (!entry) throw new Error(`Connector "${name}" not found`);
    const config = {
      name:        entry.name,
      url:         entry.url,
      token:       entry.token,
      description: entry.description,
      transport:   entry.preferredTransport,
      sseUrl:      entry.sseUrl,
    };
    await this.disconnectOne(name, logger);
    await this.connectOne(config, logger);
  }

  async refreshOne(name, logger = console) {
    const entry = this.connectors.get(name);
    if (!entry) throw new Error(`Connector "${name}" not found`);

    for (const tool of entry.tools) {
      this.toolIndex.delete(`${safePrefix(name)}__${tool.name}`);
    }
    entry.tools = [];

    const { tools } = await entry.client.listTools();
    entry.tools = tools;
    for (const tool of tools) {
      this.toolIndex.set(`${safePrefix(name)}__${tool.name}`, { connector: name, originalName: tool.name });
    }

    if (this._workspaceId) {
      this._repo.updateToolsJson(this._workspaceId, name, tools);
    }

    logger.info(`[hub] "${name}" refreshed — ${tools.length} tools`);
  }

  // ── Tool registry ─────────────────────────────────────────────────────────

  getAllTools() {
    const tools = [];
    for (const [prefixed, { connector, originalName }] of this.toolIndex) {
      const entry = this.connectors.get(connector);
      if (!entry || (entry.status !== 'connected' && entry.status !== 'cached')) continue;
      const original = entry.tools.find(t => t.name === originalName);
      if (!original) continue;
      tools.push({
        ...original,
        name:        prefixed,
        description: `[${connector}] ${original.description ?? ''}`.trim(),
      });
    }
    return tools;
  }

  async callTool(prefixedName, args, accessToken = null) {
    console.log('Calling tool:', prefixedName, 'with args:', args);
    const route = this.toolIndex.get(prefixedName);
    if (!route) throw new Error(`Unknown tool: "${prefixedName}"`);

    const entry = this.connectors.get(route.connector);
    if (!entry || entry.status === 'error') {
      throw new Error(`Connector "${route.connector}" is not connected`);
    }
    if (entry.status === 'cached') {
      throw new Error(`Connector "${route.connector}" is offline — reconnect it to call this tool`);
    }

    return entry.client.callTool({ name: route.originalName, arguments: args }, accessToken);
  }

  getStatus() {
    return [...this.connectors.values()].map(
      ({ name, url, status, tools, error, description, transport }) => ({
        name, url, status, description,
        transport:  transport  ?? null,
        toolCount:  tools.length,
        tools: tools.map(t => ({
          name:         t.name,
          title:        t.title        ?? t.name,
          description:  t.description  ?? '',
          inputSchema:  t.inputSchema  ?? {},
          outputSchema: t.outputSchema ?? null,
        })),
        error: error ?? null,
      })
    );
  }
}
