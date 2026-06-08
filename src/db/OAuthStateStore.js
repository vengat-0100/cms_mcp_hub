/**
 * db/OAuthStateStore.js — two-phase PKCE state machine + admin test result store.
 *
 * Phase 1 (oauth_states): client initiates → hub saves PKCE params + is_admin_test flag.
 * Phase 2 (oauth_codes):  IdP callback    → hub issues auth code for token exchange.
 * Admin test results: in-memory, TTL 5 min, consumed once.
 */

import { randomBytes } from 'crypto';
import { getDb }       from './schema.js';

const STATE_TTL_MS  = 10 * 60 * 1000;
const CODE_TTL_MS   =  5 * 60 * 1000;
const RESULT_TTL_MS =  5 * 60 * 1000;

export class OAuthStateStore {
  constructor() {
    /** @type {Map<string, { result: object, expiresAt: number }>} */
    this._testResults = new Map();
  }

  // ── Phase 1 — OAuth state ─────────────────────────────────────────────────

  createState(workspace_id, {
    client_state, code_challenge, code_challenge_method,
    redirect_uri, client_id, is_admin_test = false,
  } = {}) {
    const hub_state = randomBytes(20).toString('hex');
    getDb().prepare(`
      INSERT INTO oauth_states
        (hub_state, workspace_id, client_state, code_challenge,
         code_challenge_method, redirect_uri, client_id, is_admin_test, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      hub_state, workspace_id,
      client_state          ?? null,
      code_challenge        ?? null,
      code_challenge_method ?? 'S256',
      redirect_uri          ?? null,
      client_id             ?? null,
      is_admin_test ? 1 : 0,
      Date.now() + STATE_TTL_MS,
    );
    return hub_state;
  }

  createAdminTestState(workspace_id) {
    return this.createState(workspace_id, { is_admin_test: true });
  }

  consumeState(hub_state) {
    const row = getDb().prepare(
      'SELECT * FROM oauth_states WHERE hub_state = ? AND expires_at > ?'
    ).get(hub_state, Date.now());
    if (!row) return null;
    getDb().prepare('DELETE FROM oauth_states WHERE hub_state = ?').run(hub_state);
    return row;
  }

  // ── Phase 2 — Auth code ───────────────────────────────────────────────────

  createCode(workspace_id, sub, { code_challenge, redirect_uri }) {
    const code = randomBytes(24).toString('hex');
    getDb().prepare(`
      INSERT INTO oauth_codes (code, workspace_id, sub, code_challenge, redirect_uri, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code, workspace_id, sub,
      code_challenge ?? null,
      redirect_uri   ?? null,
      Date.now() + CODE_TTL_MS,
    );
    return code;
  }

  consumeCode(code) {
    const row = getDb().prepare(
      'SELECT * FROM oauth_codes WHERE code = ? AND expires_at > ?'
    ).get(code, Date.now());
    if (!row) return null;
    getDb().prepare('DELETE FROM oauth_codes WHERE code = ?').run(code);
    return row;
  }

  // ── Admin test results (in-memory) ────────────────────────────────────────

  storeTestResult(result) {
    const id = randomBytes(16).toString('hex');
    this._testResults.set(id, { result, expiresAt: Date.now() + RESULT_TTL_MS });
    return id;
  }

  consumeTestResult(id) {
    const entry = this._testResults.get(id);
    if (!entry || Date.now() > entry.expiresAt) return null;
    this._testResults.delete(id);
    return entry.result;
  }
}
