/**
 * db/UserTokenStore.js — per-user IdP token storage.
 *
 * Tokens are AES-256-GCM encrypted at rest.
 * getValidToken() silently refreshes if the token is within 60 s of expiry.
 */

import { getDb }           from './schema.js';
import { encrypt, decrypt } from '../workspaces/TokenStore.js';

export class UserTokenStore {

  // ── Users ─────────────────────────────────────────────────────────────────

  upsertUser(workspace_id, { sub, email, name }) {
    getDb().prepare(`
      INSERT INTO users (workspace_id, sub, email, name, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, sub) DO UPDATE SET
        email = excluded.email,
        name  = excluded.name
    `).run(workspace_id, sub, email ?? null, name ?? null, Date.now());
  }

  listUsers(workspace_id) {
    return getDb().prepare(`
      SELECT u.sub, u.email, u.name, u.created_at,
             t.expires_at, t.updated_at, t.token_type
      FROM   users u
      LEFT JOIN user_tokens t
             ON t.workspace_id = u.workspace_id AND t.sub = u.sub
      WHERE  u.workspace_id = ?
      ORDER  BY u.created_at DESC
    `).all(workspace_id);
  }

  // ── Tokens ────────────────────────────────────────────────────────────────

  storeToken(workspace_id, sub, { access_token, refresh_token, expires_at, token_type }) {
    getDb().prepare(`
      INSERT INTO user_tokens
        (workspace_id, sub, access_token_enc, refresh_token_enc, expires_at, token_type, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, sub) DO UPDATE SET
        access_token_enc  = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc,
        expires_at        = excluded.expires_at,
        token_type        = excluded.token_type,
        updated_at        = excluded.updated_at
    `).run(
      workspace_id, sub,
      encrypt(access_token),
      refresh_token ? encrypt(refresh_token) : null,
      expires_at  ?? null,
      token_type  ?? 'Bearer',
      Date.now(),
    );
  }

  getToken(workspace_id, sub) {
    const row = getDb().prepare(
      'SELECT * FROM user_tokens WHERE workspace_id = ? AND sub = ?'
    ).get(workspace_id, sub);
    if (!row) return null;
    return {
      access_token:  decrypt(row.access_token_enc),
      refresh_token: row.refresh_token_enc ? decrypt(row.refresh_token_enc) : null,
      expires_at:    row.expires_at,
      token_type:    row.token_type,
    };
  }

  async getValidToken(workspace_id, sub, idp) {
    const t = this.getToken(workspace_id, sub);
    if (!t) return null;

    const nearExpiry = t.expires_at && Date.now() > t.expires_at - 60_000;
    if (nearExpiry && t.refresh_token && idp?.token_url) {
      try {
        const res = await fetch(idp.token_url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({
            grant_type:    'refresh_token',
            refresh_token: t.refresh_token,
            client_id:     idp.client_id,
            client_secret: idp.client_secret,
          }),
        });
        if (res.ok) {
          const r = await res.json();
          this.storeToken(workspace_id, sub, {
            access_token:  r.access_token,
            refresh_token: r.refresh_token ?? t.refresh_token,
            expires_at:    Date.now() + (r.expires_in ?? 3600) * 1000,
            token_type:    r.token_type ?? 'Bearer',
          });
          return r.access_token;
        }
      } catch { /* fall through to current token */ }
    }
    return t.access_token;
  }

  deleteToken(workspace_id, sub) {
    const db = getDb();
    db.prepare('DELETE FROM user_tokens WHERE workspace_id = ? AND sub = ?').run(workspace_id, sub);
    db.prepare('DELETE FROM users       WHERE workspace_id = ? AND sub = ?').run(workspace_id, sub);
  }
}
