/**
 * Socket.IO bridge: browser clients ↔ centralized Fyers WS manager (Fyers only).
 */
import { Server } from 'socket.io';
import { getActiveMarketProvider } from './provider.mjs';
import {
  subscribeFyersSymbols,
  unsubscribeFyersSymbols,
  subscribeTickBroadcast,
  getTickSnapshot,
  getFyersWsStatus,
  subscribeWsStatus,
} from './fyersWsManager.mjs';
import { getLatestCandle } from './quoteMeta.mjs';

const clientSymbols = new Map();
let io = null;

function symbolsForSocket(socketId) {
  return clientSymbols.get(socketId) ?? new Set();
}

function buildTickPayload(symbols) {
  const list = Array.isArray(symbols) ? symbols : undefined;
  const quotes = getTickSnapshot(list);
  const candles = {};
  for (const q of quotes) {
    const c = getLatestCandle(q.symbol);
    if (c) candles[q.symbol] = c;
  }
  return {
    type: 'tick',
    provider: getActiveMarketProvider(),
    quotes,
    candles,
    at: Date.now(),
  };
}

function broadcastTicks() {
  if (!io) return;
  if (io.engine.clientsCount <= 0) return;
  for (const [socketId, set] of clientSymbols.entries()) {
    if (!set?.size) continue;
    const payload = buildTickPayload([...set]);
    if (payload?.quotes?.length) {
      io.to(socketId).emit('market:tick', payload);
    }
  }
}

export function attachSocketIo(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: true, credentials: true },
    pingInterval: 25_000,
    pingTimeout: 60_000,
    connectTimeout: 20_000,
    maxHttpBufferSize: 1e6,
  });

  const unsubTicks = subscribeTickBroadcast(() => broadcastTicks());
  const unsubStatus = subscribeWsStatus((status) => {
    io?.emit('market:status', status);
  });

  io.on('connection', (socket) => {
    clientSymbols.set(socket.id, new Set());
    socket.emit('market:status', getFyersWsStatus());
    socket.emit('market:tick', buildTickPayload([]));

    socket.on('market:subscribe', (msg) => {
      const symbols = Array.isArray(msg?.symbols) ? msg.symbols : [];
      const normalized = symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
      const set = symbolsForSocket(socket.id);
      for (const sym of normalized) {
        set.add(sym);
      }
      subscribeFyersSymbols(normalized);
      socket.emit('market:tick', buildTickPayload(normalized));
    });

    socket.on('market:unsubscribe', (msg) => {
      const symbols = Array.isArray(msg?.symbols) ? msg.symbols : [];
      const set = symbolsForSocket(socket.id);
      for (const sym of symbols) {
        const s = String(sym).trim().toUpperCase();
        set.delete(s);
      }
      unsubscribeFyersSymbols(symbols);
    });

    socket.on('market:ping', () => {
      socket.emit('market:pong', { at: Date.now() });
    });

    socket.on('disconnect', () => {
      const set = symbolsForSocket(socket.id);
      if (set.size) unsubscribeFyersSymbols([...set]);
      clientSymbols.delete(socket.id);
    });
  });

  console.log('[Socket.IO] /socket.io — Fyers-only market bridge');
  return { io };
}

export function getSocketIo() {
  return io;
}
