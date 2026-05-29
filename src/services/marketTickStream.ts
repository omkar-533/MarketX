import { CORE_LIVE_SYMBOLS, FNO_UNIVERSE } from '../data/fnoUniverse';
import { AUTO_REFRESH_EVENT } from './autoRefreshHub';
import { isMarketLiveEnabled } from './marketApiService';
import {
  refreshMarketConnection,
  setFyersWsStatus,
  setMarketStreamActive,
} from './marketConnection';
import {
  onFyersConnectionStatus,
  onFyersMarketTicks,
  onFyersTokenInvalid,
  startFyersSocketClient,
  stopFyersSocketClient,
  subscribeFyersMarketSymbols,
  isFyersSocketConnected,
  forceFyersReconnect,
} from './fyersSocketClient';
import type { FyersMarketQuote } from '../types/fyersMarket';
import { applyStreamQuotes } from './symbolLiveService';
import { API_SERVER_READY_EVENT, FYERS_MARKET_LIVE_EVENT } from './apiAutoConnect';
import { FYERS_TOKEN_INVALID_EVENT } from '../constants/fyersEvents';

export { FYERS_TOKEN_INVALID_EVENT };

let started = false;
let cleanupFns: (() => void)[] = [];
let reconnectTimer: ReturnType<typeof setInterval> | null = null;

const RECONNECT_POLL_MS = 10_000;
const LIVE_SYMBOL_CAP = Math.max(
  CORE_LIVE_SYMBOLS.length,
  Number(import.meta.env.VITE_LIVE_SYMBOL_CAP || 40),
);

let fullUniverseSubscribed = false;

function subscribeCoreSymbols() {
  subscribeFyersMarketSymbols(CORE_LIVE_SYMBOLS);
}

function subscribeAllFnoDeferred() {
  subscribeCoreSymbols();
  if (fullUniverseSubscribed) return;
  fullUniverseSubscribed = true;
  const all = FNO_UNIVERSE.map((i) => i.symbol).slice(0, LIVE_SYMBOL_CAP);
  const run = () => subscribeFyersMarketSymbols(all);
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 12_000 });
  } else {
    setTimeout(run, 3000);
  }
}

function mapQuoteToStream(q: FyersMarketQuote) {
  return {
    symbol: q.symbol,
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
    open: q.open,
    high: q.high,
    low: q.low,
    prevClose: q.prevClose,
    volume: q.volume,
    source: q.source,
    lastUpdated: q.lastUpdated,
  };
}

function onTickPayload(payload: { quotes: FyersMarketQuote[] }) {
  if (!payload?.quotes?.length) return;
  applyStreamQuotes(payload.quotes.map(mapQuoteToStream));
  window.dispatchEvent(new CustomEvent(AUTO_REFRESH_EVENT, { detail: { tick: 0, at: Date.now() } }));
}

let tokenInvalidNotified = false;

function handleTokenInvalid() {
  setFyersWsStatus('token_invalid');
  if (tokenInvalidNotified) return;
  tokenInvalidNotified = true;
  window.dispatchEvent(new CustomEvent(FYERS_TOKEN_INVALID_EVENT));
}

/** Ask server to subscribe symbols on upstream Fyers WebSocket */
export function subscribeLiveSymbols(symbols: string[]): void {
  subscribeFyersMarketSymbols(symbols);
}

export function startMarketTickStream(): () => void {
  if (!isMarketLiveEnabled() || started) return stopMarketTickStream;
  started = true;

  const tryConnect = () => {
    void refreshMarketConnection().then((conn) => {
      if (!conn.serverOk) return;
      startFyersSocketClient();
      subscribeAllFnoDeferred();
      if (!isFyersSocketConnected() && conn.fyersConnected) {
        forceFyersReconnect();
        subscribeAllFnoDeferred();
      }
    });
  };

  cleanupFns.push(
    onFyersConnectionStatus((s) => {
      setFyersWsStatus(s.status);
      setMarketStreamActive(s.connected);
      if (s.connected) subscribeAllFnoDeferred();
    }),
    onFyersMarketTicks(onTickPayload),
    onFyersTokenInvalid(handleTokenInvalid),
  );

  tryConnect();

  const onApiReady = () => tryConnect();
  window.addEventListener(API_SERVER_READY_EVENT, onApiReady);
  window.addEventListener(FYERS_MARKET_LIVE_EVENT, onApiReady);
  cleanupFns.push(() => {
    window.removeEventListener(API_SERVER_READY_EVENT, onApiReady);
    window.removeEventListener(FYERS_MARKET_LIVE_EVENT, onApiReady);
  });

  reconnectTimer = setInterval(() => {
    if (!started) return;
    void refreshMarketConnection().then((conn) => {
      if (!conn.serverOk) return;
      if (!isFyersSocketConnected()) {
        startFyersSocketClient();
        subscribeAllFnoDeferred();
        if (conn.fyersConnected) forceFyersReconnect();
      }
    });
  }, RECONNECT_POLL_MS);
  cleanupFns.push(() => {
    if (reconnectTimer) clearInterval(reconnectTimer);
    reconnectTimer = null;
  });

  return stopMarketTickStream;
}

export function stopMarketTickStream(): void {
  started = false;
  fullUniverseSubscribed = false;
  setMarketStreamActive(false);
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
  stopFyersSocketClient();
}

export function isMarketWebSocketConnected(): boolean {
  return isFyersSocketConnected();
}
