/**
 * Native chart drawing model — TradingView tool catalog coverage.
 * Points are {time, price} so drawings survive TF change + reload.
 */

import type { ChartBar } from '../../types/chart';

export type DrawingKind =
  /* lines */
  | 'trend'
  | 'ray'
  | 'info'
  | 'extended'
  | 'trendAngle'
  | 'hline'
  | 'hray'
  | 'vline'
  | 'cross'
  /* channels */
  | 'parallelChannel'
  | 'regressionTrend'
  | 'flatTopBottom'
  | 'disjointChannel'
  /* pitchforks */
  | 'pitchfork'
  | 'schiff'
  | 'modSchiff'
  | 'insidePitchfork'
  /* fib / gann */
  | 'fib'
  | 'fibExt'
  | 'fibChan'
  | 'fibTime'
  | 'fibTrendTime'
  | 'fibCircles'
  | 'fibSpiral'
  | 'fibSpeed'
  | 'fibSpeedArcs'
  | 'fibWedge'
  | 'gannBox'
  | 'gannSquare'
  | 'gannSquareFixed'
  | 'gannFan'
  /* shapes */
  | 'brush'
  | 'highlighter'
  | 'rect'
  | 'rotatedRect'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'polyline'
  | 'path'
  | 'curve'
  | 'arc'
  | 'angle'
  /* annotations */
  | 'text'
  | 'anchoredText'
  | 'note'
  | 'anchoredNote'
  | 'callout'
  | 'comment'
  | 'priceLabel'
  | 'priceNote'
  | 'arrowMarker'
  | 'flag'
  | 'pin'
  | 'table'
  /* arrows */
  | 'arrow'
  | 'arrowUp'
  | 'arrowDown'
  /* patterns */
  | 'xabcd'
  | 'cypher'
  | 'headShoulders'
  | 'abcd'
  | 'trianglePattern'
  | 'threeDrives'
  /* elliott */
  | 'elliotImpulse'
  | 'elliotCorrection'
  | 'elliotTriangle'
  | 'elliotDouble'
  | 'elliotTriple'
  /* cycles */
  | 'cyclicLines'
  | 'timeCycles'
  | 'sineLine'
  /* prediction / volume / measure */
  | 'longPos'
  | 'shortPos'
  | 'forecast'
  | 'barsPattern'
  | 'ghostFeed'
  | 'sector'
  | 'anchoredVwap'
  | 'fixedRangeVp'
  | 'anchoredVp'
  | 'priceRange'
  | 'dateRange'
  | 'datePriceRange'
  | 'measure'
  /* icons */
  | 'sticker';

/** Cursor / utility tools that are not persisted drawings. */
export type UtilityTool =
  | 'cursor'
  | 'crosshair'
  | 'dot'
  | 'arrowCursor'
  | 'eraser'
  | 'zoomIn'
  | 'measureTemp';

export type DrawingTool = UtilityTool | DrawingKind;

export type MagnetMode = 'off' | 'weak' | 'strong';

export interface DrawPoint {
  time: number;
  price: number;
}

/** TradingView stroke dash presets. */
export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: DrawPoint[];
  color: string;
  label?: string;
  locked?: boolean;
  /** Stroke width in px (TV: typically 1–4). */
  lineWidth?: number;
  lineStyle?: DrawingLineStyle;
  /** Fill alpha for closed shapes (0–1). */
  fillOpacity?: number;
  /** Hidden from chart (still in object tree). Default true. */
  visible?: boolean;
  /** Extend infinite / ray lines. */
  extendLeft?: boolean;
  extendRight?: boolean;
}

export const DRAW_LINE_COLORS = [
  '#2962ff',
  '#e91e63',
  '#ff9800',
  '#089981',
  '#f23645',
  '#9c27b0',
  '#00bcd4',
  '#787b86',
  '#ffffff',
  '#131722',
] as const;

export function normalizeDrawing(raw: Drawing): Drawing {
  const lineWidth =
    typeof raw.lineWidth === 'number' && raw.lineWidth >= 1 && raw.lineWidth <= 8
      ? Math.round(raw.lineWidth * 2) / 2
      : undefined;
  const lineStyle =
    raw.lineStyle === 'dashed' || raw.lineStyle === 'dotted' || raw.lineStyle === 'solid'
      ? raw.lineStyle
      : undefined;
  const fillOpacity =
    typeof raw.fillOpacity === 'number' && raw.fillOpacity >= 0 && raw.fillOpacity <= 1
      ? raw.fillOpacity
      : undefined;
  return {
    ...raw,
    color: typeof raw.color === 'string' && raw.color ? raw.color : DRAW_COLOR,
    locked: Boolean(raw.locked),
    visible: raw.visible === false ? false : true,
    lineWidth,
    lineStyle,
    fillOpacity,
    extendLeft: Boolean(raw.extendLeft),
    extendRight: Boolean(raw.extendRight),
    label: typeof raw.label === 'string' ? raw.label : undefined,
  };
}

