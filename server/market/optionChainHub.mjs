/**
 * Option-chain fan-out: NSE snapshot poll + Socket.IO push.
 * When Kite is live, underlying spot is overlaid from quote ticks.
 */
import { fetchNseOptionChain } from './nseOptionChain.mjs';
import { getQuoteMeta } from './quoteMeta.mjs';

/** @type {Map<string, { expiry?: string, refs: number }>} */
const subscriptions = new Map();
/** @type {Map<string, object>} */
const lastSnap = new Map();
const listeners = new Set();

let timer = null;
const POLL_MS = Math.max(20_000, Number(process.env.NSE_OC_POLL_MS || 45_000));

function key(symbol, expiry) {
  return `${String(symbol).toUpperCase()}:${expiry || ''}`;
}

function emit(payload) {
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeOptionChainBroadcast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function subscribeOptionChain(symbol, expiry) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return;
  const k = key(sym, expiry);
  const prev = subscriptions.get(k);
  subscriptions.set(k, { expiry, refs: (prev?.refs || 0) + 1 });
  ensurePoller();
  void refreshOne(sym, expiry);
}

export function unsubscribeOptionChain(symbol, expiry) {
  const sym = String(symbol || '').trim().toUpperCase();
  const k = key(sym, expiry);
  const prev = subscriptions.get(k);
  if (!prev) return;
  if (prev.refs <= 1) subscriptions.delete(k);
  else subscriptions.set(k, { ...prev, refs: prev.refs - 1 });
  if (!subscriptions.size && timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function refreshOne(symbol, expiry) {
  try {
    const data = await fetchNseOptionChain(symbol, expiry);
    const live = getQuoteMeta(symbol);
    if (live?.price > 0) data.spot = live.price;
    data.liveSource = live?.source || null;
    lastSnap.set(key(symbol, expiry), data);
    emit({ type: 'optionchain', ...data });
    return data;
  } catch (err) {
    const payload = {
      type: 'optionchain',
      symbol,
      expiry: expiry || '',
      rows: [],
      source: 'nse',
      error: err instanceof Error ? err.message : String(err),
      fetchedAt: new Date().toISOString(),
    };
    emit(payload);
    return payload;
  }
}

async function refreshAll() {
  for (const [k, meta] of subscriptions.entries()) {
    const symbol = k.split(':')[0];
    await refreshOne(symbol, meta.expiry);
  }
}

function ensurePoller() {
  if (timer) return;
  timer = setInterval(() => {
    void refreshAll();
  }, POLL_MS);
}

export function getCachedOptionChain(symbol, expiry) {
  return lastSnap.get(key(symbol, expiry)) || lastSnap.get(key(symbol, '')) || null;
}
