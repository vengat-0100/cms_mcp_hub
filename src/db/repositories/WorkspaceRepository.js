/**
 * db/repositories/WorkspaceRepository.js — all workspace SQL in one place.
 */

import { getDb } from '../schema.js';

export class WorkspaceRepository {

  create({ workspace_id, name, admin_key_hash, created_at }) {
    getDb().prepare(`
      INSERT INTO workspaces (workspace_id, name, admin_key_hash, idp_json, created_at)
      VALUES (?, ?, ?, NULL, ?)
    `).run(workspace_id, name, admin_key_hash, created_at);
  }

  findById(workspace_id) {
    const row = getDb()
      .prepare('SELECT * FROM workspaces WHERE workspace_id = ?')
      .get(workspace_id);
    if (!row) return null;
    return {
      workspace_id:   row.workspace_id,
      name:           row.name,
      admin_key_hash: row.admin_key_hash,
      idp:            row.idp_json ? JSON.parse(row.idp_json) : null,
      created_at:     row.created_at,
    };
  }

  updateIdp(workspace_id, idpJson) {
    const result = getDb()
      .prepare('UPDATE workspaces SET idp_json = ? WHERE workspace_id = ?')
      .run(idpJson, workspace_id);
    if (result.changes === 0) throw new Error('Workspace not found');
  }
}
