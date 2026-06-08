/**
 * routes/oauth.js — OAuth 2.0 Authorization Server endpoints for MCP clients.
 *
 * Implements the MCP OAuth 2.0 spec (2025-03-26):
 *   1.  Discovery  GET  /ws/:id/.well-known/oauth-authorization-server
 *   2.  Discovery  GET  /ws/:id/.well-known/oauth-protected-resource
 *   3.  Register   POST /ws/:id/oauth/register   (RFC 7591 dynamic client registration)
 *   4.  Authorize  GET  /ws/:id/oauth/authorize   (PKCE entry point → redirects to IdP)
 *   5.  Callback   GET  /ws/:id/oauth/callback    (IdP returns here; issues auth code for client)
 *   6.  Token      POST /ws/:id/oauth/token       (client exchanges auth code for hub token)
 *
 * User flow:
 *   Claude.ai → /authorize → enterprise IdP → /oauth/callback
 *     → (store idp_token in SQLite) → auth_code → Claude.ai redirect_uri
 *     → POST /oauth/token { code_verifier } → hub_token (stored in hub_sessions)
 *   Every subsequent MCP call: Authorization: Bearer hub_token
 *     → McpSessionManager verifies → looks up idp_token → injects into CMS calls
 */

import express           from 'express';
import { createHash }    from 'crypto';
import { OAuthStateStore } from '../db/OAuthStateStore.js';
import { UserTokenStore }  from '../db/UserTokenStore.js';
import { HubSessionStore } from '../db/HubSessionStore.js';

const stateStore  = new OAuthStateStore();
const userTokens  = new UserTokenStore();
const hubSessions = new HubSessionStore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
  return `${proto}://${req.headers.host}`;
}

/** Build AS metadata JSON for a workspace (used by multiple discovery paths). */
function asMetadata(req, workspace_id) {
  const base = `${baseUrl(req)}/ws/${workspace_id}`;
  return {
    issuer:                                 base,
    authorization_endpoint:                 `${base}/oauth/authorize`,
    token_endpoint:                         `${base}/oauth/token`,
    registration_endpoint:                  `${base}/oauth/register`,
    response_types_supported:               ['code'],
    grant_types_supported:                  ['authorization_code'],
    code_challenge_methods_supported:       ['S256'],
    token_endpoint_auth_methods_supported:  ['none'],
  };
}

function decodeIdToken(idToken) {
  if (!idToken) return null;
  try { return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()); }
  catch { return null; }
}

function extractSub(idToken)     { return decodeIdToken(idToken)?.sub ?? null; }
function extractProfile(idToken) {
  const p = decodeIdToken(idToken);
  if (!p) return {};
  return { email: p.email ?? null, name: p.name ?? p.preferred_username ?? null };
}

// ── Router factory ────────────────────────────────────────────────────────────

/**
 * @param {import('../workspaces/WorkspaceRegistry.js').WorkspaceRegistry} workspaceRegistry
 */
