/**
 * db/tables.js — Drizzle table definitions (single source of truth for the schema).
 *
 * Import individual tables wherever queries are needed.
 * The DB client (getDb) lives in schema.js.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  workspace_id:   text('workspace_id').primaryKey(),
  name:           text('name').notNull(),
  admin_key_hash: text('admin_key_hash').notNull(),
  idp_json:       text('idp_json'),
  created_at:     text('created_at').notNull(),
});

export const connectors = sqliteTable('connectors', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  workspace_id: text('workspace_id').notNull(),
  name:         text('name').notNull(),
  url:          text('url').notNull(),
  token:        text('token').notNull().default(''),
  description:  text('description').notNull().default(''),
  transport:    text('transport'),
  sse_url:      text('sse_url'),
  tools_json:   text('tools_json'),
});

export const users = sqliteTable('users', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  workspace_id: text('workspace_id').notNull(),
  sub:          text('sub').notNull(),
  email:        text('email'),
  name:         text('name'),
  created_at:   integer('created_at').notNull(),
});

export const userTokens = sqliteTable('user_tokens', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  workspace_id:      text('workspace_id').notNull(),
  sub:               text('sub').notNull(),
  access_token_enc:  text('access_token_enc').notNull(),
  refresh_token_enc: text('refresh_token_enc'),
  expires_at:        integer('expires_at'),
  token_type:        text('token_type').notNull().default('Bearer'),
  updated_at:        integer('updated_at').notNull(),
});

export const hubSessions = sqliteTable('hub_sessions', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  workspace_id: text('workspace_id').notNull(),
  sub:          text('sub').notNull(),
  token_hash:   text('token_hash').notNull().unique(),
  expires_at:   integer('expires_at').notNull(),
  created_at:   integer('created_at').notNull(),
});

export const oauthStates = sqliteTable('oauth_states', {
  hub_state:             text('hub_state').primaryKey(),
  workspace_id:          text('workspace_id').notNull(),
  client_state:          text('client_state'),
  code_challenge:        text('code_challenge'),
  code_challenge_method: text('code_challenge_method').default('S256'),
  redirect_uri:          text('redirect_uri'),
  client_id:             text('client_id'),
  is_admin_test:         integer('is_admin_test').default(0),
  expires_at:            integer('expires_at').notNull(),
});

export const oauthCodes = sqliteTable('oauth_codes', {
  code:           text('code').primaryKey(),
  workspace_id:   text('workspace_id').notNull(),
  sub:            text('sub').notNull(),
  code_challenge: text('code_challenge'),
  redirect_uri:   text('redirect_uri'),
  expires_at:     integer('expires_at').notNull(),
});
