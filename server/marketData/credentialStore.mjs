/**
 * BrokerCredentialService — encrypted at-rest credential shell.
 * Never stores passwords / OTP / TOTP secrets.
 * Never returns raw tokens to API clients.
 */
import { randomUUID } from 'crypto';
import { encryptPineSource, decryptPineSource } from '../auth/pineCrypto.mjs';

/** @typedef {{
 *  id: string,
 *  userKey: string,
 *  provider: string,
 *  status: 'DISCONNECTED'|'CONNECTING'|'CONNECTED'|'EXPIRED'|'ERROR',
 *  encryptedCredential: string,
 *  expiresAt: number|null,
 *  capabilities: object,
 *  mode: 'DEMO'|'LIVE',
 *  createdAt: number,
 *  updatedAt: number,
 * }} MarketDataConnectionRecord */

/** @type {Map<string, MarketDataConnectionRecord>} */
const byUser = new Map();

function now() {
  return Date.now();
}

export function storeCredential({
  userKey,
  provider,
  credentialPayload,
  expiresAt = null,
  capabilities = {},
  mode = 'DEMO',
  status = 'CONNECTED',
  permissionNote = null,
}) {
  // Credential payload is opaque JSON — typically { kind:'demo' } or { kind:'indstocks', accessToken }.
  // Never log credentialPayload.
  const encryptedCredential = encryptPineSource(
    typeof credentialPayload === 'string'
      ? credentialPayload
      : JSON.stringify(credentialPayload ?? { kind: 'demo' }),
  );
  const existing = byUser.get(userKey);
  const record = {
    id: existing?.id || randomUUID(),
    userKey,
    provider,
    status,
    encryptedCredential,
    expiresAt,
    capabilities: {
      ...capabilities,
      orderExecution: false,
    },
    mode,
    permissionNote,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  byUser.set(userKey, record);
  return publicView(record);
}

export function getCredential(userKey) {
  const record = byUser.get(userKey);
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < now()) {
    record.status = 'EXPIRED';
    byUser.set(userKey, record);
  }
  return record;
}

/** Internal only — never call from HTTP handlers that serialize to clients. */
export function readDecryptedCredential(userKey) {
  const record = getCredential(userKey);
  if (!record?.encryptedCredential) return null;
  const plain = decryptPineSource(record.encryptedCredential);
  try {
    return JSON.parse(plain);
  } catch {
    return { raw: '[opaque]' };
  }
}

export function isCredentialValid(userKey) {
  const record = getCredential(userKey);
  if (!record) return false;
  if (record.status !== 'CONNECTED') return false;
  if (record.expiresAt && record.expiresAt < now()) return false;
  return true;
}

export function refreshCredential(userKey) {
  const record = getCredential(userKey);
  if (!record) return null;
  // Real brokers: refresh token exchange happens here. Demo: bump updatedAt.
  record.updatedAt = now();
  record.status = 'CONNECTED';
  byUser.set(userKey, record);
  return publicView(record);
}

export function deleteCredential(userKey) {
  byUser.delete(userKey);
  return true;
}

export function publicView(record) {
  if (!record) {
    return {
      status: 'DISCONNECTED',
      providerId: null,
      providerName: null,
      mode: null,
      historical: false,
      liveQuotes: false,
      orderAccess: 'NOT ENABLED',
      message: 'MARKET DATA DISCONNECTED',
    };
  }
  const historical = Boolean(record.capabilities?.historicalCandles);
  const liveQuotes = Boolean(record.capabilities?.liveQuotes);
  const connected = record.status === 'CONNECTED';
  return {
    status: record.status,
    providerId: record.provider,
    providerName:
      record.provider === 'mock-demo'
        ? 'Demo Market Data'
        : record.provider === 'indstocks'
          ? 'INDstocks (INDMoney)'
          : record.provider,
    mode: record.mode,
    historical,
    liveQuotes,
    orderAccess: 'NOT ENABLED',
    permissionNote: record.permissionNote || null,
    message: connected
      ? record.mode === 'DEMO'
        ? 'DEMO MARKET DATA'
        : 'MARKET DATA CONNECTED'
      : record.status === 'EXPIRED'
        ? 'Market data connection expired. Reconnect your broker.'
        : 'MARKET DATA DISCONNECTED',
    // Intentionally omit encryptedCredential / tokens
  };
}
