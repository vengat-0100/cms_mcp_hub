/**
 * db/repositories/ConnectorRepository.js — all connector SQL in one place.
 */

import { getDb } from '../schema.js';

export class ConnectorRepository {

  findAll(workspace_id) {
    return getDb()
      .prepare('SELECT * FROM connectors WHERE workspace_id = ?')
      .all(workspace_id)
      .map(row => ({
        name:        row.name,
        url:         row.url,
        token:       row.token       ?? '',
        description: row.description ?? '',
        transport:   row.transport   ?? null,
        sseUrl:      row.sse_url     ?? null,
        toolsJson:   row.tools_json  ?? null,
      }));
  }

  upsert(workspace_id, { name, url, token, description, transport, sseUrl, toolsJson }) {
    getDb().prepare(`
      INSERT INTO connectors (workspace_id, name, url, token, description, transport, sse_url, tools_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, name) DO UPDATE SET
        url        = excluded.url,
        token      = excluded.token,
        description = excluded.description,
        transport  = excluded.transport,
        sse_url    = excluded.sse_url,
        tools_json = excluded.tools_json
    `).run(
      workspace_id, name, url,
      token       ?? '',
      description ?? '',
      transport   ?? null,
      sseUrl      ?? null,
      toolsJson   ?? null,
    );
  }

  remove(workspace_id, name) {
    getDb()
      .prepare('DELETE FROM connectors WHERE workspace_id = ? AND name = ?')
      .run(workspace_id, name);
  }

  updateToolsJson(workspace_id, name, tools) {
    getDb()
      .prepare('UPDATE connectors SET tools_json = ? WHERE workspace_id = ? AND name = ?')
      .run(JSON.stringify(tools), workspace_id, name);
  }

  getToolsJson(workspace_id, name) {
    return getDb()
      .prepare('SELECT tools_json FROM connectors WHERE workspace_id = ? AND name = ?')
      .get(workspace_id, name)?.tools_json ?? null;
  }
}
