/**
 * OAuthManager — Authorization Code flow (configurable IdP per workspace)
 * Phase 2: service-account token stored as '_service' per workspace.
 */

import crypto from 'crypto';

export class OAuthManager {
  constructor() {
    /** @type {Map<string, {workspace_id: string, expires: number}>} */
    this._pending = new Map();
  }

  // ── Start OAuth flow ───────────────────────────────────────────────────────

  buildStartUrl(workspace_id, idp, baseUrl) {
    const state = crypto.randomBytes(20).toString('hex');
    this._pending.set(state, {
      workspace_id,
      expires: Date.now() + 10 * 60 * 1000,  // 10-minute window
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     idp.client_id,
      redirect_uri:  this._redirectUri(baseUrl, workspace_id),
      scope:         idp.scope || 'openid profile email',
      state,
    });

    return `${idp.authorize_url}?${params}`;
  }

  // ── Handle callback ────────────────────────────────────────────────────────

  async handleCallback(code, state, workspaceRegistry, baseUrl) {
    const pending = this._pending.get(state);
    if (!pending || Date.now() > pending.expires) {
      throw new Error('Invalid or expired OAuth state — please try again');
    }
    this._pending.delete(state);

    const { workspace_id } = pending;
    const config = await workspaceRegistry.getConfig(workspace_id);
    if (!config?.idp) throw new Error('IdP not configured for this workspace');

    const tokens = await this._exchangeCode(code, config.idp, baseUrl, workspace_id);
    const sub    = extractSub(tokens.id_token) ?? '_service';

    await workspaceRegistry.saveToken(workspace_id, '_service', {
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
      token_type:    tokens.token_type ?? 'Bearer',
      sub,
    });

    return workspace_id;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _redirectUri(baseUrl, workspace_id) {
    return `${baseUrl}/ws/${workspace_id}/auth/callback`;
  }

  async _exchangeCode(code, idp, baseUrl, workspace_id) {
    const res = await fetch(idp.token_url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: this._redirectUri(baseUrl, workspace_id),
        client_id:    idp.client_id,
        client_secret: idp.client_secret,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Token exchange failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error_description ?? data.error);
    return data;
  }
}

function extractSub(idToken) {
  if (!idToken) return null;
  try {
    const payload = idToken.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).sub ?? null;
  } catch { return null; }
}
