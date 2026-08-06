/**
 * Callout / sector / arc / long-short position geometry (TV-grade).
 */

import { distanceToSegment, type Drawing, type Pixel } from './chartDrawings';

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(41,98,255,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function bubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts?: { maxWidth?: number; pad?: number },
) {
  const pad = opts?.pad ?? 8;
  const maxW = opts?.maxWidth ?? 180;
  ctx.font = '600 11px "Trebuchet MS", Roboto, Ubuntu, sans-serif';
  const lines = wrapText(ctx, text || 'Note', maxW - pad * 2);
  const lineH = 14;
  let tw = 0;
  for (const line of lines) tw = Math.max(tw, ctx.measureText(line).width);
  const bw = Math.max(36, tw + pad * 2);
  const bh = lines.length * lineH + pad;
  const bx = x;
  const by = y - bh / 2;
  ctx.fillStyle = hexAlpha(color.startsWith('#') ? color : '#2962ff', 0.92);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, bx + pad, by + pad / 2 + lineH * (i + 0.5));
  });
  return { bx, by, bw, bh };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Point 0 = tip, point 1 = bubble anchor (callout / comment). */
export function paintCallout(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  px: Pixel[],
  selected: boolean,
) {
  const tip = px[0];
  const box = px[1] ?? { x: tip.x + 36, y: tip.y - 28 };
  const label = drawing.label || 'Callout';
  ctx.strokeStyle = drawing.color;
  ctx.lineWidth = selected ? 1.8 : 1.35;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(box.x, box.y);
  ctx.stroke();
  // Tip dot
  ctx.beginPath();
  ctx.fillStyle = drawing.color;
  ctx.arc(tip.x, tip.y, selected ? 3.5 : 2.75, 0, Math.PI * 2);
  ctx.fill();
  bubble(ctx, label, box.x, box.y, drawing.color);
}

export function hitCallout(at: Pixel, px: Pixel[]): number {
  if (!px.length) return Infinity;
  const tip = px[0];
  const box = px[1] ?? { x: tip.x + 36, y: tip.y - 28 };
  const leader = distanceToSegment(at, tip, box);
  // Approximate bubble hit (~120×40)
  const inBubble =
    at.x >= box.x - 4 && at.x <= box.x + 124 && at.y >= box.y - 24 && at.y <= box.y + 24
      ? 0
      : Infinity;
  return Math.min(leader, inBubble, Math.hypot(at.x - tip.x, at.y - tip.y));
}

/** Text / note bubble at a single point. */
export function paintTextNote(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  px: Pixel[],
  kind: string,
) {
  const p = px[0];
  const label = drawing.label || (kind.includes('note') ? 'Note' : 'Text');
  if (kind === 'note' || kind === 'anchoredNote') {
    bubble(ctx, label, p.x, p.y, drawing.color, { maxWidth: 200 });
    return;
  }
  if (kind === 'priceLabel' || kind === 'priceNote') {
    const price = drawing.points[0]?.price;
    const text = Number.isFinite(price)
      ? `${label} ${price.toLocaleString('en-US', { maximumFractionDigits: 4 })}`
      : label;
    bubble(ctx, text, p.x, p.y, drawing.color, { maxWidth: 160 });
    return;
  }
  if (kind === 'table') {
    bubble(ctx, label || 'Table', p.x, p.y, drawing.color, { maxWidth: 140 });
    return;
  }
  // plain text
  ctx.font = '700 12px "Trebuchet MS", Roboto, Ubuntu, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(19,23,34,0.75)';
  ctx.strokeText(label, p.x, p.y);
  ctx.fillStyle = drawing.color;
  ctx.fillText(label, p.x, p.y);
}

/**
 * Circular arc through 3 points (start, via, end).
 * Falls back to quadratic if points are nearly collinear.
 */
