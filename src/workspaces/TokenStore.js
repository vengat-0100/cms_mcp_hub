/**
 * TokenStore — AES-256-GCM encryption + HMAC session signing
 * All secrets encrypted at rest. Key sourced from ENCRYPTION_KEY env var.
 */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

let _key = null;
function getKey() {
  if (_key) return _key;
  const k = process.env.ENCRYPTION_KEY;
  if (k && k.length >= 64) {
    _key = Buffer.from(k.slice(0, 64), 'hex');
  } else {
    console.warn('\x1b[33m[warn]\x1b[0m ENCRYPTION_KEY not set — using insecure dev key. Set a 32-byte hex key in production.');
    _key = crypto.scryptSync('cms-mcp-hub-dev-key', 'cms-salt-v1', 32);
  }
  return _key;
}

export function encrypt(text) {
  const key = getKey();
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv:   iv.toString('hex'),
    tag:  tag.toString('hex'),
    data: enc.toString('hex'),
  });
}

export function decrypt(payload) {
  const key = getKey();
  const { iv, tag, data } = JSON.parse(payload);
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
}

/** Create a signed session token (no external JWT library needed) */
export function signSession(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', getKey()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Verify and decode a session token — throws on invalid/expired */
export function verifySession(token) {
  const [data, sig] = token.split('.');
  if (!data || !sig) throw new Error('Malformed token');
  const expected = crypto.createHmac('sha256', getKey()).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
  if (Date.now() > payload.exp) throw new Error('Token expired');
  return payload;
}

/** Generate a secure random key (run once, store as ENCRYPTION_KEY env var) */
export function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}
