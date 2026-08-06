/**
 * Canvas paint + hit-test for Terminal/user drawings (TradingView-like tools).
 */

import {
  applyLineDash,
  distanceToEllipse,
  distanceToPolyline,
  distanceToRect,
  distanceToSegment,
  isBrushKind,
  strokeWidthOf,
  type Drawing,
  type Pixel,
} from './chartDrawings';
import { hitFibDrawing, isFibPaintKind, paintFibKind } from './fibDraw';
import {
  hitGannFan,
  hitPitchforkFamily,
  paintGannBox,
  paintGannFan,
  paintPitchforkFamily,
} from './gannPitchDraw';
import { hitPattern, isPatternKind, paintPattern } from './patternDraw';
import {
  hitVolumeProfile,
  paintAnchoredVwap,
  paintVolumeProfile,
  type PriceMap,
} from './volumeDraw';
import {
  hitCallout,
  hitCircularArc,
  hitPosition,
  hitSector,
  paintCallout,
  paintCircularArc,
  paintPosition,
  paintSector,
  paintTextNote,
} from './shapeExtrasDraw';
import type { ChartBar } from '../../types/chart';

export type PaintExtras = {
  bars?: ChartBar[];
  map?: PriceMap;
};

function extendRay(a: Pixel, b: Pixel, far = 2400): Pixel {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: b.x + dx * far, y: b.y + dy * far };
}

function extendBoth(a: Pixel, b: Pixel, far = 2400): [Pixel, Pixel] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return [
    { x: a.x - dx * far, y: a.y - dy * far },
    { x: b.x + dx * far, y: b.y + dy * far },
  ];
}

function chip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  if (!text) return;
  ctx.font = '600 10px "Trebuchet MS", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width + 8;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(x, y - 7, width, 14);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x + 4, y);
}

function fillFromColor(color: string, opacity: number): string {
  const h = color.replace('#', '');
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }
  return `rgba(41,98,255,${opacity})`;
}

function dPriceFill(p0: number, p1: number): string {
  return p1 >= p0 ? 'rgba(8, 153, 129, 0.16)' : 'rgba(242, 54, 69, 0.16)';
}

function measureChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
) {
  if (!text) return;
  const lines = text.split(' · ');
  ctx.font = '600 11px "Trebuchet MS", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
  const padX = 10;
  const lineH = 16;
  const boxW = maxW + padX * 2;
  const boxH = lines.length * lineH + 8;
  const x = cx - boxW / 2;
  const y = cy - boxH / 2;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, boxW, boxH, 4);
  else ctx.rect(x, y, boxW, boxH);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, y + 4 + lineH / 2 + i * lineH);
  });
  ctx.textAlign = 'left';
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pixel, to: Pixel, color: string) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function parallelOffset(a: Pixel, b: Pixel, c: Pixel): { left: Pixel; right: Pixel } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy || 1;
  const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq;
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  const ox = c.x - proj.x;
  const oy = c.y - proj.y;
  return {
    left: { x: a.x + ox, y: a.y + oy },
    right: { x: b.x + ox, y: b.y + oy },
  };
}

function strokePoly(ctx: CanvasRenderingContext2D, px: Pixel[], close = false) {
  if (!px.length) return;
  ctx.beginPath();
  ctx.moveTo(px[0].x, px[0].y);
  for (let i = 1; i < px.length; i += 1) ctx.lineTo(px[i].x, px[i].y);
  if (close && px.length > 2) ctx.closePath();
  ctx.stroke();
}

