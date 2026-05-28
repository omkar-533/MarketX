/**
 * Centralized FYERS WebSocket manager — single upstream connection, production reconnect + health.
 */
import { fyersDataSocket } from 'fyers-api-v3';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { fromFyersSymbol, toFyersSymbol } from './fyersSymbolMap.mjs';
import {
  clearFyersAccessToken,
  getFyersAccessToken,
  getFyersSocketAuth,
  isFyersConfigured,
  validateFyersToken,
} from './fyersSession.mjs';
import {
  getQuoteMetaSnapshot,
  mergeTickIntoMeta,
  updateCandleFromTick,
} from './quoteMeta.mjs';
import { createBackoffScheduler } from './wsBackoff.mjs';
import { isNseFnoMarketOpen } from './marketHours.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const logPath = resolve(root, 'data', 'fyers-logs');

const CHUNK_SIZE = 50;
const HEARTBEAT_MS = 25_000;
const STALE_TICK_MS = 120_000;

const pendingSymbols = new Set();
const subscribedFyers = new Set();
const symbolRefCount = new Map();
const tickListeners = new Set();
const statusListeners = new Set();

let socket = null;
let connecting = false;
let intentionalClose = false;
let hasTicks = false;
let lastTickAt = 0;
let lastMessageAt = 0;
let heartbeatTimer = null;
let staleCheckTimer = null;
let connectTimeoutTimer = null;

const CONNECT_TIMEOUT_MS = 15_000;

/** @type {'disconnected'|'connecting'|'connected'|'reconnecting'|'token_invalid'|'degraded'} */
let connectionStatus = 'disconnected';
let lastError = '';
let reconnectAttempt = 0;

const reconnectBackoff = createBackoffScheduler((attempt) => {
  reconnectAttempt = attempt;
  connectionStatus = 'reconnecting';
  emitStatus();
  destroySocket();
  void connectFyersUpstream();
});

function emitStatus(extra = {}) {
  const payload = {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    hasTicks,
    lastTickAt,
    lastMessageAt,
    reconnectAttempt,
    lastError: lastError || undefined,
    upstream: 'fyers',
    ...extra,
  };
  for (const fn of statusListeners) {
    try {
      fn(payload);
    } catch {
      /* ignore */
    }
  }
}

function notifyTickListeners() {
  for (const fn of tickListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeWsStatus(fn) {
  statusListeners.add(fn);
  fn({
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    hasTicks,
    lastTickAt,
    lastMessageAt,
    reconnectAttempt,
    lastError: lastError || undefined,
    upstream: 'fyers',
  });
  return () => statusListeners.delete(fn);
}

export function getFyersWsStatus() {
  return {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    hasTicks,
    lastTickAt,
    lastMessageAt,
    reconnectAttempt,
    lastError,
    subscribedCount: subscribedFyers.size,
    pendingCount: pendingSymbols.size,
  };
}

function isAuthError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /invalid.?token|unauthorized|401|403|auth|session|expired/i.test(msg);
}

function ingestMessage(msg) {
  lastMessageAt = Date.now();
  const symbol = msg?.symbol || msg?.n;
  if (!symbol) return;

  const app = fromFyersSymbol(symbol, []);
  if (!app) return;

  const merged = mergeTickIntoMeta(app, msg);
  if (merged) {
    hasTicks = true;
    lastTickAt = Date.now();
    updateCandleFromTick(app, merged);
    notifyTickListeners();
  }
}

function subscribeChunk(fyersSyms) {
  if (!socket || !fyersSyms.length) return;
  try {
    socket.subscribe(fyersSyms, false, 1);
    socket.mode(socket.FullMode, 1);
    fyersSyms.forEach((s) => subscribedFyers.add(s));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[FyersWsManager] subscribe:', msg);
    if (isAuthError(err)) handleTokenInvalid(msg);
  }
}

function flushPendingSubscriptions() {
  const add = [...pendingSymbols]
    .map(toFyersSymbol)
    .filter((s) => s && !subscribedFyers.has(s));
  pendingSymbols.clear();
  for (let i = 0; i < add.length; i += CHUNK_SIZE) {
    subscribeChunk(add.slice(i, i + CHUNK_SIZE));
  }
}

function addSymbolRefs(symbols) {
  for (const s of symbols || []) {
    const sym = String(s || '').trim().toUpperCase();
    if (!sym) continue;
    pendingSymbols.add(sym);
    symbolRefCount.set(sym, (symbolRefCount.get(sym) || 0) + 1);
  }
}

function removeSymbolRefs(symbols) {
  for (const s of symbols || []) {
    const sym = String(s || '').trim().toUpperCase();
    if (!sym) continue;
    const n = (symbolRefCount.get(sym) || 0) - 1;
    if (n <= 0) {
      symbolRefCount.delete(sym);
      pendingSymbols.delete(sym);
    } else {
      symbolRefCount.set(sym, n);
    }
  }
}

function startHealthMonitors() {
  stopHealthMonitors();
  heartbeatTimer = setInterval(() => {
    if (!socket || connectionStatus !== 'connected') return;
    if (!isNseFnoMarketOpen()) return;
    if (lastMessageAt && Date.now() - lastMessageAt > STALE_TICK_MS) {
      if (connectionStatus === 'reconnecting') return;
      console.warn('[FyersWsManager] Stale socket (market open) — reconnecting');
      lastError = 'Socket stale (no data)';
      connectionStatus = 'degraded';
      emitStatus();
      scheduleReconnect();
    }
  }, HEARTBEAT_MS);

  staleCheckTimer = setInterval(() => {
    if (socket?.readyState === 3 || socket?.readyState === 2) {
      scheduleReconnect();
    }
  }, HEARTBEAT_MS);
}

function stopHealthMonitors() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (staleCheckTimer) {
    clearInterval(staleCheckTimer);
    staleCheckTimer = null;
  }
}

