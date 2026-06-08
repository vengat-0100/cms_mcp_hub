/**
 * db/schema.js — better-sqlite3 singleton.
 *
 * Returns the raw Database instance from getDb(). Lazy-initialised so dotenv
 * is loaded before the DB path / encryption key are read.
 *
 * Table definitions live in tables.js (Drizzle schema — used as documentation
 * and for any future migration tooling).
 */

import Database from 'better-sqlite3';
import fs       from 'fs';
import path     from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.resolve(__dirname, '../../data/hub.db');
const DATA_DIR  = path.resolve(__dirname, '../../data');

let _db = null;

export function getDb() {
  if (_db) return _db;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // ── DDL ───────────────────────────────────────────────────────────────────
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT    NOT NULL,
      sub          TEXT    NOT NULL,
      email        TEXT,
      name         TEXT,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      UNIQUE(workspace_id, sub)
    );

    CREATE TABLE IF NOT EXISTS user_tokens (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id      TEXT    NOT NULL,
      sub               TEXT    NOT NULL,
      access_token_enc  TEXT    NOT NULL,
      refresh_token_enc TEXT,
      expires_at        INTEGER,
      token_type        TEXT    NOT NULL DEFAULT 'Bearer',
      updated_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      UNIQUE(workspace_id, sub)
    );

    CREATE TABLE IF NOT EXISTS hub_sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT    NOT NULL,
      sub          TEXT    NOT NULL,
      token_hash   TEXT    NOT NULL UNIQUE,
      expires_at   INTEGER NOT NULL,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      hub_state             TEXT PRIMARY KEY,
      workspace_id          TEXT NOT NULL,
      client_state          TEXT,
      code_challenge        TEXT,
      code_challenge_method TEXT DEFAULT 'S256',
      redirect_uri          TEXT,
      client_id             TEXT,
      expires_at            INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_codes (
      code           TEXT PRIMARY KEY,
      workspace_id   TEXT NOT NULL,
      sub            TEXT NOT NULL,
      code_challenge TEXT,
      redirect_uri   TEXT,
      expires_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id   TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      admin_key_hash TEXT NOT NULL,
      idp_json       TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connectors (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      name         TEXT NOT NULL,
      url          TEXT NOT NULL,
      token        TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      transport    TEXT,
      sse_url      TEXT,
      UNIQUE(workspace_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_hub_sessions_token   ON hub_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_user_tokens_lookup   ON user_tokens(workspace_id, sub);
    CREATE INDEX IF NOT EXISTS idx_users_lookup         ON users(workspace_id, sub);
    CREATE INDEX IF NOT EXISTS idx_connectors_workspace ON connectors(workspace_id);
  `);

  // ── Column migrations ─────────────────────────────────────────────────────
  const oauthCols = _db.prepare('PRAGMA table_info(oauth_states)').all();
  if (!oauthCols.find(c => c.name === 'is_admin_test')) {
    _db.exec('ALTER TABLE oauth_states ADD COLUMN is_admin_test INTEGER DEFAULT 0');
  }

  const connCols = _db.prepare('PRAGMA table_info(connectors)').all();
  if (!connCols.find(c => c.name === 'tools_json')) {
    _db.exec('ALTER TABLE connectors ADD COLUMN tools_json TEXT');
  }

  return _db;
}