/** Hit distance for a finished drawing. */
export function hitUserDrawing(
  at: Pixel,
  drawing: Drawing,
  px: Pixel[],
  paneWidth = 2400,
  paneHeight = 1400,
): number {
  const kind = drawing.kind;
  if (!px.length) return Infinity;
  if (drawing.visible === false) return Infinity;

  if (kind === 'hline') return Math.abs(at.y - px[0].y);
  if (kind === 'hray') {
    // Only the ray side (to the right of origin), matching paint.
    if (at.x < px[0].x - 4) return Infinity;
    return Math.abs(at.y - px[0].y);
  }
  if (kind === 'vline') return Math.abs(at.x - px[0].x);
  if (kind === 'cross') return Math.min(Math.abs(at.y - px[0].y), Math.abs(at.x - px[0].x));

  const single = new Set([
    'arrowUp',
    'arrowDown',
    'text',
    'anchoredText',
    'note',
    'anchoredNote',
    'priceLabel',
    'priceNote',
    'arrowMarker',
    'flag',
    'pin',
    'table',
    'sticker',
    'anchoredVwap',
    'anchoredVp',
  ]);
  if (single.has(kind)) return Math.hypot(at.x - px[0].x, at.y - px[0].y);
  if (kind === 'callout' || kind === 'comment') return hitCallout(at, px);
  if (kind === 'longPos' || kind === 'shortPos') return hitPosition(at, px);
  if (kind === 'sector') return hitSector(at, px);
  if (kind === 'arc') return hitCircularArc(at, px);

  if (
    kind === 'rect' ||
    kind === 'rotatedRect' ||
    kind === 'barsPattern' ||
    kind === 'ghostFeed' ||
    kind === 'priceRange' ||
    kind === 'dateRange' ||
    kind === 'datePriceRange'
  ) {
    if (px.length >= 2) return distanceToRect(at, px[0], px[1]);
  }
  if (kind === 'gannBox' || kind === 'gannSquare' || kind === 'gannSquareFixed') {
    if (px.length >= 2) return distanceToRect(at, px[0], px[1]);
  }
  if (kind === 'fixedRangeVp') {
    return hitVolumeProfile(at, px);
  }
  if (kind === 'ellipse' || kind === 'circle') {
    if (px.length >= 2) return distanceToEllipse(at, px[0], px[1]);
  }
  if (isFibPaintKind(kind)) {
    return hitFibDrawing(at, drawing, px, paneWidth, paneHeight);
  }
  if (
    kind === 'pitchfork' ||
    kind === 'schiff' ||
    kind === 'modSchiff' ||
    kind === 'insidePitchfork'
  ) {
    return hitPitchforkFamily(at, px, kind);
  }
  if (kind === 'gannFan') return hitGannFan(at, px);
  if (isPatternKind(kind)) return hitPattern(at, kind, px);
  if (kind === 'parallelChannel' || kind === 'disjointChannel') {
    if (px.length >= 3) {
      const { left, right } = parallelOffset(px[0], px[1], px[2]);
      const midA = { x: (px[0].x + left.x) / 2, y: (px[0].y + left.y) / 2 };
      const midB = { x: (px[1].x + right.x) / 2, y: (px[1].y + right.y) / 2 };
      return Math.min(
        distanceToSegment(at, px[0], px[1]),
        distanceToSegment(at, left, right),
        kind === 'disjointChannel' ? Infinity : distanceToSegment(at, midA, midB),
      );
    }
  }
  if (px.length >= 3) {
    return distanceToPolyline(at, px);
  }
  if (isBrushKind(kind) || kind === 'polyline' || kind === 'path') {
    return distanceToPolyline(at, px);
  }
  if (kind === 'ray' || kind === 'info') {
    if (px.length < 2) return Infinity;
    return distanceToSegment(at, px[0], extendRay(px[0], px[1]));
  }
  if (kind === 'extended' || kind === 'cyclicLines') {
    if (px.length < 2) return Infinity;
    const [aa, bb] = extendBoth(px[0], px[1]);
    return distanceToSegment(at, aa, bb);
  }
  if (px.length >= 2) return distanceToSegment(at, px[0], px[1]);
  return Infinity;
}

