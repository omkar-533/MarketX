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
const TICK_BATCH_MS = 48;

type StatusHandler = (s: FyersConnectionPayload) => void;
type TickHandler = (payload: FyersTickPayload) => void;
type TokenInvalidHandler = () => void;

let socket: Socket | null = null;
let started = false;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempt = 0;

const subscribedSymbols = new Set<string>();
const symbolRefCount = new Map<string, number>();

const statusHandlers = new Set<StatusHandler>();
const tickHandlers = new Set<TickHandler>();
const tokenInvalidHandlers = new Set<TokenInvalidHandler>();

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
    quoteCache.set(q.symbol, q);
  }

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
  if (!socket?.connected || !subscribedSymbols.size) return;
  socket.emit('market:subscribe', { symbols: [...subscribedSymbols] });
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
    // Polling first — Render free tier WebSocket upgrade can fail on cold start
    transports: ['polling', 'websocket'],
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

  socket.on('market:status', (status: FyersConnectionPayload) => {
    if (status?.status) connectionStatus = status.status;
    if (status?.lastError) lastError = status.lastError;
    if (status?.tokenInvalid || status?.status === 'token_invalid') {
      connectionStatus = 'token_invalid';
      for (const fn of tokenInvalidHandlers) fn();
    }
    emitStatus(status);
  });

  socket.on('market:tick', (payload: FyersTickPayload) => {
    if (!payload?.quotes?.length) return;
    queueTickBroadcast(payload);
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
  return quoteCache.get(symbol.trim().toUpperCase());
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
