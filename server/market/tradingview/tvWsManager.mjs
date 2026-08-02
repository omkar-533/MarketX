/**
 * TradingView quote WebSocket manager.
 * Protocol adapted from tradingview-scraper RealTimeData (unofficial TV socket).
 */
import WebSocket from 'ws';
import { fromTvSymbol, toTvSymbol } from './symbolMap.mjs';
import {
  getQuoteMetaSnapshot,
  mergeTickIntoMeta,
  updateCandleFromTick,
} from '../quoteMeta.mjs';
import { createBackoffScheduler } from '../wsBackoff.mjs';

const WS_URL = 'wss://data.tradingview.com/socket.io/websocket?from=screener%2F';
const CHUNK_SIZE = 40;
const MAX_SYMBOLS = Math.max(8, Number(process.env.TV_MAX_SYMBOLS || 80));
const HEARTBEAT_MS = 25_000;
const STALE_TICK_MS = 180_000;
const CONNECT_TIMEOUT_MS = 20_000;

const QUOTE_FIELDS = [
  'ch',
  'chp',
  'current_session',
  'description',
  'exchange',
  'fractional',
  'is_tradable',
  'lp',
  'lp_time',
  'minmov',
  'minmove2',
  'original_name',
  'pricescale',
  'pro_name',
  'short_name',
  'type',
  'update_mode',
  'volume',
  'currency_code',
  'rchp',
  'rtc',
  'open_price',
  'high_price',
  'low_price',
  'prev_close_price',
  'bid',
  'ask',
];

const pendingSymbols = new Set();
const subscribedTv = new Set();
const symbolRefCount = new Map();
const tickListeners = new Set();
const statusListeners = new Set();

let socket = null;
let quoteSession = '';
let connecting = false;
let intentionalClose = false;
let hasTicks = false;
let lastTickAt = 0;
let lastMessageAt = 0;
let heartbeatTimer = null;
let connectTimeoutTimer = null;
/** @type {'disconnected'|'connecting'|'connected'|'reconnecting'|'degraded'} */
let connectionStatus = 'disconnected';
let lastError = '';
let reconnectAttempt = 0;
let symbolCapWarned = false;

const reconnectBackoff = createBackoffScheduler((attempt) => {
  reconnectAttempt = attempt;
  connectionStatus = 'reconnecting';
  emitStatus();
  destroySocket();
  void connectUpstream();
});

function sessionId(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let out = prefix;
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function prependHeader(message) {
  return `~m~${message.length}~m~${message}`;
}

function createMessage(func, paramList) {
  return prependHeader(JSON.stringify({ m: func, p: paramList }));
}

function emitStatus(extra = {}) {
  const payload = {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    hasTicks,
    lastTickAt,
    lastMessageAt,
    reconnectAttempt,
    lastError: lastError || undefined,
    upstream: 'tradingview',
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
  fn(getTvWsStatus());
  return () => statusListeners.delete(fn);
}

export function getTvWsStatus() {
  return {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    hasTicks,
    lastTickAt,
    lastMessageAt,
    reconnectAttempt,
    lastError,
    subscribedCount: subscribedTv.size,
    pendingCount: pendingSymbols.size,
    symbolCap: MAX_SYMBOLS,
    activeSymbols: symbolRefCount.size,
    upstream: 'tradingview',
  };
}

/** @deprecated alias for callers that still ask for Fyers status shape */
export function getFyersWsStatus() {
  return getTvWsStatus();
}

function send(func, args) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(createMessage(func, args));
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

function ingestQuotePacket(payload) {
  if (!payload || typeof payload !== 'object') return;
  const n = payload.n || payload.symbol;
  const v = payload.v || payload;
  if (!n || !v) return;
  const app = fromTvSymbol(n, []);
  if (!app) return;

  const tick = {
    lp: v.lp,
    ltp: v.lp,
    ch: v.ch,
    chp: v.chp,
    volume: v.volume,
    vol: v.volume,
    open_price: v.open_price ?? v.open,
    high_price: v.high_price ?? v.high,
    low_price: v.low_price ?? v.low,
    prev_close_price: v.prev_close_price ?? v.prev_close,
    bid: v.bid,
    ask: v.ask,
  };

  const merged = mergeTickIntoMeta(app, tick);
  if (merged) {
    hasTicks = true;
    lastTickAt = Date.now();
    updateCandleFromTick(app, merged);
    notifyTickListeners();
  }
}

function handleRawMessage(raw) {
  lastMessageAt = Date.now();
  const text = String(raw || '');

  if (/^~m~\d+~m~~h~\d+$/.test(text)) {
    try {
      socket?.send(text);
    } catch {
      /* ignore */
    }
    return;
  }

  const parts = text.split(/~m~\d+~m~/).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith('~h~')) {
      try {
        socket?.send(prependHeader(part));
      } catch {
        /* ignore */
      }
      continue;
    }
    let pkt;
    try {
      pkt = JSON.parse(part);
    } catch {
      continue;
    }
    if (pkt?.m === 'qsd' && Array.isArray(pkt.p)) {
      const quoteObj = pkt.p[1];
      if (Array.isArray(quoteObj)) {
        for (const row of quoteObj) ingestQuotePacket(row);
      } else {
        ingestQuotePacket(quoteObj);
      }
    }
  }
}

