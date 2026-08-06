/**
 * TradingView-grade Fibonacci geometry, paint, and hit-testing.
 * Price mapping uses linear scale through the drawing anchors (matches TV on linear charts).
 */

import {
  type Drawing,
  type Pixel,
  distanceToSegment,
} from './chartDrawings';

export type FibLevel = {
  ratio: number;
  color: string;
  /** Emphasize golden / key levels. */
  emphasis?: boolean;
};

/** Classic TV-style retracement levels (0→1) with distinct colors. */
export const FIB_RETRACE_LEVELS: readonly FibLevel[] = [
  { ratio: 0, color: '#787b86' },
  { ratio: 0.236, color: '#f23645' },
  { ratio: 0.382, color: '#ff9800' },
  { ratio: 0.5, color: '#4caf50' },
  { ratio: 0.618, color: '#089981', emphasis: true },
  { ratio: 0.65, color: '#26a69a' },
  { ratio: 0.786, color: '#2962ff' },
  { ratio: 1, color: '#7b1fa2', emphasis: true },
] as const;

/** Trend-based Fib Extension — internal + external targets. */
export const FIB_EXTENSION_LEVELS: readonly FibLevel[] = [
  { ratio: 0, color: '#787b86' },
  { ratio: 0.236, color: '#f23645' },
  { ratio: 0.382, color: '#ff9800' },
  { ratio: 0.5, color: '#4caf50' },
  { ratio: 0.618, color: '#089981', emphasis: true },
  { ratio: 1, color: '#2962ff', emphasis: true },
  { ratio: 1.272, color: '#e91e63' },
  { ratio: 1.414, color: '#ab47bc' },
  { ratio: 1.618, color: '#f23645', emphasis: true },
  { ratio: 2, color: '#ff9800' },
  { ratio: 2.618, color: '#089981' },
  { ratio: 3.618, color: '#787b86' },
] as const;

/** Time / circle / fan ratios (include mild extension past 1). */
export const FIB_TIME_LEVELS: readonly FibLevel[] = [
  { ratio: 0, color: '#787b86' },
  { ratio: 0.236, color: '#f23645' },
  { ratio: 0.382, color: '#ff9800' },
  { ratio: 0.5, color: '#4caf50' },
  { ratio: 0.618, color: '#089981', emphasis: true },
  { ratio: 0.786, color: '#2962ff' },
  { ratio: 1, color: '#7b1fa2', emphasis: true },
  { ratio: 1.272, color: '#e91e63' },
  { ratio: 1.618, color: '#f23645', emphasis: true },
  { ratio: 2.618, color: '#089981' },
] as const;

