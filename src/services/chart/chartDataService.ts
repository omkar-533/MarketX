import type { ChartBar, ChartDataSource, ChartSeriesBundle, ChartTimeframe } from '../../types/chart';
import { fetchMarketOhlc } from '../marketApiService';
import { getLiveQuote } from '../symbolLiveService';

const cache = new Map<string, ChartBar[]>();
function cacheKey(symbol: string, tf: ChartTimeframe, source: ChartDataSource) {
  return `${source}:${symbol}:${tf}`;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** In-place last candle update — no array copy */
export function patchLastBarInPlace(bars: ChartBar[], symbol: string): boolean {
  const quote = getLiveQuote(symbol);
  if (!quote?.price || !bars.length) return false;
  const last = bars[bars.length - 1];
  const p = round(quote.price);
  if (last.close === p && last.high >= p && last.low <= p) return false;
  last.close = p;
  last.high = round(Math.max(last.high, p));
  last.low = round(Math.min(last.low, p));
  return true;
}

async function fetchLiveBars(symbol: string, timeframe: ChartTimeframe): Promise<ChartBar[] | null> {
  const res = await fetchMarketOhlc(symbol, timeframe);
  if (!res?.bars?.length) return null;
  const bars = res.bars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
  patchLastBarInPlace(bars, symbol);
  return bars;
}

/** Load real OHLC when API server is up, else seeded history */
export async function loadPlatformBarsAsync(
  symbol: string,
  timeframe: ChartTimeframe,
): Promise<{ bars: ChartBar[]; live: boolean }> {
  const sym = symbol.trim().toUpperCase();
  const key = cacheKey(sym, timeframe, 'platform');

  const liveBars = await fetchLiveBars(sym, timeframe);
  if (liveBars?.length) {
    cache.set(key, liveBars);
    return { bars: liveBars, live: true };
  }

  return { bars: [], live: false };
}

/** Fast sync load from cache (Pro Charts first paint) */
export function getPlatformBarsFast(symbol: string, timeframe: ChartTimeframe): ChartBar[] {
  const sym = symbol.trim().toUpperCase();
  const key = cacheKey(sym, timeframe, 'platform');
  const bars = cache.get(key);
  if (bars?.length) patchLastBarInPlace(bars, sym);
  return bars ?? [];
}

export async function fetchBrokerBars(
  symbol: string,
  timeframe: ChartTimeframe,
): Promise<ChartBar[] | null> {
  const apiUrl = import.meta.env.VITE_BROKER_CHART_API as string | undefined;
  if (!apiUrl?.trim()) return null;

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/ohlc?symbol=${symbol}&interval=${timeframe}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.bars)) return null;
    return data.bars as ChartBar[];
  } catch {
    return null;
  }
}

export async function fetchChartSeries(
  symbol: string,
  timeframe: ChartTimeframe,
  source: ChartDataSource,
): Promise<ChartSeriesBundle> {
  const sym = symbol.trim().toUpperCase();

  if (source === 'broker') {
    const brokerBars = await fetchBrokerBars(sym, timeframe);
    if (brokerBars?.length) {
      const key = cacheKey(sym, timeframe, 'broker');
      cache.set(key, brokerBars);
      return {
        bars: brokerBars,
        symbol: sym,
        timeframe,
        source: 'broker',
        lastUpdate: new Date().toISOString(),
      };
    }
  }

  const { bars } = await loadPlatformBarsAsync(sym, timeframe);
  return {
    bars,
    symbol: sym,
    timeframe,
    source: 'platform',
    lastUpdate: new Date().toISOString(),
  };
}

/** @deprecated use patchLastBarInPlace */
export function applyLiveToBars(bars: ChartBar[], symbol: string): ChartBar[] {
  patchLastBarInPlace(bars, symbol);
  return bars;
}

export function invalidateChartCache(symbol?: string) {
  if (!symbol) {
    cache.clear();
    return;
  }
  const sym = symbol.toUpperCase();
  for (const key of cache.keys()) {
    if (key.includes(`:${sym}:`)) cache.delete(key);
  }
}

/** Pre-warm Fyers OHLC for popular symbols */
export function prewarmChartCache(symbols: string[], timeframe: ChartTimeframe = '15m') {
  symbols.forEach((s) => {
    void loadPlatformBarsAsync(s, timeframe);
  });
}