function addSymbolRefs(symbols) {
  for (const s of symbols || []) {
    const sym = String(s || '').trim().toUpperCase();
    if (!sym) continue;
    if (!symbolRefCount.has(sym) && symbolRefCount.size >= MAX_SYMBOLS) {
      if (!symbolCapWarned) {
        symbolCapWarned = true;
        console.warn(`[TvWs] Symbol cap reached (${MAX_SYMBOLS}). Extra symbols skipped.`);
      }
      continue;
    }
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

function flushPendingSubscriptions() {
  if (!socket || socket.readyState !== WebSocket.OPEN || !quoteSession) return;
  const add = [...pendingSymbols]
    .map(toTvSymbol)
    .filter((s) => s && !subscribedTv.has(s));
  pendingSymbols.clear();
  for (let i = 0; i < add.length; i += CHUNK_SIZE) {
    const chunk = add.slice(i, i + CHUNK_SIZE);
    if (!chunk.length) continue;
    send('quote_add_symbols', [quoteSession, ...chunk]);
    send('quote_fast_symbols', [quoteSession, ...chunk]);
    chunk.forEach((s) => subscribedTv.add(s));
  }
}

function initSessions() {
  quoteSession = sessionId('qs_');
  const chartSession = sessionId('cs_');
  send('set_auth_token', ['unauthorized_user_token']);
  send('set_locale', ['en', 'US']);
  send('chart_create_session', [chartSession, '']);
  send('quote_create_session', [quoteSession]);
  send('quote_set_fields', [quoteSession, ...QUOTE_FIELDS]);
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
      lastError = 'Connection timeout';
      scheduleReconnect();
    }
  }, CONNECT_TIMEOUT_MS);
}

function destroySocket() {
  stopConnectTimeout();
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  try {
    socket?.close?.();
  } catch {
    /* ignore */
  }
  socket = null;
  quoteSession = '';
  connecting = false;
  subscribedTv.clear();
}

function scheduleReconnect() {
  if (intentionalClose) return;
  connectionStatus = 'reconnecting';
  emitStatus();
  reconnectBackoff.schedule();
}

async function connectUpstream() {
  if (connecting || intentionalClose) return;
  if (socket && socket.readyState === WebSocket.OPEN) {
    flushPendingSubscriptions();
    return;
  }

  connecting = true;
  connectionStatus = 'connecting';
  lastError = '';
  emitStatus();
  startConnectTimeout();

  try {
    socket = new WebSocket(WS_URL, {
      headers: {
        Origin: 'https://www.tradingview.com',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      perMessageDeflate: false,
    });

    socket.on('open', () => {
      stopConnectTimeout();
      connecting = false;
      connectionStatus = 'connected';
      reconnectAttempt = 0;
      reconnectBackoff.reset();
      initSessions();
      flushPendingSubscriptions();
      emitStatus();
      console.log('[TvWs] Connected to TradingView quote stream');

      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (!socket || connectionStatus !== 'connected') return;
        if (lastMessageAt && Date.now() - lastMessageAt > STALE_TICK_MS) {
          lastError = 'Socket stale (no data)';
          connectionStatus = 'degraded';
          emitStatus();
          scheduleReconnect();
        }
      }, HEARTBEAT_MS);
    });

    socket.on('message', (data) => {
      handleRawMessage(data.toString());
    });

    socket.on('close', () => {
      stopConnectTimeout();
      connecting = false;
      socket = null;
      quoteSession = '';
      subscribedTv.clear();
      if (!intentionalClose) {
        connectionStatus = 'reconnecting';
        emitStatus();
        scheduleReconnect();
      } else {
        connectionStatus = 'disconnected';
        emitStatus();
      }
    });

    socket.on('error', (err) => {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn('[TvWs] Socket error:', lastError);
    });
  } catch (err) {
    stopConnectTimeout();
    connecting = false;
    lastError = err instanceof Error ? err.message : String(err);
    console.warn('[TvWs] Connect failed:', lastError);
    scheduleReconnect();
  }
}

export function ensureTvSocket(symbols = []) {
  intentionalClose = false;
  addSymbolRefs(symbols);
  if (!socket && !connecting) void connectUpstream();
  else flushPendingSubscriptions();
}

export function subscribeTvSymbols(symbols) {
  addSymbolRefs(symbols);
  if (!socket && !connecting) void connectUpstream();
  else flushPendingSubscriptions();
}

export function unsubscribeTvSymbols(symbols) {
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

export function isTvSocketActive() {
  return (
    connectionStatus === 'connected' &&
    (hasTicks || (lastMessageAt > 0 && Date.now() - lastMessageAt < STALE_TICK_MS))
  );
}

export async function resetTvSocket() {
  intentionalClose = false;
  reconnectBackoff.cancel();
  reconnectBackoff.reset();
  destroySocket();
  hasTicks = false;
  lastTickAt = 0;
  lastMessageAt = 0;
  await connectUpstream();
  flushPendingSubscriptions();
}

export function shutdownTvSocket() {
  intentionalClose = true;
  reconnectBackoff.cancel();
  destroySocket();
  connectionStatus = 'disconnected';
  hasTicks = false;
  emitStatus();
}

/* Compatibility aliases used while wiring old call sites */
export const ensureFyersSocket = ensureTvSocket;
export const subscribeFyersSymbols = subscribeTvSymbols;
export const unsubscribeFyersSymbols = unsubscribeTvSymbols;
export const resetFyersSocket = resetTvSocket;
export const shutdownFyersSocket = shutdownTvSocket;
export const isFyersSocketActive = isTvSocketActive;
