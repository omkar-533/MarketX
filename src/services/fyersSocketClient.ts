/**
 * Singleton Socket.IO client → Node backend → FYERS WebSocket.
 * Prevents duplicate connections; exponential-friendly reconnect via socket.io-client.
 */
import { io, type Socket } from 'socket.io-client';
import { getWsBaseUrl } from '../config/api';
import type {
  FyersConnectionPayload,
  FyersMarketQuote,
  FyersTickPayload,
  FyersWsConnectionStatus,
} from '../types/fyersMarket';

const RECONNECT_DELAYS = [2000, 5000, 10000, 15000, 20000, 25000, 30000];
const CLIENT_PING_MS = 25_000;
/** Flush ticks immediately — any setTimeout batch makes the candle tip feel sticky. */
const TICK_BATCH_MS = 0;

type StatusHandler = (s: FyersConnectionPayload) => void;
type TickHandler = (payload: FyersTickPayload) => void;
type TokenInvalidHandler = () => void;
type OptionChainHandler = (payload: Record<string, unknown>) => void;

let socket: Socket | null = null;
let started = false;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempt = 0;

const subscribedSymbols = new Set<string>();
const symbolRefCount = new Map<string, number>();
const optionChainSubs = new Set<string>();

const statusHandlers = new Set<StatusHandler>();
const tickHandlers = new Set<TickHandler>();
const tokenInvalidHandlers = new Set<TokenInvalidHandler>();
const optionChainHandlers = new Set<OptionChainHandler>();

let connectionStatus: FyersWsConnectionStatus = 'disconnected';
let lastError = '';

const quoteCache = new Map<string, FyersMarketQuote>();
let tickBatchTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTickPayload: FyersTickPayload | null = null;

function socketUrl(): string {
  return getWsBaseUrl() || window.location.origin;
}

function emitStatus(extra?: Partial<FyersConnectionPayload>) {
  const payload: FyersConnectionPayload = {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    lastError: lastError || undefined,
    reconnectAttempt,
    upstream: 'fyers',
    ...extra,
  };
  for (const fn of statusHandlers) fn(payload);
}

function flushTickBatch() {
  tickBatchTimer = null;
  if (!pendingTickPayload) return;
  const payload = pendingTickPayload;
  pendingTickPayload = null;
  for (const fn of tickHandlers) fn(payload);
}

function queueTickBroadcast(payload: FyersTickPayload) {
  for (const q of payload.quotes) {
    const raw = String(q.symbol || '').trim().toUpperCase();
    if (!raw) continue;
    quoteCache.set(raw, q);
    const plain = raw.replace(/^NSE:|^BSE:|^MCX:/, '');
    if (plain && plain !== raw) quoteCache.set(plain, { ...q, symbol: plain });
  }


  // Push ticks into shared live store so Dashboard / getIndices stay real-time
  void import('./symbolLiveService')
    .then((m) => {
      m.applyStreamQuotes(
        payload.quotes.map((q) => ({
          symbol: q.symbol,
          price: q.price,
          change: q.change,
          changePercent: q.changePercent,
          open: q.open,
          high: q.high,
          low: q.low,
          prevClose: q.prevClose,
          volume: q.volume,
          lastUpdated: q.lastUpdated || new Date().toISOString(),
          source: q.source,
        })),
      );
    })
    .catch(() => {});

  void import('./marketConnection')
    .then((m) => {
      m.setMarketStreamActive?.(true);
      m.setMarketWsStatus?.('connected');
    })
    .catch(() => {});

  if (pendingTickPayload) {
    const mergedQuotes = new Map<string, FyersMarketQuote>();
    for (const q of pendingTickPayload.quotes) mergedQuotes.set(q.symbol, q);
    for (const q of payload.quotes) mergedQuotes.set(q.symbol, q);

    pendingTickPayload = {
      ...payload,
      quotes: [...mergedQuotes.values()],
      candles: {
        ...(pendingTickPayload.candles ?? {}),
        ...(payload.candles ?? {}),
      },
    };
  } else {
    pendingTickPayload = payload;
  }

  if (TICK_BATCH_MS <= 0) {
    if (tickBatchTimer) {
      clearTimeout(tickBatchTimer);
      tickBatchTimer = null;
    }
    flushTickBatch();
    return;
  }

  if (!tickBatchTimer) {
    tickBatchTimer = setTimeout(flushTickBatch, TICK_BATCH_MS);
  }
}