const FONT = '600 10px "Trebuchet MS", Roboto, Ubuntu, sans-serif';

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(41,98,255,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Map a price onto screen Y using any two anchors on a linear price scale. */
export function yFromPrice(
  price: number,
  a: { price: number; y: number },
  b: { price: number; y: number },
): number {
  const dp = b.price - a.price;
  if (Math.abs(dp) < 1e-12) return a.y;
  return a.y + ((price - a.price) / dp) * (b.y - a.y);
}

function labelAt(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: 'left' | 'right' = 'left',
) {
  ctx.font = FONT;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = align;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(19,23,34,0.75)';
  ctx.strokeText(text, x, y - 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y - 2);
  ctx.textAlign = 'left';
}

function fmtRatio(r: number) {
  if (Number.isInteger(r)) return r.toFixed(0);
  const s = r.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function fmtPrice(p: number) {
  if (Math.abs(p) >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(p) >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function parallelOffset(a: Pixel, b: Pixel, c: Pixel): { left: Pixel; right: Pixel } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular projection of C onto AB's normal.
  const t = ((c.x - a.x) * -dy + (c.y - a.y) * dx) / (len * len);
  const ox = -dy * t;
  const oy = dx * t;
  return {
    left: { x: a.x + ox, y: a.y + oy },
    right: { x: b.x + ox, y: b.y + oy },
  };
}

function lerp(a: Pixel, b: Pixel, t: number): Pixel {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * TradingView Style → Extend Lines Left / Right.
 * Default = levels only between the drawing's time span (anchor min/max X).
 */
function levelSpanX(
  drawing: Drawing,
  anchorXs: number[],
  paneWidth: number,
  pad = 0,
): { x0: number; x1: number } {
  const xs = anchorXs.filter((x) => Number.isFinite(x));
  if (!xs.length) return { x0: 0, x1: paneWidth };
  let x0 = Math.min(...xs) - pad;
  let x1 = Math.max(...xs) + pad;
  // Tiny span while placing — keep a readable minimum width.
  if (x1 - x0 < 12) {
    const mid = (x0 + x1) / 2;
    x0 = mid - 6;
    x1 = mid + 6;
  }
  if (drawing.extendLeft) x0 = 0;
  if (drawing.extendRight) x1 = paneWidth;
  return { x0, x1 };
}

function strokeLevel(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  level: FibLevel,
  selected: boolean,
) {
  ctx.strokeStyle = level.color;
  ctx.lineWidth = (level.emphasis ? 2 : 1.35) + (selected ? 0.6 : 0);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Fibonacci Retracement — TV look with per-level color, band fill, trend, labels. */
export function paintFibRetrace(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  px: Pixel[],
  paneWidth: number,
  selected: boolean,
) {
  if (px.length < 2 || drawing.points.length < 2) return;
  const p0 = drawing.points[0];
  const p1 = drawing.points[1];
  // Default TV: levels span only between the two click points (not full chart).
  const { x0, x1 } = levelSpanX(drawing, [px[0].x, px[1].x], paneWidth);
  const priceSpan = p1.price - p0.price;

  // Soft band fills between consecutive levels.
  for (let i = 1; i < FIB_RETRACE_LEVELS.length; i += 1) {
    const a = FIB_RETRACE_LEVELS[i - 1];
    const b = FIB_RETRACE_LEVELS[i];
    const yA = yFromPrice(p0.price + priceSpan * a.ratio, { price: p0.price, y: px[0].y }, { price: p1.price, y: px[1].y });
    const yB = yFromPrice(p0.price + priceSpan * b.ratio, { price: p0.price, y: px[0].y }, { price: p1.price, y: px[1].y });
    ctx.fillStyle = hexAlpha(b.color, 0.07);
    ctx.fillRect(x0, Math.min(yA, yB), x1 - x0, Math.abs(yB - yA));
  }

  // Diagonal trend (dashed) — only the drawn segment.
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = hexAlpha('#d1d4dc', 0.55);
  ctx.lineWidth = selected ? 1.4 : 1;
  ctx.beginPath();
  ctx.moveTo(px[0].x, px[0].y);
  ctx.lineTo(px[1].x, px[1].y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const level of FIB_RETRACE_LEVELS) {
    const price = p0.price + priceSpan * level.ratio;
    const y = yFromPrice(price, { price: p0.price, y: px[0].y }, { price: p1.price, y: px[1].y });
    strokeLevel(ctx, x0, y, x1, y, level, selected);
    labelAt(
      ctx,
      `${fmtRatio(level.ratio)} (${(level.ratio * 100).toFixed(1)}%)  ${fmtPrice(price)}`,
      x1 - 4,
      y,
      level.color,
      'right',
    );
  }
}

/** Trend-Based Fib Extension — A→B impulse, project from C. */
export function paintFibExtension(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  px: Pixel[],
  paneWidth: number,
  selected: boolean,
) {
  if (px.length < 3 || drawing.points.length < 3) return;
  const [A, B, C] = drawing.points;
  const [a, b, c] = px;
  const impulse = B.price - A.price;
  const scale = { price: A.price, y: a.y };
  const scaleB = { price: B.price, y: b.y };

  // Impulse + retrace legs.
  ctx.setLineDash([]);
  ctx.strokeStyle = hexAlpha('#d1d4dc', 0.7);
  ctx.lineWidth = selected ? 1.6 : 1.2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();

  // Accent dots on anchors.
  for (const p of [a, b, c]) {
    ctx.beginPath();
    ctx.fillStyle = '#2962ff';
    ctx.arc(p.x, p.y, selected ? 3.5 : 2.75, 0, Math.PI * 2);
    ctx.fill();
  }

  const xLeft = Math.min(a.x, b.x, c.x);
  const xRightAnchor = Math.max(a.x, b.x, c.x);
  // TV: project bands from C across the tool's own time span (not full pane).
  const { x0, x1 } = levelSpanX(drawing, [xLeft, xRightAnchor], paneWidth);
  const bandStart = Math.min(c.x, x1);
  const bandEnd = Math.max(c.x, x1);

  for (let i = 1; i < FIB_EXTENSION_LEVELS.length; i += 1) {
    const prev = FIB_EXTENSION_LEVELS[i - 1];
    const level = FIB_EXTENSION_LEVELS[i];
    const y0 = yFromPrice(C.price + impulse * prev.ratio, scale, scaleB);
    const y1 = yFromPrice(C.price + impulse * level.ratio, scale, scaleB);
    ctx.fillStyle = hexAlpha(level.color, 0.06);
    ctx.fillRect(bandStart, Math.min(y0, y1), Math.max(1, bandEnd - bandStart), Math.abs(y1 - y0));
  }

  for (const level of FIB_EXTENSION_LEVELS) {
    const price = C.price + impulse * level.ratio;
    const y = yFromPrice(price, scale, scaleB);
    strokeLevel(ctx, x0, y, x1, y, level, selected);
    labelAt(
      ctx,
      `${fmtRatio(level.ratio)}  ${fmtPrice(price)}`,
      x1 - 4,
      y,
      level.color,
      'right',
    );
  }
}

/** Fib Time Zones — verticals at fib ratios of the base span (full pane height, like TV). */
export function paintFibTime(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  paneHeight: number,
  selected: boolean,
  trendBased = false,
) {
  if (px.length < 2) return;
  const origin = trendBased && px.length >= 3 ? px[2] : px[0];
  const dx = px[1].x - px[0].x;

  // Base span guide — only the two placed anchors (not every projected ratio edge).
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = hexAlpha('#d1d4dc', 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px[0].x, 0);
  ctx.lineTo(px[0].x, paneHeight);
  ctx.moveTo(px[1].x, 0);
  ctx.lineTo(px[1].x, paneHeight);
  if (trendBased && px[2]) {
    ctx.moveTo(px[2].x, 0);
    ctx.lineTo(px[2].x, paneHeight);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const level of FIB_TIME_LEVELS) {
    const x = origin.x + dx * level.ratio;
    strokeLevel(ctx, x, 0, x, paneHeight, level, selected);
    labelAt(ctx, fmtRatio(level.ratio), x + 3, 14, level.color, 'left');
  }
}

/** Fib Channel — parallels at fib ratios between base and offset. */
export function paintFibChannel(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  selected: boolean,
) {
  if (px.length < 3) return;
  const { left, right } = parallelOffset(px[0], px[1], px[2]);
  // Fill band.
  ctx.beginPath();
  ctx.moveTo(px[0].x, px[0].y);
  ctx.lineTo(px[1].x, px[1].y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8,153,129,0.06)';
  ctx.fill();

  for (const level of FIB_RETRACE_LEVELS) {
    const a = lerp(px[0], left, level.ratio);
    const b = lerp(px[1], right, level.ratio);
    strokeLevel(ctx, a.x, a.y, b.x, b.y, level, selected);
  }
}

/** Fib Circles — concentric rings with soft fills. */
export function paintFibCircles(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  selected: boolean,
) {
  if (px.length < 2) return;
  const cx = px[0].x;
  const cy = px[0].y;
  const r0 = Math.max(2, Math.hypot(px[1].x - cx, px[1].y - cy));
  // Radius vector guide.
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = hexAlpha('#d1d4dc', 0.5);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(px[1].x, px[1].y);
  ctx.stroke();
  ctx.setLineDash([]);

  const levels = FIB_TIME_LEVELS.filter((l) => l.ratio > 0);
  for (let i = levels.length - 1; i >= 0; i -= 1) {
    const level = levels[i];
    const r = r0 * level.ratio;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hexAlpha(level.color, 0.04);
    ctx.fill();
    ctx.strokeStyle = level.color;
    ctx.lineWidth = (level.emphasis ? 2 : 1.3) + (selected ? 0.5 : 0);
    ctx.stroke();
  }
}

/**
 * Fib Spiral — logarithmic golden spiral (φ growth per quarter-turn).
 */
export function paintFibSpiral(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  selected: boolean,
) {
  if (px.length < 2) return;
  const cx = px[0].x;
  const cy = px[0].y;
  const a0 = Math.max(2, Math.hypot(px[1].x - cx, px[1].y - cy) * 0.15);
  const ang0 = Math.atan2(px[1].y - cy, px[1].x - cx);
  const phi = 1.618033988749895;
  const b = Math.log(phi) / (Math.PI / 2);
  ctx.strokeStyle = '#089981';
  ctx.lineWidth = selected ? 2.2 : 1.7;
  ctx.beginPath();
  let started = false;
  for (let t = 0; t <= Math.PI * 6; t += 0.04) {
    const r = a0 * Math.exp(b * t);
    const x = cx + Math.cos(ang0 + t) * r;
    const y = cy + Math.sin(ang0 + t) * r;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = hexAlpha('#2962ff', 0.55);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(px[1].x, px[1].y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.fillStyle = '#2962ff';
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Fib Speed Resistance Fan — rays through fib height ratios of the box. */
export function paintFibSpeedFan(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  selected: boolean,
) {
  if (px.length < 2) return;
  const o = px[0];
  const tip = px[1];
  const dx = tip.x - o.x;
  const dy = tip.y - o.y;
  // Box outline.
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = hexAlpha('#d1d4dc', 0.4);
  ctx.strokeRect(
    Math.min(o.x, tip.x),
    Math.min(o.y, tip.y),
    Math.abs(dx),
    Math.abs(dy),
  );
  ctx.setLineDash([]);

  for (const level of FIB_RETRACE_LEVELS) {
    if (level.ratio <= 0) continue;
    // Fan from origin to (full X, fib Y) and (fib X, full Y) — classic speed fan.
    const a = { x: o.x + dx, y: o.y + dy * level.ratio };
    const b = { x: o.x + dx * level.ratio, y: o.y + dy };
    strokeLevel(ctx, o.x, o.y, a.x, a.y, level, selected);
    strokeLevel(ctx, o.x, o.y, b.x, b.y, level, selected);
  }
  // Primary diagonal.
  ctx.strokeStyle = '#d1d4dc';
  ctx.lineWidth = selected ? 1.8 : 1.3;
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
}

/** Fib Speed Resistance Arcs — quarter arcs toward the second point. */
export function paintFibSpeedArcs(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  selected: boolean,
) {
  if (px.length < 2) return;
  const cx = px[0].x;
  const cy = px[0].y;
  const r0 = Math.max(2, Math.hypot(px[1].x - cx, px[1].y - cy));
  const ang = Math.atan2(px[1].y - cy, px[1].x - cx);
  const sweep = Math.PI / 2;
  for (const level of FIB_TIME_LEVELS) {
    if (level.ratio <= 0) continue;
    const r = r0 * level.ratio;
    ctx.beginPath();
    ctx.arc(cx, cy, r, ang - sweep / 2, ang + sweep / 2);
    ctx.strokeStyle = level.color;
    ctx.lineWidth = (level.emphasis ? 2 : 1.3) + (selected ? 0.5 : 0);
    ctx.stroke();
  }
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = hexAlpha('#d1d4dc', 0.5);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(px[1].x, px[1].y);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Fib Wedge — two rails (p0→p1, p0→p2) + internal fib rays. */
export function paintFibWedge(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  selected: boolean,
) {
  if (px.length < 3) return;
  const tip = px[0];
  ctx.strokeStyle = '#d1d4dc';
  ctx.lineWidth = selected ? 1.8 : 1.3;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(px[1].x, px[1].y);
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(px[2].x, px[2].y);
  ctx.stroke();
  // Fill wedge.
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(px[1].x, px[1].y);
  ctx.lineTo(px[2].x, px[2].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8,153,129,0.07)';
  ctx.fill();

  for (const level of FIB_RETRACE_LEVELS) {
    if (level.ratio <= 0 || level.ratio >= 1) continue;
    const a = lerp(tip, px[1], level.ratio);
    const b = lerp(tip, px[2], level.ratio);
    strokeLevel(ctx, a.x, a.y, b.x, b.y, level, selected);
  }
}

/** Hit distance for fib family against painted geometry. */
export function hitFibDrawing(at: Pixel, drawing: Drawing, px: Pixel[], paneWidth: number, paneHeight: number): number {
  const kind = drawing.kind;
  if (!px.length) return Infinity;

  if (kind === 'fib' && px.length >= 2 && drawing.points.length >= 2) {
    const p0 = drawing.points[0];
    const p1 = drawing.points[1];
    const priceSpan = p1.price - p0.price;
    const { x0, x1 } = levelSpanX(drawing, [px[0].x, px[1].x], paneWidth, 10);
    return FIB_RETRACE_LEVELS.reduce((best, level) => {
      const price = p0.price + priceSpan * level.ratio;
      const y = yFromPrice(price, { price: p0.price, y: px[0].y }, { price: p1.price, y: px[1].y });
      const gap = at.x >= x0 && at.x <= x1 ? Math.abs(at.y - y) : Infinity;
      return Math.min(best, gap, distanceToSegment(at, px[0], px[1]));
    }, Infinity);
  }

  if (kind === 'fibExt' && px.length >= 3 && drawing.points.length >= 3) {
    const [A, B, C] = drawing.points;
    const impulse = B.price - A.price;
    const scale = { price: A.price, y: px[0].y };
    const scaleB = { price: B.price, y: px[1].y };
    const { x0, x1 } = levelSpanX(
      drawing,
      [px[0].x, px[1].x, px[2].x],
      paneWidth,
      10,
    );
    const leg = Math.min(
      distanceToSegment(at, px[0], px[1]),
      distanceToSegment(at, px[1], px[2]),
    );
    const levels = FIB_EXTENSION_LEVELS.reduce((best, level) => {
      const y = yFromPrice(C.price + impulse * level.ratio, scale, scaleB);
      const gap = at.x >= x0 && at.x <= x1 ? Math.abs(at.y - y) : Infinity;
      return Math.min(best, gap);
    }, Infinity);
    return Math.min(leg, levels);
  }

  if ((kind === 'fibTime' || kind === 'fibTrendTime') && px.length >= 2) {
    const origin = kind === 'fibTrendTime' && px.length >= 3 ? px[2] : px[0];
    const dx = px[1].x - px[0].x;
    return FIB_TIME_LEVELS.reduce((best, level) => {
      const x = origin.x + dx * level.ratio;
      const gap =
        at.y >= 0 && at.y <= paneHeight ? Math.abs(at.x - x) : Infinity;
      return Math.min(best, gap);
    }, Infinity);
  }

  if (kind === 'fibChan' && px.length >= 3) {
    const { left, right } = parallelOffset(px[0], px[1], px[2]);
    return FIB_RETRACE_LEVELS.reduce((best, level) => {
      const a = lerp(px[0], left, level.ratio);
      const b = lerp(px[1], right, level.ratio);
      return Math.min(best, distanceToSegment(at, a, b));
    }, Infinity);
  }

  if (kind === 'fibCircles' || kind === 'fibSpeedArcs') {
    if (px.length < 2) return Infinity;
    const cx = px[0].x;
    const cy = px[0].y;
    const r0 = Math.hypot(px[1].x - cx, px[1].y - cy);
    const dist = Math.hypot(at.x - cx, at.y - cy);
    return FIB_TIME_LEVELS.filter((l) => l.ratio > 0).reduce(
      (best, level) => Math.min(best, Math.abs(dist - r0 * level.ratio)),
      Infinity,
    );
  }

  if (kind === 'fibSpiral' && px.length >= 2) {
    // Approximate: near radius vector or expanding ring corridor.
    return Math.min(
      distanceToSegment(at, px[0], px[1]),
      Math.abs(Math.hypot(at.x - px[0].x, at.y - px[0].y) - Math.hypot(px[1].x - px[0].x, px[1].y - px[0].y) * 0.5),
    );
  }

  if (kind === 'fibSpeed' && px.length >= 2) {
    const o = px[0];
    const tip = px[1];
    const dx = tip.x - o.x;
    const dy = tip.y - o.y;
    return FIB_RETRACE_LEVELS.filter((l) => l.ratio > 0).reduce((best, level) => {
      const a = { x: o.x + dx, y: o.y + dy * level.ratio };
      const b = { x: o.x + dx * level.ratio, y: o.y + dy };
      return Math.min(best, distanceToSegment(at, o, a), distanceToSegment(at, o, b));
    }, distanceToSegment(at, o, tip));
  }

  if (kind === 'fibWedge' && px.length >= 3) {
    const tip = px[0];
    let best = Math.min(
      distanceToSegment(at, tip, px[1]),
      distanceToSegment(at, tip, px[2]),
    );
    for (const level of FIB_RETRACE_LEVELS) {
      if (level.ratio <= 0 || level.ratio >= 1) continue;
      best = Math.min(
        best,
        distanceToSegment(at, lerp(tip, px[1], level.ratio), lerp(tip, px[2], level.ratio)),
      );
    }
    return best;
  }

  return Infinity;
}

/** True when this kind is handled by the fib paint module. */
export function isFibPaintKind(kind: string): boolean {
  return (
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
  );
}

export function paintFibKind(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  px: Pixel[],
  paneWidth: number,
  paneHeight: number,
  selected: boolean,
): boolean {
  const kind = drawing.kind;
  if (!isFibPaintKind(kind)) return false;

  // While placing (incomplete anchors), still show a live guide.
  if (kind === 'fibExt' && px.length === 2) {
    ctx.strokeStyle = hexAlpha('#d1d4dc', 0.85);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.stroke();
    ctx.setLineDash([]);
    return true;
  }
  if (kind === 'fibTrendTime' && px.length === 2) {
    paintFibTime(ctx, px, paneHeight, selected, false);
    return true;
  }
  if ((kind === 'fibChan' || kind === 'fibWedge') && px.length === 2) {
    ctx.strokeStyle = hexAlpha('#d1d4dc', 0.85);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.stroke();
    ctx.setLineDash([]);
    return true;
  }

  if (kind === 'fib') paintFibRetrace(ctx, drawing, px, paneWidth, selected);
  else if (kind === 'fibExt') paintFibExtension(ctx, drawing, px, paneWidth, selected);
  else if (kind === 'fibTime') paintFibTime(ctx, px, paneHeight, selected, false);
  else if (kind === 'fibTrendTime') paintFibTime(ctx, px, paneHeight, selected, true);
  else if (kind === 'fibChan') paintFibChannel(ctx, px, selected);
  else if (kind === 'fibCircles') paintFibCircles(ctx, px, selected);
  else if (kind === 'fibSpiral') paintFibSpiral(ctx, px, selected);
  else if (kind === 'fibSpeed') paintFibSpeedFan(ctx, px, selected);
  else if (kind === 'fibSpeedArcs') paintFibSpeedArcs(ctx, px, selected);
  else if (kind === 'fibWedge') paintFibWedge(ctx, px, selected);
  return true;
}
