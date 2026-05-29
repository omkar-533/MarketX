import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { fyersModel } from 'fyers-api-v3';
import { sanitizeEnvValue, maskAppId, computeFyersAppIdHash } from '../utils/fyersHash.mjs';
import {
  exchangeAuthCodeWithFyers,
  refreshAccessTokenWithFyers,
} from '../utils/fyersTokenExchange.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tokenPath = resolve(root, 'data', 'fyers-token.json');
const logPath = resolve(root, 'data', 'fyers-logs');

let client = null;
let accessToken = '';
let refreshToken = '';
let refreshInFlight = null;

function ensureDirs() {
  const dir = dirname(tokenPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(logPath)) mkdirSync(logPath, { recursive: true });
}

function loadTokenRecordFromFile() {
  try {
    if (!existsSync(tokenPath)) return {};
    const raw = JSON.parse(readFileSync(tokenPath, 'utf8'));
    return {
      accessToken: String(raw.access_token || raw.accessToken || '').trim(),
      refreshToken: String(raw.refresh_token || raw.refreshToken || '').trim(),
      updatedAt: String(raw.updatedAt || '').trim(),
    };
  } catch {
    return {};
  }
}

function saveTokenToFile({ accessToken: at, refreshToken: rt }) {
  ensureDirs();
  writeFileSync(
    tokenPath,
    JSON.stringify(
      {
        access_token: String(at || '').trim(),
        refresh_token: String(rt || '').trim(),
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
}

export function getFyersConfig() {
  const appId =
    sanitizeEnvValue(process.env.FYERS_APP_ID) ||
    sanitizeEnvValue(process.env.FYERS_CLIENT_ID) ||
    '';
  const secret = sanitizeEnvValue(process.env.FYERS_SECRET_KEY) || '';
  const frontend =
    process.env.FRONTEND_URL?.trim() ||
    process.env.VITE_DEV_URL?.trim() ||
    'http://localhost:5173';
  const redirect =
    process.env.FYERS_REDIRECT_URI?.trim() ||
    `${frontend.replace(/\/$/, '')}/fyers-login`;
  return { appId, secret, redirect };
}

export function isFyersConfigured() {
  const { appId } = getFyersConfig();
  return Boolean(appId && getFyersAccessToken());
}

export function getFyersAccessToken() {
  const file = loadTokenRecordFromFile();
  return (
    process.env.FYERS_ACCESS_TOKEN?.trim() ||
    accessToken ||
    file.accessToken ||
    ''
  );
}

export function getFyersRefreshToken() {
  const file = loadTokenRecordFromFile();
  return (
    sanitizeEnvValue(process.env.FYERS_REFRESH_TOKEN) ||
    refreshToken ||
    file.refreshToken ||
    ''
  );
}

export function setFyersTokens({ accessToken: at, refreshToken: rt }) {
  accessToken = String(at || '').trim();
  refreshToken = String(rt || '').trim();

  if (accessToken) process.env.FYERS_ACCESS_TOKEN = accessToken;
  else delete process.env.FYERS_ACCESS_TOKEN;

  if (refreshToken) process.env.FYERS_REFRESH_TOKEN = refreshToken;

  if (accessToken || refreshToken) {
    saveTokenToFile({ accessToken, refreshToken });
  } else {
    delete process.env.FYERS_REFRESH_TOKEN;
    try {
      if (existsSync(tokenPath)) writeFileSync(tokenPath, '{}', 'utf8');
    } catch {
      /* ignore */
    }
  }
  client = null;
}

export function setFyersAccessToken(token) {
  const currentRefresh = getFyersRefreshToken();
  setFyersTokens({
    accessToken: String(token || '').trim(),
    refreshToken: currentRefresh,
  });
}

export function clearFyersAccessToken() {
  setFyersTokens({ accessToken: '', refreshToken: '' });
}

/** Validate token before opening WebSocket */
export async function validateFyersToken() {
  if (!isFyersConfigured()) return false;
  try {
    const api = getFyersClient();
    const res = await api.get_profile();
    return res?.s === 'ok';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (/invalid|unauthorized|401|403|expired|token/i.test(msg)) {
      const refreshed = await refreshFyersAccessToken('validate_profile');
      if (!refreshed) return false;
      try {
        const api = getFyersClient();
        const res = await api.get_profile();
        return res?.s === 'ok';
      } catch {
        return false;
      }
    }
    return true;
  }
}

export function getFyersClient() {
  const { appId, redirect } = getFyersConfig();
  const token = getFyersAccessToken();
  if (!appId || !token) {
    throw new Error('TradeX Live not configured — connect in Profile');
  }

  if (!client) {
    ensureDirs();
    client = new fyersModel({ path: logPath, enableLogging: false });
    client.setAppId(appId);
    client.setRedirectUrl(redirect);
    client.setAccessToken(token);
  }
  return client;
}

export function generateFyersAuthUrl(options = {}) {
  const { appId, redirect } = getFyersConfig();
  if (!appId) throw new Error('Live data configuration missing');
  ensureDirs();
  const tmp = new fyersModel({ path: logPath, enableLogging: false });
  tmp.setAppId(appId);
  tmp.setRedirectUrl(redirect);
  let url = tmp.generateAuthCode();
  const forceLogin = options.forceLogin !== false;
  if (forceLogin) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}force_login=true`;
  }
  return url;
}

function assertValidAuthCodeInput(authCode) {
  const c = String(authCode || '').trim();
  if (!c) throw new Error('auth_code required');
  if (/^https?:\/\//i.test(c) && !/auth_code=/i.test(c)) {
    throw new Error(
      'Redirect URL mat paste karein. Login ke baad address bar ki URL jisme auth_code=eyJ... ho, woh copy karein.',
    );
  }
  let code = c;
  const m = c.match(/[?&#]auth_code=([^&#]+)/i);
  if (m) code = decodeURIComponent(m[1]).trim();
  const stateIdx = code.indexOf('&state=');
  if (stateIdx > 0 && /^eyJ/i.test(code)) code = code.slice(0, stateIdx);
  if (code.includes('/api/fyers/callback') && !/^eyJ/i.test(code)) {
    throw new Error('Yeh callback URL hai, login code nahi. TradeX login dubara karein.');
  }
  if (code.length < 40) {
    throw new Error('Login code bahut chhota hai — naya code login se lein (ek baar use hota hai).');
  }
  return code;
}

export async function exchangeFyersAuthCode(authCode) {
  const { appId, secret } = getFyersConfig();
  if (!appId || !secret) throw new Error('FYERS_APP_ID and FYERS_SECRET_KEY required');
  const code = assertValidAuthCodeInput(authCode);
  const res = await exchangeAuthCodeWithFyers({ appId, secret, authCode: code });
  setFyersTokens({
    accessToken: res.access_token,
    refreshToken: res.refresh_token || getFyersRefreshToken(),
  });
  return res;
}

export async function refreshFyersAccessToken(reason = 'manual') {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { appId, secret } = getFyersConfig();
      const rt = getFyersRefreshToken();
      const pin = sanitizeEnvValue(process.env.FYERS_PIN);
      if (!appId || !secret || !rt || !pin) return false;
      const res = await refreshAccessTokenWithFyers({
        appId,
        secret,
        refreshToken: rt,
        pin,
      });
      setFyersTokens({
        accessToken: res.access_token,
        refreshToken: res.refresh_token || rt,
      });
      console.log(`[FyersAuth] Access token refreshed (${reason})`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? '');
      console.warn(`[FyersAuth] Auto-refresh failed (${reason}):`, msg);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Safe config check — never exposes secret */
export function getFyersConfigDiagnostics() {
  const { appId, secret, redirect } = getFyersConfig();
  const rt = getFyersRefreshToken();
  const pin = sanitizeEnvValue(process.env.FYERS_PIN);
  const tok = loadTokenRecordFromFile();
  return {
    appId: maskAppId(appId),
    appIdFormatOk: Boolean(appId && appId.endsWith('-100')),
    secretConfigured: secret.length > 0,
    secretLength: secret.length,
    refreshTokenConfigured: rt.length > 0,
    refreshTokenLength: rt.length,
    pinConfigured: pin.length > 0,
    tokenUpdatedAt: tok.updatedAt || '',
    redirectUri: redirect,
    hashPrefix: appId && secret ? computeFyersAppIdHash(appId, secret).slice(0, 12) : '',
  };
}

export function getFyersSocketAuth() {
  const { appId } = getFyersConfig();
  const token = getFyersAccessToken();
  if (!appId || !token) return null;
  return `${appId}:${token}`;
}
