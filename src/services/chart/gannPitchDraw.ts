/**
 * Gann + Pitchfork geometry (TradingView-grade paint & hit).
 */

import { distanceToSegment, type Pixel } from './chartDrawings';

export const GANN_RATIOS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1] as const;
export const GANN_FAN_SLOPES = [
  { n: 1, d: 8 },
  { n: 1, d: 4 },
  { n: 1, d: 3 },
  { n: 1, d: 2 },
  { n: 1, d: 1 },
  { n: 2, d: 1 },
  { n: 3, d: 1 },
  { n: 4, d: 1 },
  { n: 8, d: 1 },
] as const;

const FAR = 12;

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(255,152,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function extendRay(a: Pixel, b: Pixel, far = FAR): Pixel {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: b.x + dx * far, y: b.y + dy * far };
}

function parallelThrough(a: Pixel, b: Pixel, through: Pixel): { start: Pixel; end: Pixel } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy || 1;
  const t = ((through.x - a.x) * dx + (through.y - a.y) * dy) / lenSq;
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  const ox = through.x - proj.x;
  const oy = through.y - proj.y;
  const start = { x: a.x + ox, y: a.y + oy };
  const end = extendRay(start, { x: b.x + ox, y: b.y + oy }, FAR);
  return { start, end };
}

function pitchPivot(
  px: Pixel[],
  mode: 'pitchfork' | 'schiff' | 'modSchiff' | 'insidePitchfork',
): Pixel {
  const [a, b, c] = px;
  if (mode === 'schiff') return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (mode === 'modSchiff') {
    const midBC = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    return { x: (a.x + midBC.x) / 2, y: (a.y + midBC.y) / 2 };
  }
  if (mode === 'insidePitchfork') {
    return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  }
  return a;
}

