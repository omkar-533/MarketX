/**
 * Zerodha KiteTicker → quoteMeta live ticks (true WebSocket).
 * Activates only when KITE_API_KEY + KITE_ACCESS_TOKEN are set.
 */
import { KiteTicker } from 'kiteconnect';
import {
  getQuoteMetaSnapshot,
  mergeTickIntoMeta,
  updateCandleFromTick,
} from '../quoteMeta.mjs';
import { createBackoffScheduler } from '../wsBackoff.mjs';
import { getKiteAccessToken, getKiteApiKey, isKiteConfigured } from './kiteConfig.mjs';
import { ensureInstruments, resolveEquityToken } from './instruments.mjs';

const MAX_TOKENS = Math.max(50, Number(process.env.KITE_MAX_TOKENS || 900));

/** token → Set of app symbols */
const tokenToSymbols = new Map();
/** app symbol → token */
const symbolToToken = new Map();
const symbolRefCount = new Map();
const pendingSymbols = new Set();
const tickListeners = new Set();
const statusListeners = new Set();

let ticker = null;
let connecting = false;
let intentionalClose = false;
let hasTicks = false;
let lastTickAt = 0;
let lastMessageAt = 0;
/** @type {'disconnected'|'connecting'|'connected'|'reconnecting'|'degraded'|'disabled'} */
let connectionStatus = 'disabled';
let lastError = '';
let reconnectAttempt = 0;

const reconnectBackoff = createBackoffScheduler((attempt) => {
  if (!isKiteConfigured()) return;
  reconnectAttempt = attempt;
  connectionStatus = 'reconnecting';
  emitStatus();
  destroyTicker();
  void connectUpstream();
});

