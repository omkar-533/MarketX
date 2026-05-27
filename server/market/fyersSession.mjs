import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { fyersModel } from 'fyers-api-v3';

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
  const appId = process.env.FYERS_APP_ID?.trim() || '';
  const secret = process.env.FYERS_SECRET_KEY?.trim() || '';
  const redirect = process.env.FYERS_REDIRECT_URI?.trim() || 'http://127.0.0.1:5000/api/fyers/callback';
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
    throw new Error('Fyers not configured — set FYERS_APP_ID and connect via /api/fyers/login-url');
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

export function generateFyersAuthUrl() {
  const { appId, redirect } = getFyersConfig();
  if (!appId) throw new Error('FYERS_APP_ID missing in .env.local');
  ensureDirs();
  const tmp = new fyersModel({ path: logPath, enableLogging: false });
  tmp.setAppId(appId);
  tmp.setRedirectUrl(redirect);
  return tmp.generateAuthCode();
}

export async function exchangeFyersAuthCode(authCode) {
  const { appId, secret } = getFyersConfig();
  if (!appId || !secret) throw new Error('FYERS_APP_ID and FYERS_SECRET_KEY required');
  const tmp = new fyersModel({ path: logPath, enableLogging: false });
  tmp.setAppId(appId);
  const res = await tmp.generate_access_token({
    client_id: appId,
    secret_key: secret,
    auth_code: String(authCode || '').trim(),
  });
  if (res?.s !== 'ok' || !res?.access_token) {
    throw new Error(res?.message || 'Fyers token exchange failed');
  }
  setFyersAccessToken(res.access_token);
  return res;
}

export function getFyersSocketAuth() {
  const { appId } = getFyersConfig();
  const token = getFyersAccessToken();
  if (!appId || !token) return null;
  return `${appId}:${token}`;
}
