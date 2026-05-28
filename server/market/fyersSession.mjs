import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { fyersModel } from 'fyers-api-v3';
import { sanitizeEnvValue, maskAppId, computeFyersAppIdHash } from '../utils/fyersHash.mjs';
import { exchangeAuthCodeWithFyers } from '../utils/fyersTokenExchange.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tokenPath = resolve(root, 'data', 'fyers-token.json');
const logPath = resolve(root, 'data', 'fyers-logs');

let client = null;
let accessToken = '';

function ensureDirs() {
  const dir = dirname(tokenPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(logPath)) mkdirSync(logPath, { recursive: true });
}

function loadTokenFromFile() {
  try {
    if (!existsSync(tokenPath)) return '';
    const raw = JSON.parse(readFileSync(tokenPath, 'utf8'));
    return String(raw.access_token || raw.accessToken || '').trim();
  } catch {
    return '';
  }
}

function saveTokenToFile(token) {
  ensureDirs();
  writeFileSync(
    tokenPath,
    JSON.stringify({ access_token: token, updatedAt: new Date().toISOString() }, null, 2),
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
  return (
    process.env.FYERS_ACCESS_TOKEN?.trim() ||
    accessToken ||
    loadTokenFromFile() ||
    ''
  );
}

export function setFyersAccessToken(token) {
  accessToken = String(token || '').trim();
  if (accessToken) {
    process.env.FYERS_ACCESS_TOKEN = accessToken;
    saveTokenToFile(accessToken);
  } else {
    delete process.env.FYERS_ACCESS_TOKEN;
    try {
      if (existsSync(tokenPath)) writeFileSync(tokenPath, '{}', 'utf8');
    } catch {
      /* ignore */
    }
  }
  client = null;
}

export function clearFyersAccessToken() {
  setFyersAccessToken('');
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
    if (/invalid|unauthorized|401|403|expired|token/i.test(msg)) return false;
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
  setFyersAccessToken(res.access_token);
  return res;
}

/** Safe config check — never exposes secret */
export function getFyersConfigDiagnostics() {
  const { appId, secret, redirect } = getFyersConfig();
  return {
    appId: maskAppId(appId),
    appIdFormatOk: Boolean(appId && appId.endsWith('-100')),
    secretConfigured: secret.length > 0,
    secretLength: secret.length,
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
