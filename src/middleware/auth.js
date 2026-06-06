/**
 * middleware/auth.js — Session management for workspace-scoped admin sessions.
 *
 * Sessions are HMAC-signed tokens stored in an HttpOnly cookie scoped to each
 * workspace path, giving each workspace fully independent auth state.
 *
 * Exports:
 *   setSessionCookie(res, workspace_id)   — write signed cookie after login
 *   clearSessionCookie(res, workspace_id) — expire cookie on logout
 *   requireAdmin(req, res, next)          — Express middleware: reject missing/invalid sessions
 *   workspaceParam(workspaceRegistry)     — Express app.param factory: validate + attach workspace
 */

import { signSession, verifySession } from '../workspaces/TokenStore.js';

const SESSION_COOKIE = 'ws_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Parse the session cookie from the request and verify its HMAC signature. */
function parseSessionCookie(req) {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) {
      try { return verifySession(decodeURIComponent(v.join('='))); } catch { return null; }
    }
  }
  return null;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

/** Sign a new session payload and write the HttpOnly cookie to the response. */
export function setSessionCookie(res, workspace_id) {
  const token = signSession({ workspace_id, exp: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; ` +
    `Path=/ws/${workspace_id}/; Max-Age=${SESSION_TTL_MS / 1000}`
  );
}

/** Expire the session cookie immediately. */
export function clearSessionCookie(res, workspace_id) {
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/ws/${workspace_id}/; Max-Age=0`
  );
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * requireAdmin — reject requests without a valid admin session.
 *
 * Reads the session cookie, verifies the HMAC signature and expiry,
 * and confirms the session's workspace_id matches the route parameter.
 * Returns 401 JSON on failure; calls next() on success.
 */
export function requireAdmin(req, res, next) {
  const session = parseSessionCookie(req);
  if (!session || session.workspace_id !== req.params.workspace_id) {
    return res.status(401).json({ error: 'Unauthorized — please log in' });
  }
  next();
}

/**
 * workspaceParam — Express app.param / router.param factory.
 *
 * Validates that a workspace exists for the :workspace_id route parameter
 * and attaches the workspace config to req.workspace before the route handler runs.
 * Returns 404 JSON if the workspace is not found.
 *
 * Usage: router.param('workspace_id', workspaceParam(workspaceRegistry))
 */
export function workspaceParam(workspaceRegistry) {
  return async (req, res, next, workspace_id) => {
    const config = await workspaceRegistry.getConfig(workspace_id);
    if (!config) return res.status(404).json({ error: 'Workspace not found' });
    req.workspace = config;
    next();
  };
}
