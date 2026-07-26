import { fetchMarketOhlc } from './marketApiService';
import { barsFromOhlc, computeTechnicalsFromBars } from './screenerIndicators';
import type { BarHistory } from './screenerHistory';
import type { ScreenerMarketRow } from './screenerDataService';

/** Candle sizes offered on the Scanners page. */
export type ScanTimeframe = '5m' | '15m' | '1h' | '1d';

export const SCAN_TIMEFRAMES: { id: ScanTimeframe; label: string }[] = [
  { id: '5m', label: '5 min' },
  { id: '15m', label: '15 min' },
  { id: '1h', label: '1 hour' },
  { id: '1d', label: '1 day' },
];

/** Fresh candles matter more on fast timeframes; slow ones can ride the cache. */
const TTL_MS: Record<ScanTimeframe, number> = {
  '5m': 90_000,
  '15m': 180_000,
  '1h': 600_000,
  '1d': 480_000,
};

/** Fyers history depth is per resolution, so only the daily pull asks for a range. */
const RANGE: Partial<Record<ScanTimeframe, string>> = { '1d': '6mo' };

const BATCH_MAX = 45;
const CONCURRENCY = 3;
const MOVERS_HEAD = 18;

type Entry = { bars: BarHistory; at: number };

const cache = new Map<string, Entry>();
const rotateOffset = new Map<ScanTimeframe, number>();
const inFlight = new Map<ScanTimeframe, Promise<number>>();

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeTimeframeFeed(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function key(tf: ScanTimeframe, symbol: string) {
  return `${tf}|${symbol}`;
}

/** How many symbols currently hold usable candles on this timeframe. */
export function timeframeCoverage(tf: ScanTimeframe): number {
  let n = 0;
  for (const k of cache.keys()) if (k.startsWith(`${tf}|`)) n += 1;
  return n;
}

function pickSymbols(rows: ScreenerMarketRow[], tf: ScanTimeframe): string[] {
  if (!rows.length) return [];

  const sorted = [...rows].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent) || b.volume - a.volume,
  );
  const head = sorted.slice(0, MOVERS_HEAD).map((r) => r.symbol);

  const offset = rotateOffset.get(tf) ?? 0;
  const rotated: string[] = [];
  for (let i = 0; i < BATCH_MAX; i++) {
    rotated.push(sorted[(offset + i) % sorted.length].symbol);
  }
  rotateOffset.set(tf, (offset + BATCH_MAX) % sorted.length);

  return [...new Set([...head, ...rotated])];
}

async function loadSymbol(symbol: string, tf: ScanTimeframe, force: boolean): Promise<boolean> {
  const cached = cache.get(key(tf, symbol));
  if (!force && cached && Date.now() - cached.at < TTL_MS[tf]) return true;

  const res = await fetchMarketOhlc(symbol, tf, RANGE[tf]);
  if (!res?.bars?.length) return false;

  cache.set(key(tf, symbol), { bars: barsFromOhlc(res.bars), at: Date.now() });
  return true;
}

/**
 * Tops up the candle cache for the selected timeframe. Movers go first and the
 * rest rotates, so the whole F&O list is covered across successive refreshes
 * without hammering the history API on every render.
 */
export async function ensureTimeframeBars(
  rows: ScreenerMarketRow[],
  tf: ScanTimeframe,
  opts?: { force?: boolean },
): Promise<number> {
  const running = inFlight.get(tf);
  if (running) return running;

  const job = (async () => {
    const symbols = pickSymbols(rows, tf);
    if (!symbols.length) return timeframeCoverage(tf);

    const queue = [...symbols];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const symbol = queue.shift();
        if (!symbol) break;
        try {
          await loadSymbol(symbol, tf, Boolean(opts?.force));
        } catch {
          /* one bad symbol must not stall the batch */
        }
      }
    });

    await Promise.all(workers);
    notify();
    return timeframeCoverage(tf);
  })().finally(() => {
    inFlight.delete(tf);
  });

  inFlight.set(tf, job);
  return job;
}

export interface TfMetrics {
  timeframe: ScanTimeframe;
  barCount: number;
  close: number;
  ema9: number;
  ema20: number;
  ema50: number;
  sma20: number;
  sma50: number;
  rsi14: number;
  macdHist: number;
  bbPercentB: number;
  high20: number;
  low20: number;
  /** Distance to the 20-bar extremes, in percent. */
  toHigh20: number;
  toLow20: number;
  avgVolume: number;
  barVolume: number;
  volumeRatio: number;
  /** Percent move across the last five candles. */
  momentum: number;
  /** Percent move on the closing candle. */
  changePct: number;
  /** Latest candle range as a percent of price. */
  rangePct: number;
  /** Latest range against the prior twenty — under 1 means the tape is coiling. */
  compression: number;
  bodyRatio: number;
  upperWick: number;
  lowerWick: number;
}

function pct(from: number, to: number) {
  if (!from) return 0;
  return ((to - from) / Math.abs(from)) * 100;
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Candle-derived view of one symbol on the selected timeframe. */
export function metricsFor(symbol: string, tf: ScanTimeframe): TfMetrics | null {
  const entry = cache.get(key(tf, symbol));
  if (!entry) return null;

  const { open, high, low, close, volume } = entry.bars;
  const n = close.length;
  if (n < 25) return null;

  const tech = computeTechnicalsFromBars(entry.bars);
  if (!tech) return null;

  const c = close[n - 1];
  const o = open[n - 1];
  const h = high[n - 1];
  const l = low[n - 1];
  const barVolume = volume[n - 1] ?? 0;

  const recentRanges = high.slice(-5).map((hi, i) => hi - low.slice(-5)[i]);
  const priorRanges = high.slice(-25, -5).map((hi, i) => hi - low.slice(-25, -5)[i]);
  const priorAvgRange = mean(priorRanges);

  const range = Math.max(h - l, 0.0001);
  const body = Math.abs(c - o);

  return {
    timeframe: tf,
    barCount: n,
    close: c,
    ema9: tech.ema9,
    ema20: tech.ema20,
    ema50: tech.ema50,
    sma20: tech.sma20,
    sma50: tech.sma50,
    rsi14: tech.rsi14,
    macdHist: tech.macdHist,
    bbPercentB: tech.bbPercentB,
    high20: tech.maxHigh20,
    low20: tech.minLow20,
    toHigh20: pct(c, tech.maxHigh20),
    toLow20: pct(c, tech.minLow20),
    avgVolume: tech.avgVolume,
    barVolume,
    volumeRatio: tech.avgVolume > 0 ? barVolume / tech.avgVolume : 0,
    momentum: pct(close[n - 6] ?? close[0], c),
    changePct: pct(close[n - 2] ?? o, c),
    rangePct: (range / Math.max(c, 0.0001)) * 100,
    compression: priorAvgRange > 0 ? mean(recentRanges) / priorAvgRange : 1,
    bodyRatio: body / range,
    upperWick: (h - Math.max(c, o)) / range,
    lowerWick: (Math.min(c, o) - l) / range,
  };
}
