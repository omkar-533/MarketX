/**
 * Hand-drawn chart objects (trend lines, boxes, fib) for the native chart.
 *
 * Points are stored as {time, price} rather than pixels or bar indexes so a
 * drawing survives a data refresh, a timeframe redraw and a page reload.
 */

import type { ChartBar } from '../../types/chart';

export type DrawingKind = 'trend' | 'ray' | 'hline' | 'vline' | 'rect' | 'fib';
export type DrawingTool = 'cursor' | DrawingKind;

export interface DrawPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: DrawPoint[];
  color: string;
}

/** How many points the user has to place before the shape is finished. */
export const POINTS_NEEDED: Record<DrawingKind, number> = {
  trend: 2,
  ray: 2,
  hline: 1,
  vline: 1,
  rect: 2,
  fib: 2,
};

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const DRAW_COLOR = '#2962ff';

const MAX_DRAWINGS = 60;
const STORE_PREFIX = 'wolf.chart.drawings.';

/** Keyed by instrument only, so a trend line survives a timeframe switch. */
export function drawingsKey(symbol: string): string {
  return `${STORE_PREFIX}${symbol.toUpperCase()}`;
}

function isPoint(raw: unknown): raw is DrawPoint {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as Record<string, unknown>;
  return Number.isFinite(Number(p.time)) && Number.isFinite(Number(p.price));
}

export function loadDrawings(key: string): Drawing[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((d): d is Drawing => {
        if (!d || typeof d !== 'object') return false;
        const shape = d as Record<string, unknown>;
        const kind = String(shape.kind) as DrawingKind;
        if (!(kind in POINTS_NEEDED)) return false;
        return Array.isArray(shape.points) && shape.points.length > 0 && shape.points.every(isPoint);
      })
      .slice(0, MAX_DRAWINGS);
  } catch {
    return [];
  }
}

export function saveDrawings(key: string, drawings: Drawing[]): void {
  try {
    if (!drawings.length) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(drawings.slice(-MAX_DRAWINGS)));
  } catch {
    /* private mode / quota — drawings simply do not persist */
  }
}

export function newDrawingId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Bar index for a timestamp, fractional between bars and extrapolated past
 * both ends so a shape can be dragged into empty space on the right.
 */
export function timeToLogical(bars: ChartBar[], time: number): number {
  const n = bars.length;
  if (!n) return 0;
  const step = n > 1 ? (bars[n - 1].time - bars[0].time) / (n - 1) : 60;
  if (time <= bars[0].time) return (time - bars[0].time) / step;
  if (time >= bars[n - 1].time) return n - 1 + (time - bars[n - 1].time) / step;

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const span = bars[hi].time - bars[lo].time || 1;
  return lo + (time - bars[lo].time) / span;
}

/** Inverse of timeToLogical, so a pixel position becomes a storable time. */
export function logicalToTime(bars: ChartBar[], logical: number): number {
  const n = bars.length;
  if (!n) return 0;
  const step = n > 1 ? (bars[n - 1].time - bars[0].time) / (n - 1) : 60;
  if (logical <= 0) return Math.round(bars[0].time + logical * step);
  if (logical >= n - 1) return Math.round(bars[n - 1].time + (logical - (n - 1)) * step);

  const lo = Math.floor(logical);
  const frac = logical - lo;
  const next = bars[Math.min(lo + 1, n - 1)].time;
  return Math.round(bars[lo].time + (next - bars[lo].time) * frac);
}

/** Nearest OHLC value on the bar under the cursor — TradingView's magnet. */
export function snapToBar(bars: ChartBar[], logical: number, price: number): number {
  const bar = bars[Math.round(logical)];
  if (!bar) return price;
  const candidates = [bar.open, bar.high, bar.low, bar.close];
  let best = price;
  let bestGap = Infinity;
  for (const value of candidates) {
    const gap = Math.abs(value - price);
    if (gap < bestGap) {
      bestGap = gap;
      best = value;
    }
  }
  return best;
}

export interface Pixel {
  x: number;
  y: number;
}

export function distanceToSegment(p: Pixel, a: Pixel, b: Pixel): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (!lenSq) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToRect(p: Pixel, a: Pixel, b: Pixel): number {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  const inside = p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (inside) return 0;
  const dx = Math.max(left - p.x, 0, p.x - right);
  const dy = Math.max(top - p.y, 0, p.y - bottom);
  return Math.hypot(dx, dy);
}