/** Effective stroke width for paint (selected objects get a slight bump). */
export function strokeWidthOf(drawing: Drawing, selected: boolean): number {
  const base = drawing.lineWidth ?? 1.5;
  return selected ? Math.max(base + 0.5, 2) : base;
}

export function applyLineDash(ctx: CanvasRenderingContext2D, style?: DrawingLineStyle): void {
  if (style === 'dashed') ctx.setLineDash([8, 5]);
  else if (style === 'dotted') ctx.setLineDash([2.2, 3.5]);
  else ctx.setLineDash([]);
}

/** Points to place before finish. Continuous kinds grow while dragging. */
export const POINTS_NEEDED: Record<DrawingKind, number> = {
  trend: 2,
  ray: 2,
  info: 2,
  extended: 2,
  trendAngle: 2,
  hline: 1,
  hray: 1,
  vline: 1,
  cross: 1,
  parallelChannel: 3,
  regressionTrend: 2,
  flatTopBottom: 2,
  disjointChannel: 3,
  pitchfork: 3,
  schiff: 3,
  modSchiff: 3,
  insidePitchfork: 3,
  fib: 2,
  fibExt: 3,
  fibChan: 3,
  fibTime: 2,
  fibTrendTime: 3,
  fibCircles: 2,
  fibSpiral: 2,
  fibSpeed: 2,
  fibSpeedArcs: 2,
  fibWedge: 3,
  gannBox: 2,
  gannSquare: 2,
  gannSquareFixed: 2,
  gannFan: 2,
  brush: 2,
  highlighter: 2,
  rect: 2,
  rotatedRect: 3,
  ellipse: 2,
  circle: 2,
  triangle: 3,
  polyline: 2,
  path: 2,
  curve: 3,
  arc: 3,
  angle: 3,
  text: 1,
  anchoredText: 1,
  note: 1,
  anchoredNote: 1,
  callout: 2,
  comment: 2,
  priceLabel: 1,
  priceNote: 1,
  arrowMarker: 1,
  flag: 1,
  pin: 1,
  table: 1,
  arrow: 2,
  arrowUp: 1,
  arrowDown: 1,
  xabcd: 5,
  cypher: 5,
  headShoulders: 7,
  abcd: 4,
  trianglePattern: 4,
  threeDrives: 7,
  elliotImpulse: 6,
  elliotCorrection: 4,
  elliotTriangle: 6,
  elliotDouble: 5,
  elliotTriple: 7,
  cyclicLines: 2,
  timeCycles: 2,
  sineLine: 2,
  longPos: 3,
  shortPos: 3,
  forecast: 2,
  barsPattern: 2,
  ghostFeed: 2,
  sector: 3,
  anchoredVwap: 1,
  fixedRangeVp: 2,
  anchoredVp: 1,
  priceRange: 2,
  dateRange: 2,
  datePriceRange: 2,
  measure: 2,
  sticker: 1,
};

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.65, 0.786, 1] as const;
export const FIB_EXT_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 1, 1.272, 1.414, 1.618, 2, 2.618, 3.618] as const;
export const GANN_FAN_RATIOS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8] as const;

export const DRAW_COLOR = '#2962ff';
export const DRAW_COLOR_LONG = '#089981';
export const DRAW_COLOR_SHORT = '#f23645';
export const DRAW_COLOR_MEASURE = '#ff9800';
export const DRAW_COLOR_HIGHLIGHT = 'rgba(255, 235, 59, 0.45)';

export function isDrawingKind(tool: DrawingTool): tool is DrawingKind {
  return tool in POINTS_NEEDED;
}

export function isUtilityTool(tool: DrawingTool): tool is UtilityTool {
  return !isDrawingKind(tool);
}

export function isContinuousKind(kind: DrawingKind): boolean {
  return kind === 'brush' || kind === 'highlighter' || kind === 'polyline' || kind === 'path';
}

/** TradingView ruler — temporary, not saved to layout. */
export function isEphemeralKind(kind: DrawingKind): boolean {
  return kind === 'measure';
}

/** Tools that always release the cursor after one use (even if stay-drawing is on). */
export function alwaysReleaseCursor(kind: DrawingKind): boolean {
  return kind === 'measure';
}

export function defaultColorFor(kind: DrawingKind): string {
  if (kind === 'longPos' || kind === 'arrowUp') return DRAW_COLOR_LONG;
  if (kind === 'shortPos' || kind === 'arrowDown') return DRAW_COLOR_SHORT;
  if (
    kind === 'measure' ||
    kind === 'priceRange' ||
    kind === 'dateRange' ||
    kind === 'datePriceRange'
  ) {
    return DRAW_COLOR_MEASURE;
  }
  if (kind === 'highlighter') return DRAW_COLOR_HIGHLIGHT;
  if (
    kind === 'fib' ||
    kind === 'fibExt' ||
    kind === 'fibTime' ||
    kind === 'fibTrendTime' ||
    kind === 'fibChan' ||
    kind === 'fibCircles' ||
    kind === 'fibSpiral' ||
    kind === 'fibSpeed' ||
    kind === 'fibSpeedArcs' ||
    kind === 'fibWedge'
  ) {
    return '#089981';
  }
  if (
    kind === 'gannFan' ||
    kind === 'gannBox' ||
    kind === 'gannSquare' ||
    kind === 'gannSquareFixed'
  ) {
    return '#ff9800';
  }
  if (
    kind === 'pitchfork' ||
    kind === 'schiff' ||
    kind === 'modSchiff' ||
    kind === 'insidePitchfork'
  ) {
    return '#2962ff';
  }
  if (kind === 'anchoredVwap' || kind === 'fixedRangeVp' || kind === 'anchoredVp') {
    return '#26a69a';
  }
  return DRAW_COLOR;
}