function emitStatus(extra = {}) {
  const payload = {
    ...getKiteWsStatus(),
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
  fn(getKiteWsStatus());
  return () => statusListeners.delete(fn);
}

export function subscribeTickBroadcast(fn) {
  tickListeners.add(fn);
  return () => tickListeners.delete(fn);
}

export function getKiteWsStatus() {
  return {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    hasTicks,
    lastTickAt,
    lastMessageAt,
    reconnectAttempt,
    lastError,
    subscribedCount: symbolToToken.size,
    pendingCount: pendingSymbols.size,
    symbolCap: MAX_TOKENS,
    activeSymbols: symbolRefCount.size,
    upstream: 'kite',
    configured: isKiteConfigured(),
  };
}

export function getTickSnapshot(symbols) {
  return getQuoteMetaSnapshot(symbols);
}

function destroyTicker() {
  if (!ticker) return;
  try {
    intentionalClose = true;
    ticker.disconnect();
  } catch {
    /* ignore */
  }
  ticker = null;
  intentionalClose = false;
  connecting = false;
}

function onTicks(ticks) {
  if (!Array.isArray(ticks) || !ticks.length) return;
  lastMessageAt = Date.now();
  let any = false;
  for (const t of ticks) {
    const token = Number(t.instrument_token);
    const symbols = tokenToSymbols.get(token);
    if (!symbols?.size) continue;
    const depth = Array.isArray(t.depth?.buy) ? t.depth.buy[0] : null;
    const askD = Array.isArray(t.depth?.sell) ? t.depth.sell[0] : null;
    const tick = {
      ltp: t.last_price,
      lp: t.last_price,
      open: t.ohlc?.open,
      high: t.ohlc?.high,
      low: t.ohlc?.low,
      prev_close: t.ohlc?.close,
      volume: t.volume_traded,
      oi: t.oi,
      oi_change: t.oi_day_high && t.oi != null ? undefined : undefined,
      bid: depth?.price,
      ask: askD?.price,
      bid_qty: depth?.quantity,
      ask_qty: askD?.quantity,
      ch: undefined,
      chp: undefined,
      source: 'kite',
    };
    for (const sym of symbols) {
      const merged = mergeTickIntoMeta(sym, tick);
      if (merged) {
        if (tick.source) merged.source = 'kite';
        updateCandleFromTick(sym, merged);
        any = true;
      }
    }
  }
  if (any) {
    hasTicks = true;
    lastTickAt = Date.now();
    if (connectionStatus !== 'connected') {
      connectionStatus = 'connected';
      emitStatus();
    }
    notifyTickListeners();
  }
}

async function connectUpstream() {
  if (!isKiteConfigured()) {
    connectionStatus = 'disabled';
    emitStatus();
    return;
  }
  if (ticker || connecting) return;
  connecting = true;
  connectionStatus = 'connecting';
  lastError = '';
  emitStatus();

  try {
    await ensureInstruments();
    const api_key = getKiteApiKey();
    const access_token = getKiteAccessToken();
    ticker = new KiteTicker({
      api_key,
      access_token,
      reconnect: true,
      max_retry: 50,
      max_delay: 60,
    });

    ticker.on('ticks', onTicks);
    ticker.on('connect', () => {
      connecting = false;
      connectionStatus = 'connected';
      reconnectAttempt = 0;
      reconnectBackoff.reset();
      lastError = '';
      emitStatus();
      void flushSubscriptions();
    });
    ticker.on('disconnect', (err) => {
      connecting = false;
      if (intentionalClose) return;
      lastError = err instanceof Error ? err.message : String(err || 'disconnect');
      connectionStatus = 'reconnecting';
      emitStatus();
      reconnectBackoff.schedule();
    });
    ticker.on('error', (err) => {
      lastError = err instanceof Error ? err.message : String(err || 'kite error');
      connectionStatus = 'degraded';
      emitStatus();
    });
    ticker.on('close', () => {
      connecting = false;
      if (intentionalClose) {
        connectionStatus = 'disconnected';
        emitStatus();
        return;
      }
      connectionStatus = 'reconnecting';
      emitStatus();
      reconnectBackoff.schedule();
    });

    ticker.connect();
  } catch (err) {
    connecting = false;
    lastError = err instanceof Error ? err.message : String(err);
    connectionStatus = 'degraded';
    emitStatus();
    reconnectBackoff.schedule();
  }
}

async function resolveToken(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  if (symbolToToken.has(sym)) return symbolToToken.get(sym);
  const token = await resolveEquityToken(sym);
  return token ?? null;
}

async function flushSubscriptions() {
  if (!ticker || connectionStatus !== 'connected') return;
  const tokens = [...new Set(symbolToToken.values())];
  if (!tokens.length) return;
  try {
    ticker.subscribe(tokens);
    ticker.setMode(ticker.modeFull, tokens);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

export async function subscribeKiteSymbols(symbols) {
  if (!isKiteConfigured()) return;
  const list = (Array.isArray(symbols) ? symbols : [])
    .map((s) => String(s).trim().toUpperCase())
    .filter(Boolean);
  for (const sym of list) {
    pendingSymbols.add(sym);
    const prev = symbolRefCount.get(sym) || 0;
    symbolRefCount.set(sym, prev + 1);
    if (prev > 0 && symbolToToken.has(sym)) continue;

    if (symbolToToken.size >= MAX_TOKENS) {
      pendingSymbols.delete(sym);
      continue;
    }

    const token = await resolveToken(sym);
    pendingSymbols.delete(sym);
    if (!token) continue;

    symbolToToken.set(sym, token);
    let set = tokenToSymbols.get(token);
    if (!set) {
      set = new Set();
      tokenToSymbols.set(token, set);
    }
    set.add(sym);
  }
  if (!ticker) void connectUpstream();
  else void flushSubscriptions();
}

export function unsubscribeKiteSymbols(symbols) {
  const list = (Array.isArray(symbols) ? symbols : [])
    .map((s) => String(s).trim().toUpperCase())
    .filter(Boolean);
  const dropTokens = [];
  for (const sym of list) {
    const count = (symbolRefCount.get(sym) || 0) - 1;
    if (count <= 0) {
      symbolRefCount.delete(sym);
      const token = symbolToToken.get(sym);
      symbolToToken.delete(sym);
      if (token != null) {
        const set = tokenToSymbols.get(token);
        set?.delete(sym);
        if (!set?.size) {
          tokenToSymbols.delete(token);
          dropTokens.push(token);
        }
      }
    } else {
      symbolRefCount.set(sym, count);
    }
  }
  if (ticker && dropTokens.length) {
    try {
      ticker.unsubscribe(dropTokens);
    } catch {
      /* ignore */
    }
  }
}

export function ensureKiteSocket(bootSymbols = []) {
  if (!isKiteConfigured()) {
    connectionStatus = 'disabled';
    emitStatus();
    return false;
  }
  void subscribeKiteSymbols(bootSymbols);
  void connectUpstream();
  return true;
}

export function resetKiteSocket() {
  destroyTicker();
  hasTicks = false;
  lastTickAt = 0;
  connectionStatus = isKiteConfigured() ? 'disconnected' : 'disabled';
  emitStatus();
  if (isKiteConfigured()) void connectUpstream();
}

export function restartKiteWithToken() {
  resetKiteSocket();
  void connectUpstream();
}
