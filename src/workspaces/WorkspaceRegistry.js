/**
 * WorkspaceRegistry — multi-tenant workspace isolation.
 * Each workspace has its own IdP config and ConnectorRegistry, persisted in SQLite.
 */

import crypto                  from 'crypto';
import { WorkspaceRepository } from '../db/repositories/WorkspaceRepository.js';

export class WorkspaceRegistry {
  constructor() {
    // Stores Promise<ConnectorRegistry> so concurrent callers await the same init,
    // preventing duplicate initialize() calls for the same workspace.
    /** @type {Map<string, Promise<import('../connectors/ConnectorRegistry.js').ConnectorRegistry>>} */
    this._registries = new Map();
    this._repo       = new WorkspaceRepository();
  }

  // ── Workspace CRUD ─────────────────────────────────────────────────────────

  create(name) {
    const workspace_id   = 'ws_' + crypto.randomBytes(12).toString('hex');
    const admin_key      = 'ak_' + crypto.randomBytes(24).toString('hex');
    const admin_key_hash = crypto.createHash('sha256').update(admin_key).digest('hex');
    const created_at     = new Date().toISOString();

    this._repo.create({ workspace_id, name, admin_key_hash, created_at });
    return { workspace_id, admin_key, name };
  }

  getConfig(workspace_id) {
    return this._repo.findById(workspace_id);
  }

  verifyAdminKey(admin_key, admin_key_hash) {
    const hash = crypto.createHash('sha256').update(admin_key).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(admin_key_hash, 'hex'));
  }

  // ── IdP config ─────────────────────────────────────────────────────────────

  updateIdp(workspace_id, idp) {
    this._repo.updateIdp(workspace_id, JSON.stringify(idp));
  }

  // ── ConnectorRegistry per workspace ───────────────────────────────────────

  /**
   * Return the ConnectorRegistry for this workspace, initialising it on first call.
   *
   * The Promise is stored in _registries immediately so concurrent callers await
   * the same init rather than each starting their own initialize() run.
   */
  getRegistry(workspace_id, logger) {
    if (this._registries.has(workspace_id)) return this._registries.get(workspace_id);

    const p = (async () => {
      const { ConnectorRegistry } = await import('../connectors/ConnectorRegistry.js');
      const registry = new ConnectorRegistry({ workspaceId: workspace_id });
      await registry.initialize(logger)
        .catch(err => logger.error('[hub] Registry init error:', err.message));
      return registry;
    })();

    this._registries.set(workspace_id, p);
    return p;
  }

  invalidateRegistry(workspace_id) {
    this._registries.delete(workspace_id);
  }
}
