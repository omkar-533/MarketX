#!/usr/bin/env node

/**
 * Sync local FYERS credentials/tokens to Render service env vars,
 * then trigger a deploy.
 *
 * Required env:
 * - RENDER_API_KEY
 * - RENDER_SERVICE_ID
 *
 * Optional env (otherwise taken from .env.local / token file):
 * - FYERS_APP_ID
 * - FYERS_SECRET_KEY
 * - FYERS_REDIRECT_URI
 * - FYERS_ACCESS_TOKEN
 * - FYERS_REFRESH_TOKEN
 * - FYERS_PIN
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadServerEnv } from '../server/loadEnv.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokenPath = resolve(root, 'data', 'fyers-token.json');
const API_BASE = 'https://api.render.com/v1';
const DEFAULT_RENDER_SERVICE_ID = 'srv-d8bverojs32c73820ms0';

loadServerEnv();

function fail(msg) {
  console.error(`\n[render-sync] ${msg}\n`);
  process.exit(1);
}

function readTokenFile() {
  if (!existsSync(tokenPath)) return {};
  try {
    return JSON.parse(readFileSync(tokenPath, 'utf8'));
  } catch {
    return {};
  }
}

function trim(v) {
  return String(v || '').trim();
}

function mask(v) {
  const s = trim(v);
  if (!s) return '(empty)';
  if (s.length <= 10) return `${s[0]}***${s[s.length - 1]}`;
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}

function toBaseUrl(v) {
  return trim(v).replace(/\/$/, '');
}

function isLocalUrl(v) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(trim(v));
}

function uniqueCsv(values) {
  const uniq = [];
  for (const v of values) {
    const parts = String(v || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      if (!uniq.includes(p)) uniq.push(p);
    }
  }
  return uniq.join(',');
}

function pickRemoteUrl(...candidates) {
  const normalized = candidates.map((v) => toBaseUrl(v)).filter(Boolean);
  const remote = normalized.find((v) => !isLocalUrl(v));
  return remote || normalized[0] || '';
}

function splitCsv(values) {
  const out = [];
  for (const v of values) {
    const parts = String(v || '')
      .split(',')
      .map((s) => toBaseUrl(s))
      .filter(Boolean);
    out.push(...parts);
  }
  return out;
}

function pickFrontendUrl({ envFrontend, existingFrontend, corsOrigins, serviceUrl }) {
  const fromCors = splitCsv([corsOrigins]).filter((u) => !isLocalUrl(u) && u !== serviceUrl);
  const direct = [envFrontend, existingFrontend]
    .map((u) => toBaseUrl(u))
    .filter((u) => u && !isLocalUrl(u) && u !== serviceUrl);
  return direct[0] || fromCors[0] || pickRemoteUrl(serviceUrl);
}

async function request(path, init = {}) {
  const apiKey = trim(process.env.RENDER_API_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
  });
  if (res.ok) return res;
  const body = await res.text().catch(() => '');
  throw new Error(
    `Render API ${res.status} ${res.statusText} on ${path}\n${body.slice(0, 400)}`,
  );
}

async function getService(serviceId) {
  const res = await request(`/services/${serviceId}`);
  return res.json();
}

async function listEnvVars(serviceId) {
  const res = await request(`/services/${serviceId}/env-vars`);
  return res.json();
}

function toEnvMap(list) {
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const rec = item?.envVar || item || {};
    const key = trim(rec.key);
    if (!key) continue;
    map.set(key, trim(rec.value));
  }
  return map;
}

async function setEnvVar(serviceId, key, value) {
  await request(`/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
}

async function triggerDeploy(serviceId) {
  await request(`/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
}

async function main() {
  const serviceId = trim(process.env.RENDER_SERVICE_ID) || DEFAULT_RENDER_SERVICE_ID;
  const apiKey = trim(process.env.RENDER_API_KEY);
  if (!apiKey) fail('RENDER_API_KEY missing');

  const service = await getService(serviceId);
  const serviceUrl = toBaseUrl(
    service?.serviceDetails?.url || service?.service?.url || service?.url || '',
  );
  const envMap = toEnvMap(await listEnvVars(serviceId));
  const existing = (k) => trim(envMap.get(k));

  const file = readTokenFile();
  const seedCorsOrigins = process.env.CORS_ORIGINS || existing('CORS_ORIGINS');
  const frontendUrl = pickFrontendUrl({
    envFrontend: process.env.FRONTEND_URL,
    existingFrontend: existing('FRONTEND_URL'),
    corsOrigins: seedCorsOrigins,
    serviceUrl,
  });
  const apiPublicUrl = pickRemoteUrl(
    process.env.API_PUBLIC_URL,
    existing('API_PUBLIC_URL'),
    serviceUrl,
  );
  const requestedRedirect = toBaseUrl(
    process.env.FYERS_REDIRECT_URI || existing('FYERS_REDIRECT_URI'),
  );
  const redirectBase = apiPublicUrl || serviceUrl || frontendUrl;
  if (!redirectBase) fail('Could not derive Render service URL for FYERS_REDIRECT_URI');

  const safeRedirect =
    requestedRedirect && !isLocalUrl(requestedRedirect)
      ? requestedRedirect
      : `${redirectBase}/api/auth/fyers/callback`;

  const vars = {
    FRONTEND_URL: frontendUrl,
    API_PUBLIC_URL: apiPublicUrl,
    CORS_ORIGINS: uniqueCsv([
      seedCorsOrigins,
      frontendUrl,
      apiPublicUrl || serviceUrl,
      'http://localhost:5173',
    ]),
    FYERS_APP_ID: trim(process.env.FYERS_APP_ID || existing('FYERS_APP_ID')),
    FYERS_SECRET_KEY: trim(process.env.FYERS_SECRET_KEY || existing('FYERS_SECRET_KEY')),
    FYERS_REDIRECT_URI: safeRedirect,
    FYERS_ACCESS_TOKEN: trim(
      process.env.FYERS_ACCESS_TOKEN ||
        file.access_token ||
        file.accessToken ||
        existing('FYERS_ACCESS_TOKEN'),
    ),
    FYERS_REFRESH_TOKEN: trim(
      process.env.FYERS_REFRESH_TOKEN ||
        file.refresh_token ||
        file.refreshToken ||
        existing('FYERS_REFRESH_TOKEN'),
    ),
    FYERS_PIN: trim(process.env.FYERS_PIN || existing('FYERS_PIN')),
  };

  if (!vars.FYERS_APP_ID) fail('FYERS_APP_ID missing');
  if (!vars.FYERS_SECRET_KEY) fail('FYERS_SECRET_KEY missing');
  if (!vars.FYERS_ACCESS_TOKEN) fail('FYERS_ACCESS_TOKEN missing (run local connect first)');
  if (vars.FYERS_SECRET_KEY.length < 16) {
    console.warn(
      '[render-sync] WARNING: FYERS_SECRET_KEY looks short. Use full App Secret (not Secret ID).',
    );
  }

  const entries = Object.entries(vars).filter(([, v]) => Boolean(v));

  console.log('\n[render-sync] Updating env vars on Render…');
  for (const [k, v] of entries) {
    await setEnvVar(serviceId, k, v);
    console.log(`[render-sync] set ${k} = ${mask(v)}`);
  }

  console.log('\n[render-sync] Triggering deploy…');
  await triggerDeploy(serviceId);
  console.log('[render-sync] Deploy triggered successfully.\n');
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));

