import type { IndexData, StockData } from '../data/marketData';

export type MarketDataMode = 'live' | 'offline' | 'mixed';

type MarketLiveState = {
  mode: MarketDataMode;
  indices: IndexData[];
  stocks: StockData[];
  fetchedAt: string;
  error: string;
  liveCount: number;
  provider: string;
};

const state: MarketLiveState = {
  mode: 'offline',
  indices: [],
  stocks: [],
  fetchedAt: '',
  error: '',
  liveCount: 0,
  provider: '',
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeMarketLive(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getMarketLiveState(): Readonly<MarketLiveState> {
  return state;
}

export function getMarketDataMode(): MarketDataMode {
  return state.mode;
}

export function setMarketLiveSnapshot(opts: {
  indices: IndexData[];
  stocks: StockData[];
  liveCount: number;
  error?: string;
}) {
  state.indices = opts.indices;
  state.stocks = opts.stocks;
  state.liveCount = opts.liveCount;
  state.fetchedAt = new Date().toISOString();
  state.error = opts.error || '';

  if (opts.liveCount === 0) {
    state.mode = 'offline';
  } else if (opts.liveCount >= opts.indices.length + opts.stocks.length) {
    state.mode = 'live';
  } else {
    state.mode = 'mixed';
  }
  notify();
}

export function setMarketLiveError(message: string) {
  state.error = message;
  if (!state.liveCount) state.mode = 'offline';
  notify();
}

export function setMarketProvider(provider: string) {
  state.provider = provider || '';
  notify();
}
