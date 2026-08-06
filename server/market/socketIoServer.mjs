/**
 * Socket.IO bridge: browser ↔ Kite (or TradingView fallback) + NSE option-chain push.
 */
import { Server } from 'socket.io';
import { getActiveMarketProvider } from './provider.mjs';
import {
  subscribeLiveSymbols,
  unsubscribeLiveSymbols,
  subscribeLiveTickBroadcast,
  getLiveTickSnapshot,
  getLiveWsStatus,
  subscribeLiveWsStatus,
} from './liveFeed.mjs';
import { getLatestCandle } from './quoteMeta.mjs';
import {
  subscribeOptionChain,
  unsubscribeOptionChain,
  subscribeOptionChainBroadcast,
  getCachedOptionChain,
} from './optionChainHub.mjs';

const clientSymbols = new Map();
/** socketId → Set of "SYM:expiry" */
const clientOptionChains = new Map();
let io = null;

function symbolsForSocket(socketId) {
  return clientSymbols.get(socketId) ?? new Set();
}

function ocForSocket(socketId) {
  return clientOptionChains.get(socketId) ?? new Set();
}

function buildTickPayload(symbols) {
  const list = Array.isArray(symbols) ? symbols : undefined;
  const quotes = getLiveTickSnapshot(list);
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

  const unsubTicks = subscribeLiveTickBroadcast(() => broadcastTicks());
  const unsubStatus = subscribeLiveWsStatus((status) => {
    io?.emit('market:status', status);
  });
  const unsubOc = subscribeOptionChainBroadcast((payload) => {
    if (!io) return;
    const k = `${payload.symbol}:${payload.expiry || ''}`;
    const kAny = `${payload.symbol}:`;
    for (const [socketId, set] of clientOptionChains.entries()) {
      if (set.has(k) || set.has(kAny) || [...set].some((x) => x.startsWith(`${payload.symbol}:`))) {
        io.to(socketId).emit('optionchain:update', payload);
      }
    }
  });

  io.on('connection', (socket) => {
    clientSymbols.set(socket.id, new Set());
    clientOptionChains.set(socket.id, new Set());
    socket.emit('market:status', getLiveWsStatus());
    socket.emit('market:tick', buildTickPayload([]));

    socket.on('market:subscribe', (msg) => {
      const symbols = Array.isArray(msg?.symbols) ? msg.symbols : [];
      const normalized = symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
      const set = symbolsForSocket(socket.id);
      for (const sym of normalized) {
        set.add(sym);
      }
      void subscribeLiveSymbols(normalized);
      socket.emit('market:tick', buildTickPayload(normalized));
    });

    socket.on('market:unsubscribe', (msg) => {
      const symbols = Array.isArray(msg?.symbols) ? msg.symbols : [];
      const set = symbolsForSocket(socket.id);
      for (const sym of symbols) {
        const s = String(sym).trim().toUpperCase();
        set.delete(s);
      }
      unsubscribeLiveSymbols(symbols);
    });

    socket.on('optionchain:subscribe', (msg) => {
      const symbol = String(msg?.symbol || '').trim().toUpperCase();
      const expiry = String(msg?.expiry || '').trim() || undefined;
      if (!symbol) return;
      const set = ocForSocket(socket.id);
      set.add(`${symbol}:${expiry || ''}`);
      subscribeOptionChain(symbol, expiry);
      const cached = getCachedOptionChain(symbol, expiry);
      if (cached) socket.emit('optionchain:update', cached);
    });

    socket.on('optionchain:unsubscribe', (msg) => {
      const symbol = String(msg?.symbol || '').trim().toUpperCase();
      const expiry = String(msg?.expiry || '').trim() || undefined;
      const set = ocForSocket(socket.id);
      set.delete(`${symbol}:${expiry || ''}`);
      unsubscribeOptionChain(symbol, expiry);
    });

    socket.on('market:ping', () => {
      socket.emit('market:pong', { at: Date.now() });
    });

    socket.on('disconnect', () => {
      const set = symbolsForSocket(socket.id);
      if (set.size) unsubscribeLiveSymbols([...set]);
      clientSymbols.delete(socket.id);

      const ocSet = ocForSocket(socket.id);
      for (const entry of ocSet) {
        const [sym, exp] = entry.split(':');
        unsubscribeOptionChain(sym, exp || undefined);
      }
      clientOptionChains.delete(socket.id);
    });
  });

  io.engine.on('close', () => {
    unsubTicks();
    unsubStatus();
    unsubOc();
  });

  return io;
}
