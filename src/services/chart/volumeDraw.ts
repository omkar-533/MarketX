/**
 * Real volume profile + anchored VWAP from OHLCV bars.
 */

import type { ChartBar } from '../../types/chart';
import { distanceToPolyline, distanceToSegment, type Pixel } from './chartDrawings';

export type PriceMap = {
  priceToY: (price: number) => number | null;
  timeToX: (time: number) => number | null;
};

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(41,98,255,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function barsInRange(bars: ChartBar[], t0: number, t1: number): ChartBar[] {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  return bars.filter((b) => b.time >= lo && b.time <= hi);
}

/** Bucket volume across a price range (high-low share per bar). */
export function buildVolumeProfile(
  bars: ChartBar[],
  t0: number,
  t1: number,
  priceLo: number,
  priceHi: number,
  bins = 32,
): { volumes: number[]; pocIndex: number; maxVol: number; priceLo: number; priceHi: number } {
  const slice = barsInRange(bars, t0, t1);
  const lo = Math.min(priceLo, priceHi);
  const hi = Math.max(priceLo, priceHi);
  const span = hi - lo || 1;
  const volumes = new Array(bins).fill(0) as number[];
  for (const bar of slice) {
    const v = Math.max(0, bar.volume || 0);
    if (!(v > 0)) continue;
    let i0 = Math.floor(((bar.low - lo) / span) * (bins - 1));
    let i1 = Math.floor(((bar.high - lo) / span) * (bins - 1));
    i0 = Math.max(0, Math.min(bins - 1, i0));
    i1 = Math.max(0, Math.min(bins - 1, i1));
    if (i1 < i0) [i0, i1] = [i1, i0];
    const share = v / (i1 - i0 + 1);
    for (let i = i0; i <= i1; i += 1) volumes[i] += share;
  }
  let pocIndex = 0;
  let maxVol = 0;
  for (let i = 0; i < bins; i += 1) {
    if (volumes[i] > maxVol) {
      maxVol = volumes[i];
      pocIndex = i;
    }
  }
  return { volumes, pocIndex, maxVol, priceLo: lo, priceHi: hi };
}

/** Value area (~70% volume) around POC. */
function valueArea(volumes: number[], poc: number, target = 0.7): { low: number; high: number } {
  const total = volumes.reduce((a, b) => a + b, 0) || 1;
  let low = poc;
  let high = poc;
  let acc = volumes[poc] ?? 0;
  while (acc / total < target && (low > 0 || high < volumes.length - 1)) {
    const down = low > 0 ? volumes[low - 1] : -1;
    const up = high < volumes.length - 1 ? volumes[high + 1] : -1;
    if (up >= down) {
      if (high >= volumes.length - 1) break;
      high += 1;
      acc += volumes[high];
    } else {
      if (low <= 0) break;
      low -= 1;
      acc += volumes[low];
    }
  }
  return { low, high };
}

export function paintVolumeProfile(
  ctx: CanvasRenderingContext2D,
  drawingPoints: { time: number; price: number }[],
  px: Pixel[],
  bars: ChartBar[],
  map: PriceMap,
  color: string,
  selected: boolean,
  /** single-point anchored: scan from anchor → last bar */
  anchored = false,
) {
  if (!bars.length || !px.length) return;
  const last = bars[bars.length - 1];
  const t0 = drawingPoints[0].time;
  const t1 = anchored ? last.time : drawingPoints[1]?.time ?? last.time;
  let priceLo: number;
  let priceHi: number;
  if (anchored || drawingPoints.length < 2) {
    const slice = barsInRange(bars, t0, t1);
    priceLo = slice.reduce((m, b) => Math.min(m, b.low), Infinity);
    priceHi = slice.reduce((m, b) => Math.max(m, b.high), -Infinity);
    if (!(priceHi > priceLo)) {
      priceLo = drawingPoints[0].price * 0.99;
      priceHi = drawingPoints[0].price * 1.01;
    }
  } else {
    priceLo = Math.min(drawingPoints[0].price, drawingPoints[1].price);
    priceHi = Math.max(drawingPoints[0].price, drawingPoints[1].price);
  }

  const left = anchored ? px[0].x : Math.min(px[0].x, px[1]?.x ?? px[0].x);
  const right = anchored
    ? (map.timeToX(last.time) ?? left + 160)
    : Math.max(px[0].x, px[1]?.x ?? px[0].x);
  const width = Math.max(24, right - left);

  const profile = buildVolumeProfile(bars, t0, t1, priceLo, priceHi, 36);
  const va = valueArea(profile.volumes, profile.pocIndex);
  const yTop = map.priceToY(profile.priceHi);
  const yBot = map.priceToY(profile.priceLo);
  if (yTop == null || yBot == null) return;
  const top = Math.min(yTop, yBot);
  const bot = Math.max(yTop, yBot);
  const h = bot - top || 1;
  const binH = h / profile.volumes.length;

  // Frame.
  ctx.strokeStyle = hexAlpha(color.startsWith('#') ? color : '#2962ff', 0.55);
  ctx.lineWidth = selected ? 1.4 : 1;
  ctx.strokeRect(left, top, width, h);

  const max = profile.maxVol || 1;
  for (let i = 0; i < profile.volumes.length; i += 1) {
    const vol = profile.volumes[i];
    if (!(vol > 0)) continue;
    const y = bot - (i + 1) * binH;
    const w = (vol / max) * width * 0.92;
    const inVa = i >= va.low && i <= va.high;
    ctx.fillStyle =
      i === profile.pocIndex
        ? hexAlpha('#ff9800', 0.85)
        : inVa
          ? hexAlpha(color.startsWith('#') ? color : '#2962ff', 0.45)
          : hexAlpha(color.startsWith('#') ? color : '#2962ff', 0.22);
    ctx.fillRect(left, y, w, Math.max(1, binH * 0.9));
  }

  // POC line.
  const pocPrice =
    profile.priceLo + ((profile.pocIndex + 0.5) / profile.volumes.length) * (profile.priceHi - profile.priceLo);
  const pocY = map.priceToY(pocPrice);
  if (pocY != null) {
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, pocY);
    ctx.lineTo(left + width, pocY);
    ctx.stroke();
  }
}