function addRefs(symbols: string[]) {
  const added: string[] = [];
  for (const s of symbols) {
    const sym = s.trim().toUpperCase();
    if (!sym) continue;
    const n = (symbolRefCount.get(sym) || 0) + 1;
    symbolRefCount.set(sym, n);
    if (n === 1) {
      subscribedSymbols.add(sym);
      added.push(sym);
    }
  }
  return added;
}

function removeRefs(symbols: string[]) {
  const removed: string[] = [];
  for (const s of symbols) {
    const sym = s.trim().toUpperCase();
    if (!sym) continue;
    const n = (symbolRefCount.get(sym) || 0) - 1;
    if (n <= 0) {
      symbolRefCount.delete(sym);
      subscribedSymbols.delete(sym);
      removed.push(sym);
    } else {
      symbolRefCount.set(sym, n);
    }
  }
  return removed;
}

function flushSubscribe() {
  if (!socket?.connected) return;
  if (subscribedSymbols.size) {
    socket.emit('market:subscribe', { symbols: [...subscribedSymbols] });
  }
  for (const key of optionChainSubs) {
    const [symbol, expiry] = key.split(':');
    socket.emit('optionchain:subscribe', { symbol, expiry: expiry || undefined });
  }
}

export function subscribeOptionChainLive(symbol: string, expiry?: string): void {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return;
  const key = `${sym}:${expiry || ''}`;
  optionChainSubs.add(key);
  startFyersSocketClient();
  if (socket?.connected) {
    socket.emit('optionchain:subscribe', { symbol: sym, expiry: expiry || undefined });
  }
}

export function unsubscribeOptionChainLive(symbol: string, expiry?: string): void {
  const sym = symbol.trim().toUpperCase();
  const key = `${sym}:${expiry || ''}`;
  optionChainSubs.delete(key);
  if (socket?.connected) {
    socket.emit('optionchain:unsubscribe', { symbol: sym, expiry: expiry || undefined });
  }
}

export function onOptionChainUpdate(fn: OptionChainHandler): () => void {
  optionChainHandlers.add(fn);
  return () => optionChainHandlers.delete(fn);
}

function startClientPing() {
  stopClientPing();
  pingTimer = setInterval(() => {
    if (socket?.connected) socket.emit('market:ping');
  }, CLIENT_PING_MS);
}

function stopClientPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function getReconnectDelay() {
  const idx = Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1);
  return RECONNECT_DELAYS[idx];
}

