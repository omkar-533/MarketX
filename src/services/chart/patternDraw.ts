/**
 * Harmonic / Elliott / Head & Shoulders pattern paint + hit (TV-grade).
 */

import { distanceToPolyline, distanceToSegment, type Pixel } from './chartDrawings';

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(41,98,255,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function dist(a: Pixel, b: Pixel) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function priceRatio(a: number, b: number, c: number, d: number) {
  const den = b - a;
  if (Math.abs(den) < 1e-12) return 0;
  return Math.abs((d - c) / den);
}

function vertexLabel(
  ctx: CanvasRenderingContext2D,
  p: Pixel,
  text: string,
  color: string,
) {
  if (!text) return;
  ctx.font = '700 10px "Trebuchet MS", Roboto, sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = color;
  ctx.fillRect(p.x - w / 2, p.y - 22, w, 16);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p.x, p.y - 14);
  ctx.textAlign = 'left';
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function ratioChip(
  ctx: CanvasRenderingContext2D,
  a: Pixel,
  b: Pixel,
  text: string,
  color: string,
) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  ctx.font = '600 9px "Trebuchet MS", Roboto, sans-serif';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(19,23,34,0.85)';
  ctx.fillRect(mx - w / 2, my - 8, w, 14);
  ctx.strokeStyle = color;
  ctx.strokeRect(mx - w / 2, my - 8, w, 14);
  ctx.fillStyle = '#d1d4dc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, mx, my - 1);
  ctx.textAlign = 'left';
}

function fillTri(ctx: CanvasRenderingContext2D, a: Pixel, b: Pixel, c: Pixel, fill: string) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

const LABELS: Record<string, string[]> = {
  xabcd: ['X', 'A', 'B', 'C', 'D'],
  cypher: ['X', 'A', 'B', 'C', 'D'],
  abcd: ['A', 'B', 'C', 'D'],
  headShoulders: ['LS', 'L', 'H', 'R', 'RS', 'N1', 'N2'],
  trianglePattern: ['A', 'B', 'C', 'D'],
  threeDrives: ['0', '1', '2', '3', '4', '5', '6'],
  elliotImpulse: ['0', '1', '2', '3', '4', '5'],
  elliotCorrection: ['0', 'A', 'B', 'C'],
  elliotTriangle: ['0', 'A', 'B', 'C', 'D', 'E'],
  elliotDouble: ['0', 'W', 'X', 'Y', ''],
  elliotTriple: ['0', 'W', 'X', 'Y', 'X2', 'Z', ''],
};

export function isPatternKind(kind: string): boolean {
  return kind in LABELS;
}

export function paintPattern(
  ctx: CanvasRenderingContext2D,
  kind: string,
  px: Pixel[],
  prices: number[],
  color: string,
  selected: boolean,
) {
  if (px.length < 2) return;
  const labels = LABELS[kind] ?? [];

  // Filled legs for harmonics.
  if ((kind === 'xabcd' || kind === 'cypher') && px.length >= 5) {
    fillTri(ctx, px[0], px[1], px[2], hexAlpha(color, 0.1));
    fillTri(ctx, px[2], px[3], px[4], hexAlpha('#089981', 0.1));
  }
  if (kind === 'abcd' && px.length >= 4) {
    fillTri(ctx, px[0], px[1], px[2], hexAlpha(color, 0.1));
    fillTri(ctx, px[1], px[2], px[3], hexAlpha('#089981', 0.1));
  }
  if (kind === 'trianglePattern' && px.length >= 4) {
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.lineTo(px[2].x, px[2].y);
    ctx.lineTo(px[3].x, px[3].y);
    ctx.closePath();
    ctx.fillStyle = hexAlpha(color, 0.08);
    ctx.fill();
  }

  // Head & shoulders neckline.
  if (kind === 'headShoulders' && px.length >= 7) {
    const n1 = px[5];
    const n2 = px[6];
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.lineTo(n2.x, n2.y);
    // Extend neckline.
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    ctx.moveTo(n1.x - dx * 0.35, n1.y - dy * 0.35);
    ctx.lineTo(n2.x + dx * 0.8, n2.y + dy * 0.8);
    ctx.stroke();
    ctx.setLineDash([]);
    // Soft body stroke LS-L-H-R-RS
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    for (let i = 1; i <= 4; i += 1) ctx.lineTo(px[i].x, px[i].y);
    ctx.stroke();
  } else {
    // Main polyline.
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2.1 : 1.55;
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    for (let i = 1; i < px.length; i += 1) {
      if (!labels[i] && !labels[i - 1]) continue;
      ctx.lineTo(px[i].x, px[i].y);
    }
    // Always stroke all points for continuous path.
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    for (let i = 1; i < px.length; i += 1) ctx.lineTo(px[i].x, px[i].y);
    ctx.stroke();
  }

  // Elliott: emphasise impulse legs 1-3-5.
  if (kind === 'elliotImpulse' && px.length >= 6) {
    ctx.strokeStyle = '#089981';
    ctx.lineWidth = selected ? 2.4 : 2;
    for (const [i, j] of [
      [0, 1],
      [2, 3],
      [4, 5],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(px[i].x, px[i].y);
      ctx.lineTo(px[j].x, px[j].y);
      ctx.stroke();
    }
  }

  // Ratio readouts for XABCD / ABCD.
  if (kind === 'xabcd' && px.length >= 5 && prices.length >= 5) {
    const abxa = priceRatio(prices[0], prices[1], prices[1], prices[2]);
    const bcab = priceRatio(prices[1], prices[2], prices[2], prices[3]);
    const cdab = priceRatio(prices[1], prices[2], prices[3], prices[4]);
    const adxa = priceRatio(prices[0], prices[1], prices[0], prices[4]);
    ratioChip(ctx, px[1], px[2], `AB ${abxa.toFixed(3)}`, color);
    ratioChip(ctx, px[2], px[3], `BC ${bcab.toFixed(3)}`, '#089981');
    ratioChip(ctx, px[3], px[4], `CD ${cdab.toFixed(3)}`, '#ff9800');
    ratioChip(ctx, px[0], px[4], `AD ${adxa.toFixed(3)}`, '#e91e63');
  }
  if (kind === 'abcd' && px.length >= 4 && prices.length >= 4) {
    const ab = Math.abs(prices[1] - prices[0]);
    const cd = Math.abs(prices[3] - prices[2]);
    ratioChip(ctx, px[0], px[1], `AB`, color);
    ratioChip(ctx, px[2], px[3], `CD ${(ab > 0 ? cd / ab : 0).toFixed(3)}`, '#089981');
  }

  // Vertex pills.
  px.forEach((p, i) => {
    const t = labels[i];
    if (t) vertexLabel(ctx, p, t, color);
  });

  void dist;
}

export function hitPattern(at: Pixel, kind: string, px: Pixel[]): number {
  if (kind === 'headShoulders' && px.length >= 7) {
    return Math.min(
      distanceToPolyline(at, px.slice(0, 5)),
      distanceToSegment(at, px[5], px[6]),
    );
  }
  return distanceToPolyline(at, px);
}