export function paintAnchoredVwap(
  ctx: CanvasRenderingContext2D,
  anchorTime: number,
  bars: ChartBar[],
  map: PriceMap,
  color: string,
  selected: boolean,
) {
  const start = bars.findIndex((b) => b.time >= anchorTime);
  if (start < 0) return;
  let cumPV = 0;
  let cumV = 0;
  const path: Pixel[] = [];
  for (let i = start; i < bars.length; i += 1) {
    const b = bars[i];
    const typical = (b.high + b.low + b.close) / 3;
    const v = Math.max(0, b.volume || 0);
    cumPV += typical * v;
    cumV += v;
    if (!(cumV > 0)) continue;
    const vwap = cumPV / cumV;
    const x = map.timeToX(b.time);
    const y = map.priceToY(vwap);
    if (x == null || y == null) continue;
    path.push({ x, y });
  }
  if (path.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2.2 : 1.7;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();

  // Endpoint chip.
  const last = path[path.length - 1];
  ctx.font = '700 9px "Trebuchet MS", Roboto, sans-serif';
  ctx.fillStyle = color;
  ctx.fillRect(last.x + 4, last.y - 8, 44, 14);
  ctx.fillStyle = '#fff';
  ctx.fillText('VWAP', last.x + 8, last.y + 2);
}

export function hitVolumeProfile(at: Pixel, px: Pixel[]): number {
  if (px.length >= 2) {
    const left = Math.min(px[0].x, px[1].x);
    const right = Math.max(px[0].x, px[1].x);
    const top = Math.min(px[0].y, px[1].y);
    const bot = Math.max(px[0].y, px[1].y);
    if (at.x >= left && at.x <= right && at.y >= top && at.y <= bot) return 0;
    return Math.min(
      distanceToSegment(at, { x: left, y: top }, { x: right, y: top }),
      distanceToSegment(at, { x: left, y: bot }, { x: right, y: bot }),
      distanceToSegment(at, { x: left, y: top }, { x: left, y: bot }),
    );
  }
  return Math.hypot(at.x - px[0].x, at.y - px[0].y);
}

export function hitAnchoredVwapPath(at: Pixel, path: Pixel[]): number {
  if (path.length < 2) return Infinity;
  return distanceToPolyline(at, path);
}
