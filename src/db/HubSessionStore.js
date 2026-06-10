/**
 * db/HubSessionStore.js — hub-issued bearer tokens for Claude.ai connections.
 *
 * Tokens are random 32-byte hex strings; only their SHA-256 hash is stored.
 * TTL: 8 hours.
 */

import { createHash, randomBytes } from 'crypto';
import { getDb }                   from './schema.js';

const TTL_MS = 8 * 60 * 60 * 1000; // 8 h

export class HubSessionStore {

  issue(workspace_id, sub) {
    const token      = randomBytes(32).toString('hex');
    const token_hash = createHash('sha256').update(token).digest('hex');
    const expires_at = Date.now() + TTL_MS;
    getDb().prepare(`
      INSERT INTO hub_sessions (workspace_id, sub, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(workspace_id, sub, token_hash, expires_at, Date.now());
    return { token, expires_at };
  }

  verify(token) {
    const hash = createHash('sha256').update(token).digest('hex');
    if (process.env.DEBUG_AUTH) {
      const all = getDb().prepare('SELECT token_hash, expires_at, sub FROM hub_sessions').all();
      console.debug('[auth] verifying hash:', hash);
      console.debug('[auth] sessions in DB:', all.map(r => ({
        hash:       r.token_hash.slice(0, 12) + '…',
        sub:        r.sub,
        expires_in: Math.round((r.expires_at - Date.now()) / 1000) + 's',
      })));
    }
    const row = getDb().prepare(
      'SELECT * FROM hub_sessions WHERE token_hash = ? AND expires_at > ?'
    ).get(hash, Date.now());

    const rows = getDb().prepare(
      'SELECT * FROM hub_sessions WHERE 1'
    ).all();
console.log(rows);

    if (!row) return null;
    return { workspace_id: row.workspace_id, sub: row.sub, expires_at: row.expires_at };
  }

  revoke(token) {
    const hash = createHash('sha256').update(token).digest('hex');
    getDb().prepare('DELETE FROM hub_sessions WHERE token_hash = ?').run(hash);
  }

  pruneExpired() {
    getDb().prepare('DELETE FROM hub_sessions WHERE expires_at < ?').run(Date.now());
  }
}