function connectSocket() {
  if (socket?.connected) return;

  try {
    socket?.disconnect();
  } catch {
    /* ignore */
  }

  connectionStatus = 'connecting';
  emitStatus();

  socket = io(socketUrl(), {
    path: '/socket.io',
    // Render free / many proxies reject Engine.IO websocket upgrades.
    // Prefer polling first — Socket.IO will upgrade to websocket when available.
    // websocket-first NEVER falls back reliably here (probe: 0 ticks + "websocket error").
    transports: ['polling', 'websocket'],
    upgrade: true,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: getReconnectDelay(),
    reconnectionDelayMax: 30_000,
    timeout: 20_000,
    autoConnect: true,
  });

  socket.on('connect', () => {
    connectionStatus = 'connected';
    reconnectAttempt = 0;
    lastError = '';
    emitStatus();
    flushSubscribe();
    startClientPing();
  });

  socket.on('disconnect', (reason) => {
    connectionStatus = 'reconnecting';
    lastError = reason;
    reconnectAttempt += 1;
    emitStatus();
    stopClientPing();
  });

  socket.io.on('reconnect_attempt', () => {
    connectionStatus = 'reconnecting';
    emitStatus({ reconnectAttempt });
  });

  socket.io.on('reconnect', () => {
    connectionStatus = 'connected';
    reconnectAttempt = 0;
    emitStatus();
    flushSubscribe();
  });

  socket.on('connect_error', (err) => {
    connectionStatus = 'degraded';
    lastError = err.message;
    emitStatus();
  });

  // Upstream (TradingView) status is informational — do NOT overwrite our Socket.IO link status.
  // Overwriting made the UI show "Live feed starting…" while the browser↔API socket was fine,
  // and made the watchdog call forceReconnect in a loop.
  socket.on('market:status', (status: FyersConnectionPayload & { tokenInvalid?: boolean }) => {
    if (status?.lastError) lastError = status.lastError;
    if (status?.tokenInvalid || (status?.status as string) === 'token_invalid') {
      connectionStatus = 'disconnected';
      lastError = status.lastError || 'token_invalid';
      for (const fn of tokenInvalidHandlers) fn();
      emitStatus({ ...status, status: 'disconnected', connected: false });
      return;
    }
    if (socket?.connected) {
      connectionStatus = 'connected';
      emitStatus({
        hasTicks: status?.hasTicks,
        lastTickAt: status?.lastTickAt,
        lastMessageAt: status?.lastMessageAt,
        upstream: status?.upstream,
      });
      return;
    }
    if (status?.status) connectionStatus = status.status;
    emitStatus(status);
  });

  socket.on('market:tick', (payload: FyersTickPayload) => {
    if (!payload?.quotes?.length) return;
    queueTickBroadcast(payload);
  });

  socket.on('optionchain:update', (payload: Record<string, unknown>) => {
    for (const fn of optionChainHandlers) {
      try {
        fn(payload);
      } catch {
        /* ignore */
      }
    }
  });

  socket.on('market:pong', () => {
    emitStatus({ connected: true });
  });
}

export function startFyersSocketClient(): () => void {
  if (started) return stopFyersSocketClient;
  started = true;
  connectSocket();
  return stopFyersSocketClient;
}

export function stopFyersSocketClient(): void {
  started = false;
  stopClientPing();
  if (tickBatchTimer) {
    clearTimeout(tickBatchTimer);
    tickBatchTimer = null;
  }
  try {
    socket?.disconnect();
  } catch {
    /* ignore */
  }
  socket = null;
  connectionStatus = 'disconnected';
  emitStatus();
}

export function subscribeFyersMarketSymbols(symbols: string[]): void {
  const added = addRefs(symbols);
  if (added.length) flushSubscribe();
}

export function unsubscribeFyersMarketSymbols(symbols: string[]): void {
  const removed = removeRefs(symbols);
  if (removed.length && socket?.connected) {
    socket.emit('market:unsubscribe', { symbols: removed });
  }
}

export function onFyersConnectionStatus(fn: StatusHandler): () => void {
  statusHandlers.add(fn);
  fn({
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    lastError,
    reconnectAttempt,
  });
  return () => statusHandlers.delete(fn);
}

export function onFyersMarketTicks(fn: TickHandler): () => void {
  tickHandlers.add(fn);
  return () => tickHandlers.delete(fn);
}

export function onFyersTokenInvalid(fn: TokenInvalidHandler): () => void {
  tokenInvalidHandlers.add(fn);
  return () => tokenInvalidHandlers.delete(fn);
}

export function getFyersCachedQuote(symbol: string): FyersMarketQuote | undefined {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return undefined;
  const hit = quoteCache.get(raw);
  if (hit) return hit;
  const plain = raw.replace(/^NSE:|^BSE:|^MCX:/, '');
  if (plain && plain !== raw) return quoteCache.get(plain);
  // Last resort: scan normalized equality (rare exchange-prefix variants).
  for (const [k, q] of quoteCache) {
    if (k.replace(/^NSE:|^BSE:|^MCX:/, '') === plain) return q;
  }
  return undefined;
}

export function getFyersConnectionStatus(): FyersWsConnectionStatus {
  return connectionStatus;
}

export function isFyersSocketConnected(): boolean {
  return Boolean(socket?.connected && connectionStatus === 'connected');
}

export function forceFyersReconnect(): void {
  reconnectAttempt += 1;
  socket?.disconnect();
  connectSocket();
}