export function circumArc(a: Pixel, b: Pixel, c: Pixel): {
  cx: number;
  cy: number;
  r: number;
  start: number;
  end: number;
  ccw: boolean;
} | null {
  const D = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(D) < 1e-6) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / D;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / D;
  const r = Math.hypot(a.x - cx, a.y - cy);
  const angA = Math.atan2(a.y - cy, a.x - cx);
  const angB = Math.atan2(b.y - cy, b.x - cx);
  const angC = Math.atan2(c.y - cy, c.x - cx);
  // Choose direction so mid angle lies on the arc A→C.
  const norm = (t: number) => {
    let x = t;
    while (x < 0) x += Math.PI * 2;
    while (x >= Math.PI * 2) x -= Math.PI * 2;
    return x;
  };
  const A = norm(angA);
  const B = norm(angB);
  const C = norm(angC);
  const onCCW = (from: number, mid: number, to: number) => {
    const f = 0;
    let m = norm(mid - from);
    let t = norm(to - from);
    void f;
    if (t === 0) t = Math.PI * 2;
    return m <= t;
  };
  const ccw = onCCW(A, B, C);
  return { cx, cy, r, start: angA, end: angC, ccw };
}

export function paintCircularArc(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  color: string,
  selected: boolean,
) {
  if (px.length < 3) return;
  const geo = circumArc(px[0], px[1], px[2]);
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2.2 : 1.6;
  if (!geo) {
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.quadraticCurveTo(px[1].x, px[1].y, px[2].x, px[2].y);
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(geo.cx, geo.cy, geo.r, geo.start, geo.end, !geo.ccw);
  ctx.stroke();
  if (selected) {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = hexAlpha(color.startsWith('#') ? color : '#2962ff', 0.35);
    ctx.beginPath();
    ctx.arc(geo.cx, geo.cy, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function hitCircularArc(at: Pixel, px: Pixel[]): number {
  if (px.length < 3) return Infinity;
  const geo = circumArc(px[0], px[1], px[2]);
  if (!geo) {
    return Math.min(
      distanceToSegment(at, px[0], px[1]),
      distanceToSegment(at, px[1], px[2]),
    );
  }
  const d = Math.abs(Math.hypot(at.x - geo.cx, at.y - geo.cy) - geo.r);
  const ang = Math.atan2(at.y - geo.cy, at.x - geo.cx);
  // Cheap angular gate — if far from arc wedge, inflate distance.
  const norm = (t: number) => {
    let x = t;
    while (x < -Math.PI) x += Math.PI * 2;
    while (x > Math.PI) x -= Math.PI * 2;
    return x;
  };
  const a0 = geo.start;
  const a1 = geo.end;
  let ok = true;
  if (geo.ccw) {
    let t = norm(ang - a0);
    let end = norm(a1 - a0);
    if (end < 0) end += Math.PI * 2;
    if (t < 0) t += Math.PI * 2;
    ok = t <= end + 0.15;
  } else {
    let t = norm(a0 - ang);
    let end = norm(a0 - a1);
    if (end < 0) end += Math.PI * 2;
    if (t < 0) t += Math.PI * 2;
    ok = t <= end + 0.15;
  }
  return ok ? d : d + 40;
}

/** Sector: center, rim start, rim end (3 pts). */
export function paintSector(
  ctx: CanvasRenderingContext2D,
  px: Pixel[],
  color: string,
  selected: boolean,
) {
  if (px.length < 2) return;
  const c = px[0];
  const a = px[1];
  const b = px[2] ?? {
    x: c.x + (a.y - c.y),
    y: c.y - (a.x - c.x),
  };
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const ang0 = Math.atan2(a.y - c.y, a.x - c.x);
  const ang1 = Math.atan2(b.y - c.y, b.x - c.x);
  let delta = ang1 - ang0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const ccw = delta >= 0;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.arc(c.x, c.y, Math.max(2, r), ang0, ang1, !ccw);
  ctx.closePath();
  ctx.fillStyle = hexAlpha(color.startsWith('#') ? color : '#2962ff', 0.18);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.stroke();
  // Radius spokes
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(a.x, a.y);
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x + Math.cos(ang1) * r, c.y + Math.sin(ang1) * r);
  ctx.stroke();
}

export function hitSector(at: Pixel, px: Pixel[]): number {
  if (px.length < 2) return Infinity;
  const c = px[0];
  const a = px[1];
  const b = px[2] ?? a;
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  const dist = Math.hypot(at.x - c.x, at.y - c.y);
  if (dist > r + 8) return dist - r;
  // Inside pie: distance to edges
  return Math.min(
    distanceToSegment(at, c, a),
    distanceToSegment(at, c, {
      x: c.x + Math.cos(Math.atan2(b.y - c.y, b.x - c.x)) * r,
      y: c.y + Math.sin(Math.atan2(b.y - c.y, b.x - c.x)) * r,
    }),
    Math.abs(dist - r),
  );
}

/**
 * Long/Short position: p0 entry, p1 stop, p2 target (optional → 2R fallback).
 */
export function paintPosition(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  px: Pixel[],
  selected: boolean,
) {
  const long = drawing.kind === 'longPos';
  const entry = px[0];
  const stop = px[1];
  let target = px[2];
  if (!target) {
    const risk = stop.y - entry.y;
    target = { x: Math.max(entry.x, stop.x), y: entry.y - risk * 2 };
  }
  const left = Math.min(entry.x, stop.x, target.x);
  const right = Math.max(entry.x, stop.x, target.x);
  const width = Math.max(28, right - left);

  // Risk zone
  ctx.fillStyle = long ? 'rgba(242,54,69,0.2)' : 'rgba(8,153,129,0.2)';
  ctx.fillRect(left, Math.min(entry.y, stop.y), width, Math.abs(stop.y - entry.y) || 1);
  // Reward zone
  ctx.fillStyle = long ? 'rgba(8,153,129,0.2)' : 'rgba(242,54,69,0.2)';
  ctx.fillRect(left, Math.min(entry.y, target.y), width, Math.abs(target.y - entry.y) || 1);

  ctx.strokeStyle = drawing.color;
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(left, entry.y);
  ctx.lineTo(left + width, entry.y);
  ctx.stroke();
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(left, stop.y);
  ctx.lineTo(left + width, stop.y);
  ctx.moveTo(left, target.y);
  ctx.lineTo(left + width, target.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const prices = drawing.points;
  const entryP = prices[0]?.price;
  const stopP = prices[1]?.price;
  const targetP = prices[2]?.price;
  let rr = '';
  if (
    Number.isFinite(entryP) &&
    Number.isFinite(stopP) &&
    Number.isFinite(targetP) &&
    Math.abs(entryP - stopP) > 1e-9
  ) {
    rr = ` · R:R ${(Math.abs(targetP - entryP) / Math.abs(entryP - stopP)).toFixed(2)}`;
  }

  const midX = left + width / 2;
  // Labels
  labelLine(ctx, 'Entry', midX, entry.y, '#d1d4dc');
  labelLine(ctx, 'Stop', midX, stop.y, '#f23645');
  labelLine(ctx, 'Target', midX, target.y, '#089981');

  ctx.font = '700 10px "Trebuchet MS", Roboto, sans-serif';
  ctx.fillStyle = drawing.color;
  ctx.fillText(`${long ? 'Long' : 'Short'}${rr}`, left + 4, Math.min(entry.y, stop.y, target.y) - 6);
}

function labelLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.font = '600 9px "Trebuchet MS", Roboto, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y - 3);
  ctx.textAlign = 'left';
}

export function hitPosition(at: Pixel, px: Pixel[]): number {
  if (px.length < 2) return Infinity;
  const entry = px[0];
  const stop = px[1];
  let target = px[2];
  if (!target) {
    const risk = stop.y - entry.y;
    target = { x: Math.max(entry.x, stop.x), y: entry.y - risk * 2 };
  }
  const left = Math.min(entry.x, stop.x, target.x);
  const right = Math.max(entry.x, stop.x, target.x);
  const top = Math.min(entry.y, stop.y, target.y);
  const bot = Math.max(entry.y, stop.y, target.y);
  if (at.x >= left && at.x <= right && at.y >= top && at.y <= bot) return 0;
  return Math.min(
    Math.abs(at.y - entry.y),
    Math.abs(at.y - stop.y),
    Math.abs(at.y - target.y),
  ) + (at.x < left || at.x > right ? 20 : 0);
}