export function defaultLabelFor(kind: DrawingKind): string | undefined {
  switch (kind) {
    case 'text':
    case 'anchoredText':
      return 'Text';
    case 'note':
    case 'anchoredNote':
      return 'Note';
    case 'callout':
      return 'Callout';
    case 'comment':
      return 'Comment';
    case 'priceLabel':
      return 'Price';
    case 'priceNote':
      return 'Note';
    case 'sticker':
      return '⭐';
    case 'flag':
      return '🚩';
    case 'pin':
      return '📌';
    case 'table':
      return 'Table';
    case 'arrowMarker':
      return '➜';
    default:
      return undefined;
  }
}

export const SHAPE_TONE = {
  bull: { line: '#26a69a', fill: 'rgba(38,166,154,0.14)' },
  bear: { line: '#ef5350', fill: 'rgba(239,83,80,0.14)' },
  neutral: { line: '#787b86', fill: 'rgba(120,123,134,0.14)' },
} as const;

const MAX_DRAWINGS = 120;
const STORE_PREFIX = 'wolf.chart.drawings.';

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
        if (typeof shape.color !== 'string' && shape.color != null) return false;
        return Array.isArray(shape.points) && shape.points.length > 0 && shape.points.every(isPoint);
      })
      .map((d) =>
        normalizeDrawing({
          ...(d as Drawing),
          id: String((d as Drawing).id || newDrawingId()),
          kind: (d as Drawing).kind,
          points: (d as Drawing).points,
          color: (d as Drawing).color || DRAW_COLOR,
        }),
      )
      .slice(0, MAX_DRAWINGS);
  } catch {
    return [];
  }
}

export function saveDrawings(key: string, drawings: Drawing[]): void {
  try {
    const persist = drawings.filter((d) => !isEphemeralKind(d.kind));
    if (!persist.length) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(persist.slice(-MAX_DRAWINGS)));
  } catch {
    /* ignore */
  }
}

/** Multi-line measure readout from two anchors. */
export function formatMeasureLabel(a: DrawPoint, b: DrawPoint, bars: ChartBar[]): string {
  const dPrice = b.price - a.price;
  const pct = a.price ? (dPrice / a.price) * 100 : 0;
  const i0 = timeToLogical(bars, a.time);
  const i1 = timeToLogical(bars, b.time);
  const nBars = Math.max(0, Math.round(Math.abs(i1 - i0)));
  const dt = Math.abs(b.time - a.time);
  let timeStr = '';
  if (dt >= 86400) {
    const d = Math.floor(dt / 86400);
    const h = Math.floor((dt % 86400) / 3600);
    timeStr = h ? `${d}d ${h}h` : `${d}d`;
  } else if (dt >= 3600) {
    const h = Math.floor(dt / 3600);
    const m = Math.floor((dt % 3600) / 60);
    timeStr = m ? `${h}h ${m}m` : `${h}h`;
  } else {
    const m = Math.max(1, Math.floor(dt / 60));
    timeStr = `${m}m`;
  }
  return `${dPrice >= 0 ? '+' : ''}${dPrice.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${nBars} bars · ${timeStr}`;
}

export function newDrawingId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

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

export function snapToBar(
  bars: ChartBar[],
  logical: number,
  price: number,
  mode: MagnetMode = 'strong',
): number {
  if (mode === 'off') return price;
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
  // Weak magnet: only snap when already close (~0.15% of price).
  if (mode === 'weak') {
    const thresh = Math.abs(price) * 0.0015 || 0.5;
    if (bestGap > thresh) return price;
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

export function distanceToEllipse(p: Pixel, a: Pixel, b: Pixel): number {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.max(1, Math.abs(b.x - a.x) / 2);
  const ry = Math.max(1, Math.abs(b.y - a.y) / 2);
  const nx = (p.x - cx) / rx;
  const ny = (p.y - cy) / ry;
  return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
}

export function distanceToPolyline(at: Pixel, pts: Pixel[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) {
    best = Math.min(best, distanceToSegment(at, pts[i - 1], pts[i]));
  }
  if (pts.length === 1) best = Math.hypot(at.x - pts[0].x, at.y - pts[0].y);
  return best;
}

/** True brush/highlighter aliases kept for older code. */
export function isBrushKind(kind: DrawingKind): boolean {
  return kind === 'brush' || kind === 'highlighter';
}