function scheduleReconnect() {
  if (intentionalClose || connectionStatus === 'token_invalid') return;
  if (!isFyersConfigured()) return;
  connectionStatus = 'reconnecting';
  emitStatus();
  reconnectBackoff.schedule();
}

function handleTokenInvalid(reason) {
  intentionalClose = true;
  connectionStatus = 'token_invalid';
  lastError = reason || 'Fyers token invalid or expired';
  reconnectBackoff.cancel();
  destroySocket();
  clearFyersAccessToken();
  emitStatus({ tokenInvalid: true });
  console.warn('[FyersWsManager] Token invalid — reconnect stopped until login');
}

function stopConnectTimeout() {
  if (connectTimeoutTimer) {
    clearTimeout(connectTimeoutTimer);
    connectTimeoutTimer = null;
  }
}

function startConnectTimeout() {
  stopConnectTimeout();
  connectTimeoutTimer = setTimeout(() => {
    connectTimeoutTimer = null;
    if (connectionStatus === 'connecting' && !intentionalClose) {
      console.warn('[FyersWsManager] Connection timeout — reconnecting');
      lastError = 'Connection timeout';
      scheduleReconnect();
    }
  }, CONNECT_TIMEOUT_MS);
}

function destroySocket() {
  stopHealthMonitors();
  stopConnectTimeout();
  try {
    socket?.close?.();
  } catch {
    /* ignore */
  }
  socket = null;
  connecting = false;
  subscribedFyers.clear();
}