export function createOAuthRouter(workspaceRegistry) {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════════════════════════
  // DISCOVERY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ws/:workspace_id/.well-known/oauth-authorization-server   (workspace-scoped)
   * GET /.well-known/oauth-authorization-server/ws/:workspace_id   (RFC 8414 path-suffix)
   * GET /.well-known/oauth-authorization-server/ws/:workspace_id/mcp
   *
   * Claude.ai prefers the path-suffix form — the issuer is https://host/ws/:id, so
   * RFC 8414 §3.1 prepends /.well-known/oauth-authorization-server to the issuer path.
   */
  router.get('/ws/:workspace_id/.well-known/oauth-authorization-server', (req, res) => {
    res.json(asMetadata(req, req.params.workspace_id));
  });
  router.get('/.well-known/oauth-authorization-server/ws/:workspace_id', (req, res) => {
    res.json(asMetadata(req, req.params.workspace_id));
  });
  router.get('/.well-known/oauth-authorization-server/ws/:workspace_id/mcp', (req, res) => {
    res.json(asMetadata(req, req.params.workspace_id));
  });

  /**
   * GET /ws/:workspace_id/.well-known/openid-configuration         (workspace-scoped)
   * GET /.well-known/openid-configuration/ws/:workspace_id         (path-suffix)
   * GET /.well-known/openid-configuration/ws/:workspace_id/mcp
   *
   * Claude.ai also probes OIDC discovery endpoints. Return the same AS metadata so
   * it finds the authorization and token endpoints regardless of which path it uses.
   */
  router.get('/ws/:workspace_id/.well-known/openid-configuration', (req, res) => {
    res.json(asMetadata(req, req.params.workspace_id));
  });
  router.get('/.well-known/openid-configuration/ws/:workspace_id', (req, res) => {
    res.json(asMetadata(req, req.params.workspace_id));
  });
  router.get('/.well-known/openid-configuration/ws/:workspace_id/mcp', (req, res) => {
    res.json(asMetadata(req, req.params.workspace_id));
  });

  /**
   * GET /ws/:workspace_id/.well-known/oauth-protected-resource
   * Points the MCP client back at the correct Authorization Server.
   */
  router.get('/ws/:workspace_id/.well-known/oauth-protected-resource', (req, res) => {
    const base = `${baseUrl(req)}/ws/${req.params.workspace_id}`;
    res.json({
      resource:                    `${base}/mcp`,
      authorization_servers:       [base],
      bearer_methods_supported:    ['header'],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DYNAMIC CLIENT REGISTRATION  (RFC 7591)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Shared handler: accept any client, enforce security via IdP + PKCE. */
  function registerHandler(req, res) {
    const { redirect_uris = [], client_name } = req.body ?? {};
    res.status(201).json({
      client_id:                  redirect_uris[0] ?? 'public',
      client_name:                client_name ?? 'MCP Client',
      redirect_uris,
      grant_types:                ['authorization_code'],
      response_types:             ['code'],
      token_endpoint_auth_method: 'none',
    });
  }

  /**
   * POST /ws/:workspace_id/oauth/register   (workspace-scoped — advertised in AS metadata)
   * POST /register                           (global fallback — Claude.ai hits this when AS
   *                                           discovery fails and it can't find registration_endpoint)
   */
  router.post('/ws/:workspace_id/oauth/register', express.json(), registerHandler);
  router.post('/register', express.json(), registerHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORIZE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ws/:workspace_id/oauth/authorize
   * Entry point for Claude.ai's PKCE flow.
   * Saves PKCE params, then bounces the user to the enterprise IdP.
   */
  router.get('/ws/:workspace_id/oauth/authorize', async (req, res) => {
    const { workspace_id } = req.params;
    const {
      response_type,
      redirect_uri,
      code_challenge,
      code_challenge_method = 'S256',
      state: client_state,
      client_id,
      scope,
    } = req.query;

    if (response_type !== 'code')
      return res.status(400).json({ error: 'unsupported_response_type' });
    if (!code_challenge)
      return res.status(400).json({ error: 'invalid_request', error_description: 'code_challenge required (PKCE S256)' });

    const config = await workspaceRegistry.getConfig(workspace_id);
    if (!config?.idp?.authorize_url) {
      return res.status(400).send(
        '<h2>IdP not configured</h2>' +
        '<p>Ask the workspace admin to configure SSO under Settings → Identity Provider.</p>'
      );
    }

    const hub_state = stateStore.createState(workspace_id, {
      client_state, code_challenge, code_challenge_method, redirect_uri, client_id,
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     config.idp.client_id,
      redirect_uri:  `${baseUrl(req)}/ws/${workspace_id}/oauth/callback`,
      scope:         scope ?? config.idp.scope ?? 'openid profile email',
      state:         hub_state,
    });

    res.redirect(`${config.idp.authorize_url}?${params}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACK  (unified — handles both admin test and per-user Claude.ai flows)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ws/:workspace_id/oauth/callback
   * Single redirect URI registered with the IdP for this workspace.
   *
   * Branches on is_admin_test (set when the admin clicks "Test IdP"):
   *   admin test  → decodes IDP response, stores result in memory, redirects dashboard popup
   *   per-user    → stores IdP token in SQLite, issues auth code, redirects to Claude.ai
   */
  router.get('/ws/:workspace_id/oauth/callback', async (req, res) => {
    const { workspace_id }      = req.params;
    const { code: idp_code, state: hub_state, error } = req.query;

    if (error) return res.status(400).send(`<p>IdP error: <strong>${error}</strong></p>`);

    const pending = stateStore.consumeState(hub_state);
    if (!pending)
      return res.status(400).send('<p>Invalid or expired OAuth state. Close this window and try again.</p>');

    const config = await workspaceRegistry.getConfig(workspace_id);
    if (!config?.idp) return res.status(400).send('<p>IdP not configured</p>');

    try {
      // Exchange code with enterprise IdP
      const tokenRes = await fetch(config.idp.token_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          code:          idp_code,
          redirect_uri:  `${baseUrl(req)}/ws/${workspace_id}/oauth/callback`,
          client_id:     config.idp.client_id,
          client_secret: config.idp.client_secret,
        }),
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        throw new Error(`IdP token exchange failed (${tokenRes.status}): ${body}`);
      }
      const tokens = await tokenRes.json();
      if (tokens.error) throw new Error(tokens.error_description ?? tokens.error);

      const sub     = extractSub(tokens.id_token) ?? tokens.sub;
      const profile = extractProfile(tokens.id_token);
      const claims  = decodeIdToken(tokens.id_token) ?? {};

      // ── Admin test flow: show result, do NOT store token ─────────────────
      if (pending.is_admin_test) {
        const result = {
          success:    true,
          identity:   { sub: sub ?? '(not returned)', ...profile },
          token_info: {
            type:              tokens.token_type  ?? 'Bearer',
            expires_in:        tokens.expires_in  ?? null,
            scope:             tokens.scope       ?? null,
            has_refresh_token: !!tokens.refresh_token,
            has_id_token:      !!tokens.id_token,
            access_token_preview: tokens.access_token
              ? tokens.access_token.slice(0, 28) + '…'
              : null,
          },
          claims,
        };
        const result_id = stateStore.storeTestResult(result);
        return res.redirect(`/ws/${workspace_id}/ui?idp_test=${result_id}`);
      }

      // ── Per-user flow: store token, issue auth code for Claude.ai ─────────
      if (!sub) throw new Error('IdP did not return a subject (sub) claim');

      userTokens.upsertUser(workspace_id, { sub, ...profile });
      userTokens.storeToken(workspace_id, sub, {
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
        token_type:    tokens.token_type ?? 'Bearer',
      });

      const auth_code = stateStore.createCode(workspace_id, sub, {
        code_challenge: pending.code_challenge,
        redirect_uri:   pending.redirect_uri,
      });

      const redirectParams = new URLSearchParams({ code: auth_code });
      if (pending.client_state) redirectParams.set('state', pending.client_state);
      res.redirect(`${pending.redirect_uri}?${redirectParams}`);

    } catch (err) {
      const errParam = encodeURIComponent(err.message);
      // Admin test error: redirect popup to dashboard with error
      if (pending.is_admin_test)
        return res.redirect(`/ws/${workspace_id}/ui?idp_test_error=${errParam}`);
      res.status(500).send(`<p>OAuth error: <strong>${err.message}</strong></p>`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN ENDPOINT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /ws/:workspace_id/oauth/token
   * Claude.ai exchanges its auth code (+ PKCE code_verifier) for a hub bearer token.
   */
  router.post(
    '/ws/:workspace_id/oauth/token',
    express.urlencoded({ extended: false }),
    express.json(),
    (req, res) => {
      const { grant_type, code, code_verifier, redirect_uri } = req.body;

      if (grant_type !== 'authorization_code')
        return res.status(400).json({ error: 'unsupported_grant_type' });
      if (!code)
        return res.status(400).json({ error: 'invalid_request', error_description: 'code required' });

      const pending = stateStore.consumeCode(code);
      if (!pending)
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Code not found or expired' });

      // Verify PKCE — code_challenge must equal BASE64URL(SHA256(code_verifier))
      if (pending.code_challenge) {
        if (!code_verifier)
          return res.status(400).json({ error: 'invalid_request', error_description: 'code_verifier required' });
        const derived = createHash('sha256').update(code_verifier).digest('base64url');
        if (derived !== pending.code_challenge)
          return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      }

      // Issue hub bearer token
      const { token, expires_at } = hubSessions.issue(pending.workspace_id, pending.sub);
      res.json({
        access_token: token,
        token_type:   'Bearer',
        expires_in:   Math.floor((expires_at - Date.now()) / 1000),
      });
    }
  );

  return router;
}

// Re-export stores so McpSessionManager and routes.js can import from one place
export { userTokens, hubSessions, stateStore };
