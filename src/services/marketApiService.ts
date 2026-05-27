export type MarketQuoteDto = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  source: string;
  lastUpdated: string;
};

export type MarketQuotesResponse = {
  quotes: MarketQuoteDto[];
  errors: { symbol: string; error: string }[];
  source: string;
  fetchedAt: string;
};

export type MarketOhlcResponse = {
  symbol: string;
  timeframe: string;
  bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  source: string;
  fetchedAt: string;
};

/** Live market data is always required — no demo/simulated quotes */
export function isMarketLiveEnabled(): boolean {
  return true;
}

export type MarketTickDto = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  source?: string;
  lastUpdated: string;
};

export async function fetchMarketHealth(): Promise<{
  status: string;
  provider?: string;
  configured?: boolean;
  websocket?: boolean;
  wsStatus?: string;
  wsLastTickAt?: number | null;
  wsReconnectAttempt?: number;
} | null> {
  try {
    const res = await fetch('/api/market/health');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchMarketTicks(symbols?: string[]): Promise<MarketTickDto[] | null> {
  try {
    const q = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(','))}` : '';
    const res = await fetch(`/api/market/ticks${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.quotes ?? null;
  } catch {
    return null;
  }
}

export async function fetchMarketQuotes(symbols: string[]): Promise<MarketQuotesResponse | null> {
  if (!symbols.length) return null;
  try {
    const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchMarketOhlc(
  symbol: string,
  interval: string,
  range?: string,
): Promise<MarketOhlcResponse | null> {
  try {
    const q = new URLSearchParams({ symbol, interval });
    if (range) q.set('range', range);
    const res = await fetch(`/api/market/ohlc?${q}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export type FnoHistoryRow = {
  date: string;
  symbol: string;
  totalOi: number;
  volume: number;
  futClose?: number;
  futOpen?: number;
  futHigh?: number;
  futLow?: number;
};

export type FnoHistoryResponse = {
  symbol: string;
  from: string;
  to: string;
  rows: FnoHistoryRow[];
  source: string;
  error?: string;
  note?: string;
  fetchedAt: string;
};

/** @deprecated */
export type NseFnoHistoryResponse = FnoHistoryResponse;
export type NseFnoHistoryRow = FnoHistoryRow;

export type FnoOiSnapshot = {
  symbol: string;
  totalOi: number;
  oiChange: number;
  oiChangePct: number;
  callOi: number;
  putOi: number;
  pcr: number;
  source: string;
  fetchedAt: string;
};

export type FnoOiBatchResponse = {
  snapshots: FnoOiSnapshot[];
  errors: { symbol: string; error: string }[];
  source: string;
  fetchedAt: string;
};

export async function fetchFnoOiBatch(symbols: string[]): Promise<FnoOiBatchResponse | null> {
  if (!symbols.length) return null;
  try {
    const res = await fetch(
      `/api/market/fno-oi?symbols=${encodeURIComponent(symbols.join(','))}`,
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export type FiiDiiApiRow = {
  date: string;
  fiiCashBuy: number;
  fiiCashSell: number;
  fiiCashNet: number;
  fiiFuturesBuy: number;
  fiiFuturesSell: number;
  fiiFuturesNet: number;
  fiiOptionsBuy: number;
  fiiOptionsSell: number;
  fiiOptionsNet: number;
  diiCashBuy: number;
  diiCashSell: number;
  diiCashNet: number;
};

export type GlobalIndexQuote = {
  id: string;
  name: string;
  country: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'Open' | 'Closed';
  openTime: string;
  closeTime: string;
  currency: string;
  source: string;
};

export async function fetchFiiDii(days = 30): Promise<{ rows: FiiDiiApiRow[]; source: string } | null> {
  try {
    const res = await fetch(`/api/market/fii-dii?days=${days}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchGlobalQuotes(): Promise<{
  indices: GlobalIndexQuote[];
  source: string;
} | null> {
  try {
    const res = await fetch('/api/market/global-quotes');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchFnoHistory(
  symbol: string,
  from: string,
  to: string,
): Promise<FnoHistoryResponse | null> {
  try {
    const q = new URLSearchParams({ symbol, from, to });
    const res = await fetch(`/api/market/fno-history?${q}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** @deprecated use fetchFnoHistory */
export const fetchNseFnoHistory = fetchFnoHistory;