function wireSocket() {
  if (!socket) return;
  socket.removeAllListeners?.();

  socket.on('connect', () => {
    stopConnectTimeout();
    console.log('[FyersWsManager] Connected (Full mode)');
    connectionStatus = 'connected';
    reconnectAttempt = 0;
    reconnectBackoff.reset();
    lastError = '';
    lastMessageAt = Date.now();
    subscribedFyers.clear();
    flushPendingSubscriptions();
    startHealthMonitors();
    emitStatus();
  });

  socket.on('message', ingestMessage);

  socket.on('error', (err) => {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    console.warn('[FyersWsManager] Error:', msg);
    lastError = msg;
    if (isAuthError(err)) {
      handleTokenInvalid(msg);
    } else {
      connectionStatus = 'degraded';
      emitStatus();
      scheduleReconnect();
    }
  });

  socket.on('disconnect', (reason) => {
    const msg = reason ? String(reason) : 'Socket disconnected';
    console.warn('[FyersWsManager] Disconnect event:', msg);
    lastError = msg;
    stopHealthMonitors();
    connecting = false;
    if (intentionalClose) {
      connectionStatus = 'disconnected';
      emitStatus();
      return;
    }
    connectionStatus = 'reconnecting';
    emitStatus();
    scheduleReconnect();
  });

  socket.on('connect_error', (err) => {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    console.warn('[FyersWsManager] Connect error:', msg);
    lastError = msg;
    if (isAuthError(err)) {
      handleTokenInvalid(msg);
    } else {
      connectionStatus = 'degraded';
      emitStatus();
      scheduleReconnect();
    }
  });

  socket.on('close', () => {
    console.warn('[FyersWsManager] Disconnected');
    stopHealthMonitors();
    connecting = false;
    if (intentionalClose) {
      connectionStatus = 'disconnected';
      emitStatus();
      return;
    }
    connectionStatus = 'reconnecting';
    emitStatus();
    scheduleReconnect();
  });
}

async function connectFyersUpstream() {
  if (connecting || socket || intentionalClose) return;
  if (!isFyersConfigured()) {
    connectionStatus = 'disconnected';
    emitStatus();
    return;
  }

  const token = getFyersAccessToken();
  if (!token) {
    connectionStatus = 'disconnected';
    emitStatus();
    return;
  }

  const valid = await validateFyersToken();
  if (!valid) {
    handleTokenInvalid('Fyers access token expired or invalid');
    return;
  }

  const auth = getFyersSocketAuth();
  if (!auth) {
    connectionStatus = 'disconnected';
    emitStatus();
    return;
  }

  connecting = true;
  connectionStatus = 'connecting';
  emitStatus();

  try {
    socket = fyersDataSocket.getInstance(auth, logPath, false);
    wireSocket();
    socket.connect();
    socket.autoreconnect?.();
    startConnectTimeout();
  } catch (err) {
    stopConnectTimeout();
    connecting = false;
    const msg = err instanceof Error ? err.message : String(err);
    lastError = msg;
    console.warn('[FyersWsManager] Connect failed:', msg);
    if (isAuthError(err)) handleTokenInvalid(msg);
    else scheduleReconnect();
  }
}

export function ensureFyersSocket(symbols = []) {
  intentionalClose = false;
  addSymbolRefs(symbols);
  if (!socket && !connecting) void connectFyersUpstream();
  else flushPendingSubscriptions();
}

export function subscribeFyersSymbols(symbols) {
  addSymbolRefs(symbols);
  if (!socket && !connecting) void connectFyersUpstream();
  else flushPendingSubscriptions();
}

export function unsubscribeFyersSymbols(symbols) {
  removeSymbolRefs(symbols);
}

export function subscribeTickBroadcast(fn) {
  tickListeners.add(fn);
  return () => tickListeners.delete(fn);
}

export function emitTickBroadcast() {
  notifyTickListeners();
}

export function getTickSnapshot(symbols) {
  return getQuoteMetaSnapshot(symbols);
}

export function getTickQuotes(symbols) {
  const out = new Map();
  for (const sym of symbols || []) {
    const hit = getQuoteMetaSnapshot([sym])[0];
    if (hit) out.set(sym, { at: Date.now(), data: hit });
  }
  return out;
}

export function isFyersSocketActive() {
  return connectionStatus === 'connected' && (hasTicks || Date.now() - lastMessageAt < STALE_TICK_MS);
}

export async function resetFyersSocket() {
  intentionalClose = false;
  reconnectBackoff.cancel();
  reconnectBackoff.reset();
  destroySocket();
  hasTicks = false;
  lastTickAt = 0;
  lastMessageAt = 0;
  await connectFyersUpstream();
  flushPendingSubscriptions();
}

export function shutdownFyersSocket() {
  intentionalClose = true;
  reconnectBackoff.cancel();
  destroySocket();
  connectionStatus = 'disconnected';
  hasTicks = false;
  emitStatus();
}