/** Paint one user drawing into an already-clipped price pane. */
export function paintUserDrawing(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  px: Pixel[],
  paneWidth: number,
  paneHeight: number,
  labelColor: string,
  selected: boolean,
  extras?: PaintExtras,
) {
  if (!px.length) return;
  if (drawing.visible === false && !selected) return;
  const color = drawing.color;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidthOf(drawing, selected);
  applyLineDash(ctx, drawing.lineStyle);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Crisp TV-like stroke.
  ctx.imageSmoothingEnabled = true;

  const kind = drawing.kind;
  const bars = extras?.bars;
  const map = extras?.map;

  if (kind === 'hline') {
    ctx.beginPath();
    ctx.moveTo(0, px[0].y);
    ctx.lineTo(paneWidth, px[0].y);
    ctx.stroke();
    const price = drawing.points[0]?.price;
    if (Number.isFinite(price)) {
      chip(ctx, price.toLocaleString('en-US', { maximumFractionDigits: 4 }), 6, px[0].y, color);
    }
    return;
  }
  if (kind === 'hray') {
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(paneWidth + 40, px[0].y);
    ctx.stroke();
    const price = drawing.points[0]?.price;
    if (Number.isFinite(price)) {
      chip(ctx, price.toLocaleString('en-US', { maximumFractionDigits: 4 }), px[0].x + 6, px[0].y - 10, color);
    }
    return;
  }
  if (kind === 'vline') {
    ctx.beginPath();
    ctx.moveTo(px[0].x, 0);
    ctx.lineTo(px[0].x, paneHeight);
    ctx.stroke();
    return;
  }
  if (kind === 'cross') {
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, px[0].y);
    ctx.lineTo(paneWidth, px[0].y);
    ctx.moveTo(px[0].x, 0);
    ctx.lineTo(px[0].x, paneHeight);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  if (kind === 'arrowUp' || kind === 'arrowDown') {
    const up = kind === 'arrowUp';
    const y2 = up ? px[0].y - 28 : px[0].y + 28;
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[0].x, y2);
    ctx.stroke();
    arrowHead(ctx, px[0], { x: px[0].x, y: y2 }, color);
    return;
  }

  if (
    kind === 'text' ||
    kind === 'anchoredText' ||
    kind === 'note' ||
    kind === 'anchoredNote' ||
    kind === 'callout' ||
    kind === 'comment' ||
    kind === 'priceLabel' ||
    kind === 'priceNote' ||
    kind === 'arrowMarker' ||
    kind === 'flag' ||
    kind === 'pin' ||
    kind === 'table' ||
    kind === 'sticker'
  ) {
    const label = drawing.label || kind;
    if (kind === 'callout' || kind === 'comment') {
      if (px.length >= 1) paintCallout(ctx, drawing, px, selected);
      return;
    }
    if (kind === 'sticker' || kind === 'flag' || kind === 'pin' || kind === 'arrowMarker') {
      ctx.font = '20px "Segoe UI Emoji", sans-serif';
      ctx.fillText(label, px[0].x - 10, px[0].y + 6);
      return;
    }
    paintTextNote(ctx, drawing, px, kind);
    return;
  }

  if (kind === 'anchoredVwap') {
    if (bars?.length && map) {
      paintAnchoredVwap(ctx, drawing.points[0].time, bars, map, color, selected);
    } else {
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(px[0].x, px[0].y);
      ctx.lineTo(paneWidth, px[0].y);
      ctx.stroke();
      ctx.setLineDash([]);
      chip(ctx, 'AVWAP', px[0].x + 4, px[0].y - 10, color);
    }
    return;
  }

  if (kind === 'anchoredVp') {
    if (bars?.length && map) {
      paintVolumeProfile(ctx, drawing.points, px, bars, map, color, selected, true);
    } else {
      chip(ctx, 'VP', px[0].x + 4, px[0].y - 10, color);
    }
    return;
  }

  if (px.length < 2) return;

  if (paintFibKind(ctx, drawing, px, paneWidth, paneHeight, selected)) {
    return;
  }

  if (kind === 'gannBox' || kind === 'gannSquare' || kind === 'gannSquareFixed') {
    paintGannBox(ctx, px, kind, selected);
    return;
  }

  if (kind === 'rect') {
    const x = Math.min(px[0].x, px[1].x);
    const y = Math.min(px[0].y, px[1].y);
    const w = Math.abs(px[1].x - px[0].x);
    const h = Math.abs(px[1].y - px[0].y);
    ctx.fillStyle = fillFromColor(color, drawing.fillOpacity ?? 0.12);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    return;
  }

  if (kind === 'rotatedRect' && px.length >= 3) {
    const { left, right } = parallelOffset(px[0], px[1], px[2]);
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
    ctx.fillStyle = fillFromColor(color, drawing.fillOpacity ?? 0.1);
    ctx.fill();
    ctx.stroke();
    return;
  }

  if (kind === 'ellipse' || kind === 'circle') {
    const cx = (px[0].x + px[1].x) / 2;
    const cy = (px[0].y + px[1].y) / 2;
    let rx = Math.max(1, Math.abs(px[1].x - px[0].x) / 2);
    let ry = Math.max(1, Math.abs(px[1].y - px[0].y) / 2);
    if (kind === 'circle') {
      const r = Math.max(rx, ry);
      rx = r;
      ry = r;
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fillFromColor(color, drawing.fillOpacity ?? 0.1);
    ctx.fill();
    ctx.stroke();
    return;
  }

  if (kind === 'sector') {
    paintSector(ctx, px, color, selected);
    return;
  }

  if (kind === 'longPos' || kind === 'shortPos') {
    paintPosition(ctx, drawing, px, selected);
    return;
  }

  if ((kind === 'parallelChannel' || kind === 'disjointChannel') && px.length >= 3) {
    const { left, right } = parallelOffset(px[0], px[1], px[2]);
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(41,98,255,0.08)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
    if (kind !== 'disjointChannel') {
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo((px[0].x + left.x) / 2, (px[0].y + left.y) / 2);
      ctx.lineTo((px[1].x + right.x) / 2, (px[1].y + right.y) / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }

  if (kind === 'flatTopBottom') {
    const top = Math.min(px[0].y, px[1].y);
    const bot = Math.max(px[0].y, px[1].y);
    const left = Math.min(px[0].x, px[1].x);
    const right = Math.max(px[0].x, px[1].x);
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.moveTo(left, bot);
    ctx.lineTo(right, bot);
    ctx.stroke();
    ctx.fillStyle = 'rgba(41,98,255,0.08)';
    ctx.fillRect(left, top, right - left, bot - top);
    return;
  }

  if (kind === 'regressionTrend') {
    if (bars?.length && map && drawing.points.length >= 2) {
      const t0 = Math.min(drawing.points[0].time, drawing.points[1].time);
      const t1 = Math.max(drawing.points[0].time, drawing.points[1].time);
      const slice = bars.filter((b) => b.time >= t0 && b.time <= t1);
      if (slice.length >= 2) {
        // OLS on index → close.
        let sumX = 0;
        let sumY = 0;
        let sumXX = 0;
        let sumXY = 0;
        const n = slice.length;
        for (let i = 0; i < n; i += 1) {
          const y = slice[i].close;
          sumX += i;
          sumY += y;
          sumXX += i * i;
          sumXY += i * y;
        }
        const den = n * sumXX - sumX * sumX || 1;
        const slope = (n * sumXY - sumX * sumY) / den;
        const intercept = (sumY - slope * sumX) / n;
        const residuals: number[] = [];
        for (let i = 0; i < n; i += 1) {
          residuals.push(slice[i].close - (intercept + slope * i));
        }
        const variance = residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2);
        const sigma = Math.sqrt(Math.max(0, variance));
        const path: Pixel[] = [];
        const up: Pixel[] = [];
        const dn: Pixel[] = [];
        for (let i = 0; i < n; i += 1) {
          const mean = intercept + slope * i;
          const x = map.timeToX(slice[i].time);
          const y0 = map.priceToY(mean);
          const yU = map.priceToY(mean + sigma);
          const yD = map.priceToY(mean - sigma);
          if (x == null || y0 == null || yU == null || yD == null) continue;
          path.push({ x, y: y0 });
          up.push({ x, y: yU });
          dn.push({ x, y: yD });
        }
        if (path.length >= 2) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = 'rgba(41,98,255,0.55)';
          ctx.beginPath();
          ctx.moveTo(up[0].x, up[0].y);
          for (let i = 1; i < up.length; i += 1) ctx.lineTo(up[i].x, up[i].y);
          ctx.moveTo(dn[0].x, dn[0].y);
          for (let i = 1; i < dn.length; i += 1) ctx.lineTo(dn[i].x, dn[i].y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = color;
          ctx.lineWidth = selected ? 2.2 : 1.7;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
          ctx.stroke();
          return;
        }
      }
    }
    // Fallback visual if bars unavailable.
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.stroke();
    ctx.setLineDash([4, 3]);
    const midY = (px[0].y + px[1].y) / 2;
    const spread = Math.abs(px[1].y - px[0].y) * 0.35 || 12;
    ctx.beginPath();
    ctx.moveTo(px[0].x, midY - spread);
    ctx.lineTo(px[1].x, midY - spread);
    ctx.moveTo(px[0].x, midY + spread);
    ctx.lineTo(px[1].x, midY + spread);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  if (kind === 'cyclicLines') {
    const dx = px[1].x - px[0].x;
    const ratios = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    ctx.font = '600 10px "Trebuchet MS", Roboto, sans-serif';
    ratios.forEach((ratio) => {
      const x = px[0].x + dx * ratio;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, paneHeight);
      ctx.stroke();
      ctx.fillStyle = labelColor;
      ctx.fillText(ratio.toFixed(2), x + 2, 12);
    });
    return;
  }

  if (kind === 'gannFan') {
    paintGannFan(ctx, px, color, selected);
    return;
  }

  if (
    kind === 'pitchfork' ||
    kind === 'schiff' ||
    kind === 'modSchiff' ||
    kind === 'insidePitchfork'
  ) {
    paintPitchforkFamily(ctx, px, kind, color, selected);
    return;
  }

  if (kind === 'triangle' || kind === 'angle') {
    if (px.length >= 3) {
      if (kind === 'triangle') {
        ctx.fillStyle = 'rgba(41,98,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(px[0].x, px[0].y);
        ctx.lineTo(px[1].x, px[1].y);
        ctx.lineTo(px[2].x, px[2].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Angle tool: two rays from vertex + degree arc/chip.
        const v = px[1];
        const a = px[0];
        const b = px[2];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(v.x, v.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const ang1 = Math.atan2(a.y - v.y, a.x - v.x);
        const ang2 = Math.atan2(b.y - v.y, b.x - v.x);
        let delta = ((ang2 - ang1) * 180) / Math.PI;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        const r = Math.min(36, Math.hypot(a.x - v.x, a.y - v.y) * 0.35, Math.hypot(b.x - v.x, b.y - v.y) * 0.35);
        ctx.beginPath();
        ctx.arc(v.x, v.y, Math.max(10, r), ang1, ang2, delta < 0);
        ctx.stroke();
        chip(ctx, `${Math.abs(delta).toFixed(1)}°`, v.x + 8, v.y - 10, color);
      }
    }
    return;
  }

  if (kind === 'curve' || kind === 'arc') {
    if (px.length >= 3) {
      if (kind === 'arc') {
        paintCircularArc(ctx, px, color, selected);
      } else {
        ctx.beginPath();
        ctx.moveTo(px[0].x, px[0].y);
        ctx.quadraticCurveTo(px[1].x, px[1].y, px[2].x, px[2].y);
        ctx.stroke();
      }
    }
    return;
  }

  if (isBrushKind(kind) || kind === 'polyline' || kind === 'path') {
    ctx.lineWidth = kind === 'highlighter' ? 10 : 2.2;
    ctx.globalAlpha = kind === 'highlighter' ? 0.35 : 1;
    strokePoly(ctx, px);
    ctx.globalAlpha = 1;
    return;
  }

  if (kind === 'ray' || kind === 'info') {
    const far = extendRay(px[0], px[1]);
    const start =
      drawing.extendLeft ? extendBoth(px[0], px[1])[0] : px[0];
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(far.x, far.y);
    ctx.stroke();
    if (kind === 'info') {
      const dx = drawing.points[1].price - drawing.points[0].price;
      chip(ctx, `${dx >= 0 ? '+' : ''}${dx.toFixed(2)}`, px[1].x + 6, px[1].y, color);
    }
    return;
  }

  if (kind === 'extended' || kind === 'trend') {
    let a = px[0];
    let b = px[1];
    if (kind === 'extended' || drawing.extendLeft || drawing.extendRight) {
      const [aa, bb] = extendBoth(px[0], px[1]);
      if (kind === 'extended' || drawing.extendLeft) a = aa;
      if (kind === 'extended' || drawing.extendRight) b = bb;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    return;
  }

  if (kind === 'trendAngle') {
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.stroke();
    const ang = (Math.atan2(px[0].y - px[1].y, px[1].x - px[0].x) * 180) / Math.PI;
    chip(ctx, `${ang.toFixed(1)}°`, px[1].x + 6, px[1].y, color);
    return;
  }

  if (kind === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(px[0].x, px[0].y);
    ctx.lineTo(px[1].x, px[1].y);
    ctx.stroke();
    arrowHead(ctx, px[0], px[1], color);
    return;
  }

  if (
    kind === 'measure' ||
    kind === 'priceRange' ||
    kind === 'dateRange' ||
    kind === 'datePriceRange'
  ) {
    const left = Math.min(px[0].x, px[1].x);
    const right = Math.max(px[0].x, px[1].x);
    const top = Math.min(px[0].y, px[1].y);
    const bot = Math.max(px[0].y, px[1].y);
    const w = right - left;
    const h = bot - top;

    if (kind === 'measure') {
      // TradingView ruler: tinted box + solid diagonal + live readout.
      ctx.fillStyle = dPriceFill(drawing.points[0].price, drawing.points[1].price);
      ctx.fillRect(left, top, w, h);
      ctx.setLineDash([]);
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 2 : 1.5;
      ctx.strokeRect(left, top, w, h);
      ctx.beginPath();
      ctx.moveTo(px[0].x, px[0].y);
      ctx.lineTo(px[1].x, px[1].y);
      ctx.stroke();
      // End caps
      ctx.beginPath();
      ctx.arc(px[0].x, px[0].y, 3, 0, Math.PI * 2);
      ctx.arc(px[1].x, px[1].y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      const dPrice = drawing.points[1].price - drawing.points[0].price;
      const pct = drawing.points[0].price ? (dPrice / drawing.points[0].price) * 100 : 0;
      const text =
        drawing.label ||
        `${dPrice >= 0 ? '+' : ''}${dPrice.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      const cx = (left + right) / 2;
      const cy = (top + bot) / 2;
      measureChip(ctx, text, cx, cy, color);
      return;
    }

    ctx.setLineDash([5, 4]);
    if (kind === 'priceRange') {
      ctx.beginPath();
      ctx.moveTo(left, px[0].y);
      ctx.lineTo(right, px[0].y);
      ctx.moveTo(left, px[1].y);
      ctx.lineTo(right, px[1].y);
      ctx.moveTo((left + right) / 2, px[0].y);
      ctx.lineTo((left + right) / 2, px[1].y);
      ctx.stroke();
    } else if (kind === 'dateRange') {
      ctx.beginPath();
      ctx.moveTo(px[0].x, top);
      ctx.lineTo(px[0].x, bot);
      ctx.moveTo(px[1].x, top);
      ctx.lineTo(px[1].x, bot);
      ctx.moveTo(px[0].x, (top + bot) / 2);
      ctx.lineTo(px[1].x, (top + bot) / 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(left, top, w, h);
      ctx.beginPath();
      ctx.moveTo(px[0].x, px[0].y);
      ctx.lineTo(px[1].x, px[1].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const dPrice = drawing.points[1].price - drawing.points[0].price;
    const pct = drawing.points[0].price ? (dPrice / drawing.points[0].price) * 100 : 0;
    const barsApprox = Math.abs(px[1].x - px[0].x) / 6;
    chip(
      ctx,
      `${dPrice >= 0 ? '+' : ''}${dPrice.toFixed(2)} (${pct.toFixed(2)}%) · ~${Math.round(barsApprox)} bars`,
      left,
      top - 12,
      color,
    );
    return;
  }

  if (kind === 'fixedRangeVp') {
    if (bars?.length && map) {
      paintVolumeProfile(ctx, drawing.points, px, bars, map, color, selected, false);
    }
    return;
  }

  if (kind === 'barsPattern' || kind === 'ghostFeed' || kind === 'forecast') {
    const left = Math.min(px[0].x, px[1].x);
    const right = Math.max(px[0].x, px[1].x);
    const top = Math.min(px[0].y, px[1].y);
    const bot = Math.max(px[0].y, px[1].y);
    ctx.setLineDash(kind === 'ghostFeed' ? [3, 3] : []);
    const n = 6;
    const w = (right - left) / n;
    for (let i = 0; i < n; i += 1) {
      const h = ((i % 3) + 1) / 4 * (bot - top);
      const y = top + ((i % 2) / 2) * (bot - top - h);
      ctx.strokeRect(left + i * w + 2, y, Math.max(2, w - 4), h);
    }
    ctx.setLineDash([]);
    chip(
      ctx,
      kind === 'forecast' ? 'Forecast' : kind === 'ghostFeed' ? 'Ghost' : 'Bars',
      left,
      top - 10,
      color,
    );
    return;
  }

  if (kind === 'timeCycles' || kind === 'sineLine') {
    const midY = (px[0].y + px[1].y) / 2;
    const amp = Math.abs(px[1].y - px[0].y) / 2 || 20;
    const span = Math.abs(px[1].x - px[0].x) || 100;
    const start = Math.min(px[0].x, px[1].x);
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const x = start + span * t;
      const y =
        kind === 'sineLine'
          ? midY + Math.sin(t * Math.PI * 4) * amp
          : midY - Math.abs(Math.sin(t * Math.PI * 2)) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }

  // Harmonic / Elliott / multi-point patterns
  if (isPatternKind(kind)) {
    paintPattern(
      ctx,
      kind,
      px,
      drawing.points.map((p) => p.price),
      color,
      selected,
    );
    return;
  }

  // trend default
  ctx.beginPath();
  ctx.moveTo(px[0].x, px[0].y);
  ctx.lineTo(px[1].x, px[1].y);
  ctx.stroke();
}