/** Andrews / Schiff / Modified / Inside pitchfork. */
export function paintPitchforkFamily(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  mode: 'pitchfork' | 'schiff' | 'modSchiff' | 'insidePitchfork',
  color: string,
  selected: boolean,
) {
  if (px.length < 3) return;
  const pivot = pitchPivot(px, mode);
  const mid = { x: (px[1].x + px[2].x) / 2, y: (px[1].y + px[2].y) / 2 };
  const medianEnd = extendRay(pivot, mid, FAR);
  const up = parallelThrough(pivot, medianEnd, px[1]);
  const dn = parallelThrough(pivot, medianEnd, px[2]);

  // Soft channel fill between parallels.
  ctx.beginPath();
  ctx.moveTo(up.start.x, up.start.y);
  ctx.lineTo(up.end.x, up.end.y);
  ctx.lineTo(dn.end.x, dn.end.y);
  ctx.lineTo(dn.start.x, dn.start.y);
  ctx.closePath();
  ctx.fillStyle = hexAlpha(color.startsWith('#') ? color : '#2962ff', 0.06);
  ctx.fill();

  // Handle BC base.
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = hexAlpha('#d1d4dc', 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px[1].x, px[1].y);
  ctx.lineTo(px[2].x, px[2].y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Median (emphasis).
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2.2 : 1.7;
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(medianEnd.x, medianEnd.y);
  ctx.stroke();

  // Parallels.
  ctx.lineWidth = selected ? 1.8 : 1.35;
  ctx.beginPath();
  ctx.moveTo(up.start.x, up.start.y);
  ctx.lineTo(up.end.x, up.end.y);
  ctx.moveTo(dn.start.x, dn.start.y);
  ctx.lineTo(dn.end.x, dn.end.y);
  ctx.stroke();

  // Warning lines at 50% between median and each parallel.
  const warn = (side: { start: Pixel; end: Pixel }) => {
    const s = {
      x: (pivot.x + side.start.x) / 2,
      y: (pivot.y + side.start.y) / 2,
    };
    const e = {
      x: (medianEnd.x + side.end.x) / 2,
      y: (medianEnd.y + side.end.y) / 2,
    };
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = hexAlpha(color.startsWith('#') ? color : '#2962ff', 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  warn(up);
  warn(dn);

  // Anchor dots.
  for (const p of [px[0], px[1], px[2], pivot]) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(p.x, p.y, selected ? 3.2 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function hitPitchforkFamily(
  at: Pixel,
  px: Pixel[],
  mode: 'pitchfork' | 'schiff' | 'modSchiff' | 'insidePitchfork',
): number {
  if (px.length < 3) return Infinity;
  const pivot = pitchPivot(px, mode);
  const mid = { x: (px[1].x + px[2].x) / 2, y: (px[1].y + px[2].y) / 2 };
  const medianEnd = extendRay(pivot, mid, FAR);
  const up = parallelThrough(pivot, medianEnd, px[1]);
  const dn = parallelThrough(pivot, medianEnd, px[2]);
  return Math.min(
    distanceToSegment(at, pivot, medianEnd),
    distanceToSegment(at, up.start, up.end),
    distanceToSegment(at, dn.start, dn.end),
    distanceToSegment(at, px[1], px[2]),
  );
}

/** Gann Fan — slope rays (n×d) from origin through the time/price box. */
export function paintGannFan(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  color: string,
  selected: boolean,
) {
  if (px.length < 2) return;
  const o = px[0];
  const tip = px[1];
  const dx = tip.x - o.x;
  const dy = tip.y - o.y;
  const boxW = Math.abs(dx) || 1;
  const boxH = Math.abs(dy) || 1;
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;

  // Frame.
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = hexAlpha('#d1d4dc', 0.4);
  ctx.strokeRect(Math.min(o.x, tip.x), Math.min(o.y, tip.y), boxW, boxH);
  ctx.setLineDash([]);

  const colors = [
    '#f23645',
    '#ff9800',
    '#ffeb3b',
    '#4caf50',
    '#089981',
    '#26a69a',
    '#2962ff',
    '#7b1fa2',
    '#e91e63',
  ];

  GANN_FAN_SLOPES.forEach((slope, i) => {
    // Within the box: ray reaches whichever border hits first for ratio n/d.
    // price/time ≈ (n/d) scaled to box.
    const ratio = slope.n / slope.d;
    // End at full X with Y = o + dy * (dx_full mapped by ratio relative to 1×1)
    // 1x1 uses full dx,dy; 1x2 is steeper in price (half time to full price).
    let ex: number;
    let ey: number;
    if (ratio >= 1) {
      // Hits vertical side first (full X) with |dy_end| = boxH / ratio * something
      // 2x1: twice as much price per time → hits top/bottom sooner.
      ex = o.x + sx * boxW;
      ey = o.y + sy * (boxH / ratio);
      if (Math.abs(ey - o.y) > boxH) {
        ey = o.y + sy * boxH;
        ex = o.x + sx * boxW * ratio;
      }
    } else {
      ey = o.y + sy * boxH;
      ex = o.x + sx * boxW * ratio;
      if (Math.abs(ex - o.x) > boxW) {
        ex = o.x + sx * boxW;
        ey = o.y + sy * (boxH / ratio);
      }
    }
    // Extend past box.
    const end = extendRay(o, { x: ex, y: ey }, 4);
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = (slope.n === 1 && slope.d === 1 ? 2 : 1.25) + (selected ? 0.4 : 0);
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  });

  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(o.x, o.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

export function hitGannFan(at: Pixel, px: Pixel[]): number {
  if (px.length < 2) return Infinity;
  const o = px[0];
  const tip = px[1];
  const dx = tip.x - o.x;
  const dy = tip.y - o.y;
  const boxW = Math.abs(dx) || 1;
  const boxH = Math.abs(dy) || 1;
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  let best = distanceToSegment(at, o, tip);
  for (const slope of GANN_FAN_SLOPES) {
    const ratio = slope.n / slope.d;
    let ex: number;
    let ey: number;
    if (ratio >= 1) {
      ex = o.x + sx * boxW;
      ey = o.y + sy * (boxH / ratio);
    } else {
      ey = o.y + sy * boxH;
      ex = o.x + sx * boxW * ratio;
    }
    best = Math.min(best, distanceToSegment(at, o, extendRay(o, { x: ex, y: ey }, 4)));
  }
  return best;
}

/** Gann Box / Square — grid + diagonals (square locks aspect). */
export function paintGannBox(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  kind: 'gannBox' | 'gannSquare' | 'gannSquareFixed',
  selected: boolean,
) {
  if (px.length < 2) return;
  let x0 = px[0].x;
  let y0 = px[0].y;
  let x1 = px[1].x;
  let y1 = px[1].y;
  if (kind === 'gannSquare' || kind === 'gannSquareFixed') {
    const side = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    x1 = x0 + Math.sign(x1 - x0 || 1) * side;
    y1 = y0 + Math.sign(y1 - y0 || 1) * side;
  }
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bot = Math.max(y0, y1);
  const w = right - left;
  const h = bot - top;

  ctx.fillStyle = 'rgba(255,152,0,0.06)';
  ctx.fillRect(left, top, w, h);
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = selected ? 1.8 : 1.35;
  ctx.strokeRect(left, top, w, h);

  // Diagonals.
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(255,152,0,0.7)';
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, bot);
  ctx.moveTo(right, top);
  ctx.lineTo(left, bot);
  ctx.stroke();
  ctx.setLineDash([]);

  // Gann / fib grid.
  const ratios = kind === 'gannBox' ? GANN_RATIOS : ([0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] as const);
  ctx.lineWidth = 1;
  for (const r of ratios) {
    if (r <= 0 || r >= 1) continue;
    const x = left + w * r;
    const y = top + h * r;
    ctx.strokeStyle = r === 0.5 ? '#ff9800' : 'rgba(255,152,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bot);
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
}

export function isGannPitchKind(kind: string): boolean {
  return (
    kind === 'gannFan' ||
    kind === 'gannBox' ||
    kind === 'gannSquare' ||
    kind === 'gannSquareFixed' ||
    kind === 'pitchfork' ||
    kind === 'schiff' ||
    kind === 'modSchiff' ||
    kind === 'insidePitchfork'
  );
}
