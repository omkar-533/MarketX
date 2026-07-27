import type { ScreenerMarketRow } from './screenerDataService';
import { metricsFor, type ScanTimeframe, type TfMetrics } from './screenerTimeframeFeed';

/**
 * The five headline scans. Only this public shape reaches the UI — the entry
 * conditions below stay inside this module and are never rendered on screen.
 */
export interface TradefinderScreener {
  id: string;
  name: string;
  tagline: string;
  points: string[];
}

export type ScanDirection = 'bullish' | 'bearish';

export interface ScanHit {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  direction: ScanDirection;
  /** 0-100 conviction, already normalised across scans. */
  strength: number;
}

export interface ScanResult {
  screener: TradefinderScreener;
  hits: ScanHit[];
}

interface Ctx {
  row: ScreenerMarketRow;
  m: TfMetrics;
  /** Scales move thresholds so a 5-minute candle is not judged like a daily one. */
  k: number;
}

interface ScanDef extends TradefinderScreener {
  match: (c: Ctx) => boolean;
  direction: (c: Ctx) => ScanDirection;
  score: (c: Ctx) => number;
}

const TF_WEIGHT: Record<ScanTimeframe, number> = {
  '5m': 0.35,
  '15m': 0.6,
  '1h': 1,
  '1d': 2,
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const upTrend = (m: TfMetrics) => m.close > m.ema20 && m.ema20 >= m.ema50;
const downTrend = (m: TfMetrics) => m.close < m.ema20 && m.ema20 <= m.ema50;

const SCANS: ScanDef[] = [
  {
    id: 'insider-strategy',
    name: 'Insider Strategy',
    tagline: 'Trade without confusion',
    points: ['Premium backtested strategies', 'Defined entry & exit criteria'],
    match: ({ row, m, k }) =>
      m.volumeRatio >= 1.35 &&
      Math.abs(row.oiChange) >= 1.5 &&
      m.bodyRatio >= 0.45 &&
      Math.abs(m.momentum) >= 0.5 * k &&
      ((upTrend(m) && m.macdHist > 0 && row.oiChange > 0) ||
        (downTrend(m) && m.macdHist < 0 && row.oiChange > 0) ||
        (upTrend(m) && m.momentum > 1.2 * k && row.oiChange < 0)),
    direction: ({ m }) => (upTrend(m) ? 'bullish' : 'bearish'),
    score: ({ row, m, k }) =>
      clamp(
        34 +
          Math.min(22, m.volumeRatio * 8) +
          Math.min(20, Math.abs(row.oiChange) * 1.6) +
          Math.min(16, (Math.abs(m.momentum) / Math.max(k, 0.1)) * 4) +
          Math.min(10, Math.abs(m.macdHist) * 6),
      ),
  },
  {
    id: 'swing-spectrum',
    name: 'Swing Spectrum',
    tagline: 'Find BO stocks & reversal stocks',
    points: ['Catch breakouts early', 'Spot exhausted moves turning'],
    match: ({ m, k }) => {
      const breakingOut = m.toHigh20 >= -1.4 && m.volumeRatio >= 1.15 && m.momentum > 0.4 * k;
      const breakingDown = m.toLow20 <= 1.4 && m.volumeRatio >= 1.15 && m.momentum < -0.4 * k;
      const coiled = m.compression <= 0.9;
      const bullReversal = m.rsi14 <= 38 && m.lowerWick >= 0.38 && m.close > m.low20;
      const bearReversal = m.rsi14 >= 68 && m.upperWick >= 0.38 && m.close < m.high20;
      return (coiled && (breakingOut || breakingDown)) || breakingOut || breakingDown || bullReversal || bearReversal;
    },
    direction: ({ m }) => {
      if (m.rsi14 <= 38 && m.lowerWick >= 0.38) return 'bullish';
      if (m.rsi14 >= 68 && m.upperWick >= 0.38) return 'bearish';
      return m.momentum >= 0 ? 'bullish' : 'bearish';
    },
    score: ({ m, k }) =>
      clamp(
        32 +
          Math.min(24, (100 - Math.min(Math.abs(m.toHigh20), Math.abs(m.toLow20)) * 12) * 0.24) +
          Math.min(18, m.volumeRatio * 7) +
          Math.min(14, (Math.abs(m.momentum) / Math.max(k, 0.1)) * 3.5) +
          (m.compression <= 0.9 ? 10 : 0),
      ),
  },
  {
    id: 'option-clock',
    name: 'Option Clock',
    tagline: 'Know institutional positions',
    points: ['Hold winning trades', 'Avoid false breakouts'],
    match: ({ row, m, k }) =>
      row.oi > 0 &&
      row.oiChange <= -1.5 &&
      m.volumeRatio >= 0.95 &&
      ((row.changePercent > 0.3 && m.close > m.ema9 && m.momentum > 0.2 * k) ||
        (row.changePercent < -0.3 && m.close < m.ema9 && m.momentum < -0.2 * k)),
    direction: ({ row }) => (row.changePercent > 0 ? 'bullish' : 'bearish'),
    score: ({ row, m, k }) =>
      clamp(
        36 +
          Math.min(26, Math.abs(row.oiChange) * 2) +
          Math.min(20, Math.abs(row.changePercent) * 6) +
          Math.min(12, (Math.abs(m.momentum) / Math.max(k, 0.1)) * 3) +
          Math.min(8, m.volumeRatio * 4),
      ),
  },
  {
    id: 'option-apex',
    name: 'Option Apex',
    tagline: 'Track big player positions',
    points: ['Identify the true trend', 'Time your entry & exit'],
    match: ({ row, m }) =>
      row.oi > 0 &&
      row.oiChange >= 2.5 &&
      ((upTrend(m) && row.changePercent > 0.2 && m.macdHist >= 0) ||
        (downTrend(m) && row.changePercent < -0.2 && m.macdHist <= 0)),
    direction: ({ m }) => (upTrend(m) ? 'bullish' : 'bearish'),
    score: ({ row, m }) =>
      clamp(
        38 +
          Math.min(28, row.oiChange * 1.8) +
          Math.min(18, Math.abs(row.changePercent) * 5) +
          Math.min(10, Math.abs(m.close - m.ema50) / Math.max(m.close, 1) * 400) +
          (m.volumeRatio >= 1.2 ? 6 : 0),
      ),
  },
  {
    id: 'market-pulse',
    name: 'Market Pulse',
    tagline: 'Find hot stocks in live market',
    points: ['Live momentum leaders', 'Volume-backed moves only'],
    match: ({ m, k }) =>
      m.volumeRatio >= 1.5 && Math.abs(m.momentum) >= 0.8 * k && m.rangePct >= 0.25 * k,
    direction: ({ m }) => (m.momentum >= 0 ? 'bullish' : 'bearish'),
    score: ({ m, k }) =>
      clamp(
        30 +
          Math.min(30, m.volumeRatio * 10) +
          Math.min(26, (Math.abs(m.momentum) / Math.max(k, 0.1)) * 6) +
          Math.min(14, m.rangePct * 5),
      ),
  },
];

/** Public catalogue — no entry rules attached. */
export const TRADEFINDER_SCREENERS: TradefinderScreener[] = SCANS.map(
  ({ id, name, tagline, points }) => ({ id, name, tagline, points }),
);

function toHit(c: Ctx, def: ScanDef): ScanHit {
  return {
    symbol: c.row.symbol,
    name: c.row.name,
    sector: c.row.sector,
    price: c.row.price,
    changePercent: c.row.changePercent,
    direction: def.direction(c),
    strength: Math.round(def.score(c)),
  };
}

function contextsFor(rows: ScreenerMarketRow[], tf: ScanTimeframe): Ctx[] {
  const k = TF_WEIGHT[tf];
  const contexts: Ctx[] = [];
  for (const row of rows) {
    if (!row.price) continue;
    const m = metricsFor(row.symbol, tf);
    if (m) contexts.push({ row, m, k });
  }
  return contexts;
}

function runDef(def: ScanDef, contexts: Ctx[], limit: number): ScanResult {
  const hits = contexts
    .filter((c) => {
      try {
        return def.match(c);
      } catch {
        return false;
      }
    })
    .map((c) => toHit(c, def))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);

  return {
    screener: { id: def.id, name: def.name, tagline: def.tagline, points: def.points },
    hits,
  };
}

/**
 * Runs every scan against the rows that already have candles on `tf`.
 * Symbols still waiting for history are skipped rather than guessed at.
 */
export function runTradefinderScans(
  rows: ScreenerMarketRow[],
  tf: ScanTimeframe,
  limit = 8,
): ScanResult[] {
  const contexts = contextsFor(rows, tf);
  return SCANS.map((def) => runDef(def, contexts, limit));
}

/** One card, its own candle size — so each screener can pick 5m / 15m / 1h independently. */
export function runTradefinderScan(
  rows: ScreenerMarketRow[],
  screenerId: string,
  tf: ScanTimeframe,
  limit = 8,
): ScanResult | null {
  const def = SCANS.find((s) => s.id === screenerId);
  if (!def) return null;
  return runDef(def, contextsFor(rows, tf), limit);
}
