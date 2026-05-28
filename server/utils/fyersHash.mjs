import crypto from 'crypto';

/** Remove quotes, BOM, stray whitespace from .env values */
export function sanitizeEnvValue(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

/** Fyers v3: SHA-256 of `APP_ID-100:SECRET` (e.g. 6CYYFW4796-100:your_secret) */
export function computeFyersAppIdHash(appId, secret) {
  const id = sanitizeEnvValue(appId);
  const sec = sanitizeEnvValue(secret);
  if (!id || !sec) return '';
  return crypto.createHash('sha256').update(`${id}:${sec}`).digest('hex');
}

export function maskAppId(appId) {
  const id = sanitizeEnvValue(appId);
  if (id.length <= 8) return '***';
  return `${id.slice(0, 4)}***${id.slice(-5)}`;
}
