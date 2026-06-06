/**
 * WorkspaceRegistry — multi-tenant workspace isolation
 * Each workspace has its own IdP config, connectors, and encrypted token store.
 */

import fs   from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { encrypt, decrypt } from './TokenStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../../data/workspaces');

export class WorkspaceRegistry {
  constructor() {
    /** @type {Map<string, import('../connectors/ConnectorRegistry.js').ConnectorRegistry>} */
    this._registries = new Map();
  }

  async _ensureDir(workspace_id) {
    await fs.mkdir(path.join(DATA_DIR, workspace_id, 'tokens'), { recursive: true });
  }

  // ── Workspace CRUD ─────────────────────────────────────────────────────────

  async create(name) {
    const workspace_id   = 'ws_' + crypto.randomBytes(12).toString('hex');
    const admin_key      = 'ak_' + crypto.randomBytes(24).toString('hex');
    const admin_key_hash = crypto.createHash('sha256').update(admin_key).digest('hex');

    const config = {
      workspace_id,
      name,
      admin_key_hash,
      idp: null,
      created_at: new Date().toISOString(),
    };

    await this._ensureDir(workspace_id);
    await this._writeConfig(workspace_id, config);
    return { workspace_id, admin_key, name };
  }

  async getConfig(workspace_id) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, workspace_id, 'config.json'), 'utf-8');
      return JSON.parse(raw);
    } catch { return null; }
  }

  async _writeConfig(workspace_id, config) {
    await this._ensureDir(workspace_id);
    await fs.writeFile(path.join(DATA_DIR, workspace_id, 'config.json'), JSON.stringify(config, null, 2));
  }

  verifyAdminKey(admin_key, admin_key_hash) {
    const hash = crypto.createHash('sha256').update(admin_key).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(admin_key_hash, 'hex'));
  }

  // ── IdP config ─────────────────────────────────────────────────────────────

  async updateIdp(workspace_id, idp) {
    const config = await this.getConfig(workspace_id);
    if (!config) throw new Error('Workspace not found');
    config.idp = idp;
    await this._writeConfig(workspace_id, config);
  }

  // ── Encrypted token store ──────────────────────────────────────────────────

  _tokenPath(workspace_id, sub) {
    return path.join(DATA_DIR, workspace_id, 'tokens', `${sub}.enc`);
  }

  async saveToken(workspace_id, sub, tokenData) {
    await this._ensureDir(workspace_id);
    await fs.writeFile(this._tokenPath(workspace_id, sub), encrypt(JSON.stringify(tokenData)));
  }

  async getToken(workspace_id, sub) {
    try {
      const raw = await fs.readFile(this._tokenPath(workspace_id, sub), 'utf-8');
      return JSON.parse(decrypt(raw));
    } catch { return null; }
  }

  async deleteToken(workspace_id, sub) {
    try { await fs.unlink(this._tokenPath(workspace_id, sub)); } catch {}
  }

  async tokenStatus(workspace_id) {
    const t = await this.getToken(workspace_id, '_service');
    if (!t) return { connected: false };
    const expired = !!(t.expires_at && Date.now() > t.expires_at);
    return { connected: true, expired, expires_at: t.expires_at, has_refresh: !!t.refresh_token,
             sub: t.sub ?? null, token_type: t.token_type ?? 'Bearer' };
  }

  // ── ConnectorRegistry per workspace ───────────────────────────────────────

  async getRegistry(workspace_id, logger) {
    if (this._registries.has(workspace_id)) return this._registries.get(workspace_id);

    const { ConnectorRegistry } = await import('../connectors/ConnectorRegistry.js');

    const configPath = path.join(DATA_DIR, workspace_id, 'connectors.json');

    // Token provider: returns SSO access_token for this workspace (auto-refreshes)
    const workspaceRef = this;
    const getToken = async () => {
      const t = await workspaceRef.getToken(workspace_id, '_service');
      if (!t) return null;
      // auto-refresh if expiring within 60s
      if (t.expires_at && Date.now() > t.expires_at - 60_000 && t.refresh_token) {
        const config = await workspaceRef.getConfig(workspace_id);
        if (config?.idp) {
          try {
            const refreshed = await refreshAccessToken(t.refresh_token, config.idp);
            await workspaceRef.saveToken(workspace_id, '_service', {
              ...t,
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token ?? t.refresh_token,
              expires_at: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
            });
            return refreshed.access_token;
          } catch { /* fall through to stale token */ }
        }
      }
      return t.access_token;
    };

    const registry = new ConnectorRegistry({ configPath, getToken });
    this._registries.set(workspace_id, registry); // register before init: prevents race + allows non-blocking access
    registry.initialize(logger).catch(err => logger.error('[hub] Registry init error:', err.message));
    return registry;
  }

  invalidateRegistry(workspace_id) {
    this._registries.delete(workspace_id);
  }
}

async function refreshAccessToken(refresh_token, idp) {
  const res = await fetch(idp.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token,
      client_id:     idp.client_id,
      client_secret: idp.client_secret,
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return res.json();
}
