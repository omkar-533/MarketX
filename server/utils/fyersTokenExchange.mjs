import { computeFyersAppIdHash, sanitizeEnvValue } from './fyersHash.mjs';

const VALIDATE_URL = 'https://api-t1.fyers.in/api/v3/validate-authcode';

/**
 * Exchange auth_code → access_token (direct Fyers API — same hash as official SDK).
 */
export async function exchangeAuthCodeWithFyers({ appId, secret, authCode }) {
  const clientId = sanitizeEnvValue(appId);
  const secretKey = sanitizeEnvValue(secret);
  const code = sanitizeEnvValue(authCode);

  if (!clientId || !secretKey) {
    throw new Error('FYERS_APP_ID and FYERS_SECRET_KEY required in .env.local');
  }
  if (!clientId.endsWith('-100')) {
    throw new Error(
      `FYERS_APP_ID should end with -100 (e.g. 6CYYFW4796-100). Current: ${clientId}`,
    );
  }
  if (secretKey.length < 6) {
    throw new Error('FYERS_SECRET_KEY too short — copy full App Secret from Fyers dashboard');
  }

  const appIdHash = computeFyersAppIdHash(clientId, secretKey);

  const res = await fetch(VALIDATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      appIdHash,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (data?.s === 'ok' && data?.access_token) {
    return data;
  }

  const msg = String(data?.message || data?.error || res.statusText || 'Token exchange failed');

  if (/invalid app id hash/i.test(msg)) {
    throw new Error(
      'invalid app id hash — FYERS_SECRET_KEY is wrong. Open https://myapi.fyers.in/dashboard → your app → copy App Secret exactly into .env.local (no quotes/spaces). Regenerate secret if needed. Then restart server and get a NEW auth_code.',
    );
  }
  if (/invalid auth/i.test(msg)) {
    throw new Error(
      `${msg} — Generate a fresh auth_code: /fyers-login → Open Fyers Login (old codes are one-time use).`,
    );
  }

  throw new Error(msg);
}
