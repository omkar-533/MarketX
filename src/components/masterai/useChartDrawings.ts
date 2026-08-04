import { useCallback, useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, Logical, SeriesType } from 'lightweight-charts';
import type { ChartAnchor, ChartShape } from '../../utils/chartAnnotations';
import {
  DRAW_COLOR,
  FIB_RATIOS,
  POINTS_NEEDED,
  SHAPE_TONE,
  distanceToRect,
  distanceToSegment,
  drawingsKey,
  loadDrawings,
  logicalToTime,
  newDrawingId,
  saveDrawings,
  snapToBar,
  timeToLogical,
  type Drawing,
  type DrawPoint,
  type DrawingTool,
  type Pixel,
} from '../../services/chart/chartDrawings';
import type { ChartBar } from '../../types/chart';

const HIT_PX = 7;
const HANDLE_PX = 4;

type Drag =
  | { mode: 'new'; id: string; index: number }
  | { mode: 'handle'; id: string; index: number }
  | { mode: 'move'; id: string; from: DrawPoint }
  | null;

export interface ChartDrawingsApi {
  drawings: Drawing[];
  selectedId: string | null;
  undo: () => void;
  clear: () => void;
  removeSelected: () => void;
}

export interface UseChartDrawingsOptions {
  hostRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  chartRef: React.MutableRefObject<IChartApi | null>;
  seriesRef: React.MutableRefObject<ISeriesApi<SeriesType> | null>;
  /** Bumped whenever the chart is rebuilt, so listeners re-attach. */
  epoch: number;
  bars: ChartBar[];
  symbol: string;
  /** Read-only markings Wolf AI attached to this chart. */
  aiShapes: ChartShape[];
  tool: DrawingTool;
  /** Called once a shape is complete so the toolbar can fall back to cursor. */
  onShapeDone: () => void;
  magnet: boolean;
  isDark: boolean;
}

/**
 * Drawing tools for the native chart: creation, selection, dragging and
 * painting, on a transparent canvas stacked over the chart.
 */
export function useChartDrawings({
  hostRef,
  canvasRef,
  chartRef,
  seriesRef,
  epoch,
  bars,
  symbol,
  aiShapes,
  tool,
  onShapeDone,
  magnet,
  isDark,
}: UseChartDrawingsOptions): ChartDrawingsApi {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const storageKey = drawingsKey(symbol);
  const drawingsRef = useRef<Drawing[]>([]);
  const selectedRef = useRef<string | null>(null);
  const barsRef = useRef<ChartBar[]>(bars);
  const aiRef = useRef<ChartShape[]>(aiShapes);
  const toolRef = useRef<DrawingTool>(tool);
  const magnetRef = useRef(magnet);
  const dragRef = useRef<Drag>(null);
  const doneRef = useRef(onShapeDone);
  const aiRevisionRef = useRef(0);

  drawingsRef.current = drawings;
  selectedRef.current = selectedId;
  barsRef.current = bars;
  if (aiRef.current !== aiShapes) aiRevisionRef.current += 1;
  aiRef.current = aiShapes;
  toolRef.current = tool;
  magnetRef.current = magnet;
  doneRef.current = onShapeDone;

  // Each symbol/timeframe keeps its own set, the way a TradingView layout does.
  useEffect(() => {
    setDrawings(loadDrawings(storageKey));
    setSelectedId(null);
  }, [storageKey]);

  const commit = useCallback(
    (next: Drawing[]) => {
      drawingsRef.current = next;
      setDrawings(next);
      saveDrawings(storageKey, next);
    },
    [storageKey],
  );

  const undo = useCallback(() => {
    commit(drawingsRef.current.slice(0, -1));
    setSelectedId(null);
  }, [commit]);

  const clear = useCallback(() => {
    commit([]);
    setSelectedId(null);
  }, [commit]);

  const removeSelected = useCallback(() => {
    const id = selectedRef.current;
    if (!id) return;
    commit(drawingsRef.current.filter((d) => d.id !== id));
    setSelectedId(null);
  }, [commit]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!host || !canvas || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const timeScale = chart.timeScale();
    const toX = (time: number): number | null =>
      timeScale.logicalToCoordinate(timeToLogical(barsRef.current, time) as Logical);
    const toY = (price: number): number | null => series.priceToCoordinate(price);
    const pixelOf = (p: DrawPoint): Pixel | null => {
      const x = toX(p.time);
      const y = toY(p.price);
      return x === null || y === null ? null : { x, y };
    };

    const pointAt = (clientX: number, clientY: number): DrawPoint | null => {
      const rect = host.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const logical = timeScale.coordinateToLogical(x);
      const price = series.coordinateToPrice(y);
      if (logical === null || price === null) return null;
      const value = magnetRef.current ? snapToBar(barsRef.current, logical, price) : price;
      return { time: logicalToTime(barsRef.current, logical), price: value };
    };

    const hitTest = (at: Pixel): { drawing: Drawing; handle: number | null } | null => {
      // Topmost first so the most recently drawn shape wins.
      for (let i = drawingsRef.current.length - 1; i >= 0; i -= 1) {
        const drawing = drawingsRef.current[i];
        const pts = drawing.points.map(pixelOf);
        if (pts.some((p) => p === null)) continue;
        const px = pts as Pixel[];

        const handle = px.findIndex((p) => Math.hypot(p.x - at.x, p.y - at.y) <= HIT_PX);
        if (handle >= 0) return { drawing, handle };

        let distance = Infinity;
        if (drawing.kind === 'hline') distance = Math.abs(at.y - px[0].y);
        else if (drawing.kind === 'vline') distance = Math.abs(at.x - px[0].x);
        else if (drawing.kind === 'rect') distance = distanceToRect(at, px[0], px[1]);
        else if (drawing.kind === 'fib') {
          const left = Math.min(px[0].x, px[1].x);
          const right = Math.max(px[0].x, px[1].x);
          distance = FIB_RATIOS.reduce((best, ratio) => {
            const y = px[0].y + (px[1].y - px[0].y) * ratio;
            const gap =
              at.x >= left - HIT_PX && at.x <= right + HIT_PX ? Math.abs(at.y - y) : Infinity;
            return Math.min(best, gap);
          }, Infinity);
        } else if (drawing.kind === 'ray') {
          const dx = px[1].x - px[0].x;
          const dy = px[1].y - px[0].y;
          const far = { x: px[1].x + dx * 400, y: px[1].y + dy * 400 };
          distance = distanceToSegment(at, px[0], far);
        } else {
          distance = distanceToSegment(at, px[0], px[1]);
        }

        if (distance <= HIT_PX) return { drawing, handle: null };
      }
      return null;
    };

    /**
     * Anchor from the model: a bar offset (0 = latest, -30 = thirty bars back),
     * a unix timestamp, or an ISO date read off a screenshot.
     */
    const anchorLogical = (anchor: ChartAnchor | undefined, fallback: number): number => {
      const last = Math.max(0, barsRef.current.length - 1);
      if (typeof anchor === 'number') {
        return Math.abs(anchor) > 100_000 ? timeToLogical(barsRef.current, anchor) : last + anchor;
      }
      if (typeof anchor === 'string') {
        const ms = Date.parse(anchor);
        if (Number.isFinite(ms)) return timeToLogical(barsRef.current, ms / 1000);
      }
      return last + fallback;
    };
    const anchorX = (anchor: ChartAnchor | undefined, fallback: number): number | null =>
      timeScale.logicalToCoordinate(anchorLogical(anchor, fallback) as Logical);

    const labelColor = isDark ? '#d1d4dc' : '#131722';

    const chip = (text: string, x: number, y: number, color: string) => {
      if (!text) return;
      ctx.font = '600 10px "Trebuchet MS", Roboto, sans-serif';
      ctx.textBaseline = 'middle';
      const width = ctx.measureText(text).width + 8;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, y - 7, width, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 4, y);
    };

    /**
     * Wolf AI answers from the live tape, so it knows the price band but not
     * which candle formed it. Guessing a fixed offset drops the box in empty
     * space; instead the band starts at the last stretch of candles that
     * actually traded inside it — the block itself — and runs forward from
     * there. A band price has never visited spans the full width.
     */
    const zoneOriginX = (p1: number, p2: number): number | null => {
      const bars = barsRef.current;
      const top = Math.max(p1, p2);
      const bottom = Math.min(p1, p2);
      const touches = (i: number) => bars[i].low <= top && bars[i].high >= bottom;

      let end = -1;
      for (let i = bars.length - 1; i >= 0; i -= 1) {
        if (touches(i)) {
          end = i;
          break;
        }
      }
      if (end < 0) return 0;
      let start = end;
      while (start > 0 && touches(start - 1)) start -= 1;
      return timeScale.logicalToCoordinate(start as Logical);
    };

    /**
     * A zone reads best the way a trader draws it by hand: the name sitting in
     * the middle of the band, not a tag stuck to one corner. Narrow or short
     * boxes fall back to a chip so the text never spills outside the band.
     */
    const zoneLabel = (
      text: string,
      left: number,
      right: number,
      top: number,
      bottom: number,
      color: string,
    ) => {
      if (!text) return;
      ctx.font = '600 11px "Trebuchet MS", Roboto, sans-serif';
      const width = ctx.measureText(text).width;
      if (right - left < width + 24 || bottom - top < 18) {
        chip(text, left + 4, top + 8, color);
        return;
      }
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(text, (left + right) / 2, (top + bottom) / 2);
      ctx.textAlign = 'left';
    };

    /** Wolf AI's markings: read-only, drawn under anything the user added. */
    const paintAiShapes = (paneWidth: number, paneHeight: number) => {
      for (const shape of aiRef.current) {
        const tone = SHAPE_TONE[shape.tone];
        const y1 = shape.p1 === undefined ? null : toY(shape.p1);
        const y2 = shape.p2 === undefined ? null : toY(shape.p2);

        ctx.strokeStyle = tone.line;
        ctx.fillStyle = tone.fill;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);

        if (shape.type === 'zone' || shape.type === 'fib') {
          if (y1 === null || y2 === null) continue;
          const left =
            (shape.type === 'zone' && shape.x1 === undefined
              ? zoneOriginX(shape.p1!, shape.p2!)
              : anchorX(shape.x1, -45)) ?? 0;
          let right = shape.x2 === undefined ? paneWidth : (anchorX(shape.x2, 6) ?? paneWidth);
          // An order block is only useful ahead of price, so the band always
          // runs past the latest candle the way a trader would extend it.
          if (shape.type === 'zone') {
            const lastX = anchorX(0, 0);
            if (lastX !== null) right = Math.max(right, Math.min(paneWidth, lastX + 48));
          }
          const top = Math.min(y1, y2);
          const bottom = Math.max(y1, y2);

          if (shape.type === 'zone') {
            ctx.fillRect(left, top, right - left, bottom - top);
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(left, top, right - left, bottom - top);
            ctx.setLineDash([]);
            zoneLabel(shape.label, left, right, top, bottom, tone.line);
          } else {
            ctx.font = '10px "Trebuchet MS", Roboto, sans-serif';
            ctx.textBaseline = 'bottom';
            FIB_RATIOS.forEach((ratio) => {
              const y = y1 + (y2 - y1) * ratio;
              ctx.beginPath();
              ctx.moveTo(left, y);
              ctx.lineTo(right, y);
              ctx.stroke();
              const price = shape.p1! + (shape.p2! - shape.p1!) * ratio;
              ctx.fillStyle = labelColor;
              ctx.fillText(`${ratio.toFixed(3)}  ${price.toFixed(2)}`, left + 4, y - 2);
              ctx.fillStyle = tone.fill;
            });
            chip(shape.label, left + 4, Math.min(y1, y2) + 8, tone.line);
          }
          continue;
        }

        if (shape.type === 'vline') {
          const x = anchorX(shape.x1, 0);
          if (x === null) continue;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, paneHeight);
          ctx.stroke();
          ctx.setLineDash([]);
          chip(shape.label, x + 4, 12, tone.line);
          continue;
        }

        /**
         * TradingView-style S/R from the user's reference shot:
         * blue horizontal RAY from the swing wick → right edge,
         * short red vertical tick on the wick, red SUPPORT/RESISTANCE tag
         * at the ray origin (above for resistance, below for support).
         */
        const paintSrRay = () => {
          if (y1 === null || shape.p1 === undefined) return;
          const startRaw =
            shape.x1 === undefined
              ? zoneOriginX(shape.p1, shape.p1)
              : anchorX(shape.x1, -12);
          const x0 = Math.min(Math.max(6, startRaw ?? paneWidth * 0.4), paneWidth - 48);
          const isRes = /resistance/i.test(shape.label || '');
          const tick = 12;

          // Red vertical connector on the swing wick.
          ctx.strokeStyle = '#ef5350';
          ctx.lineWidth = 1.25;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(x0, isRes ? y1 - tick : y1);
          ctx.lineTo(x0, isRes ? y1 : y1 + tick);
          ctx.stroke();

          // Blue ray from that wick to the right (not full-width left).
          ctx.strokeStyle = '#2962ff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x0, y1);
          ctx.lineTo(paneWidth - 4, y1);
          ctx.stroke();

          // Red uppercase label at the ray start.
          ctx.font = '700 12px "Trebuchet MS", Roboto, sans-serif';
          ctx.fillStyle = '#ef5350';
          ctx.textBaseline = isRes ? 'bottom' : 'top';
          ctx.textAlign = 'left';
          ctx.fillText(
            String(shape.label || '').toUpperCase(),
            x0 + 5,
            isRes ? y1 - 4 : y1 + 4,
          );

          // Price chip at the right edge (axis-style read).
          const priceTxt = Number(shape.p1).toLocaleString('en-IN', {
            maximumFractionDigits: 2,
          });
          ctx.font = '600 10px "Trebuchet MS", Roboto, sans-serif';
          const tw = ctx.measureText(priceTxt).width;
          const bx = paneWidth - tw - 14;
          const by = y1 - 8;
          ctx.fillStyle = '#2962ff';
          ctx.fillRect(bx - 4, by, tw + 8, 16);
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(priceTxt, bx, y1);
          ctx.textBaseline = 'alphabetic';
        };

        if (shape.type === 'hline') {
          if (y1 === null) continue;
          if (/^(support|resistance)$/i.test(shape.label || '')) {
            paintSrRay();
            continue;
          }
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y1);
          ctx.lineTo(paneWidth, y1);
          ctx.stroke();
          ctx.setLineDash([]);
          chip(shape.label, 8, y1 - 2, tone.line);
          continue;
        }

        if (shape.type === 'hray') {
          if (y1 === null) continue;
          if (/^(support|resistance)$/i.test(shape.label || '')) {
            paintSrRay();
            continue;
          }
          const start =
            (shape.x1 === undefined
              ? zoneOriginX(shape.p1!, shape.p1!)
              : anchorX(shape.x1, -20)) ?? 0;
          ctx.beginPath();
          ctx.moveTo(start, y1);
          ctx.lineTo(paneWidth + 200, y1);
          ctx.stroke();
          chip(shape.label, Math.min(start + 8, paneWidth - 80), y1 - 2, tone.line);
          continue;
        }

        if (shape.type === 'label' || shape.type === 'callout') {
          if (y1 === null) continue;
          // Prefer the model's bar offset; otherwise sit the tag on the last
          // candle that actually printed that swing price.
          let x = shape.x1 === undefined ? null : anchorX(shape.x1, -6);
          if (x === null && shape.p1 !== undefined) {
            x = zoneOriginX(shape.p1, shape.p1);
          }
          x = x ?? anchorX(undefined, -6) ?? 0;
          if (shape.type === 'callout') {
            const tipX = Math.min(x + 56, paneWidth - 8);
            const tipY = Math.max(12, y1 - 28);
            ctx.beginPath();
            ctx.moveTo(x, y1);
            ctx.lineTo(tipX - 4, tipY + 6);
            ctx.stroke();
            chip(shape.label, tipX - 4, tipY, tone.line);
          } else {
            ctx.beginPath();
            ctx.arc(x, y1, 3, 0, Math.PI * 2);
            ctx.fillStyle = tone.line;
            ctx.fill();
            chip(shape.label, x + 6, y1, tone.line);
          }
          continue;
        }

        // trend / ray / arrow
        if (y1 === null || y2 === null) continue;
        const x1 = anchorX(shape.x1, -45);
        const x2 = anchorX(shape.x2, 0);
        if (x1 === null || x2 === null) continue;
        const isTrend =
          shape.type === 'trend' ||
          (shape.type === 'ray' && /trend/i.test(shape.label || '')) ||
          /trend/i.test(shape.label || '');
        let endX = x2;
        let endY = y2;
        // Gold-TV look: thin solid blue, start at first wick, extend right.
        ctx.strokeStyle = isTrend ? '#2962ff' : tone.line;
        ctx.lineWidth = isTrend ? 1.5 : 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        if (shape.type === 'ray') {
          const dx = x2 - x1 || 1;
          const dy = y2 - y1;
          const t = (paneWidth - 8 - x1) / dx;
          endX = paneWidth - 8;
          endY = y1 + dy * Math.max(t, 1);
          ctx.lineTo(endX, endY);
        } else {
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
        ctx.strokeStyle = tone.line;
        ctx.lineWidth = 1.5;
        if (isTrend) {
          // Small wick anchors (not heavy dots).
          ctx.fillStyle = '#2962ff';
          ctx.beginPath();
          ctx.arc(x1, y1, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x2, y2, 2.5, 0, Math.PI * 2);
          ctx.fill();
          // Compact label at the first anchor — TV style, not a fat chip mid-line.
          const isUpper = /upper/i.test(shape.label || '');
          ctx.font = '600 11px "Trebuchet MS", Roboto, sans-serif';
          ctx.fillStyle = '#2962ff';
          ctx.textBaseline = isUpper ? 'bottom' : 'top';
          ctx.textAlign = 'left';
          const raw = String(shape.label || 'Trend');
          const tag = /uptrend/i.test(raw)
            ? 'Uptrend'
            : /downtrend/i.test(raw)
              ? 'Downtrend'
              : /channel\s*high|upper/i.test(raw)
                ? 'Channel high'
                : /channel\s*low|lower/i.test(raw)
                  ? 'Channel low'
                  : raw.slice(0, 18);
          const labelAbove = isUpper || /downtrend|channel\s*high/i.test(raw);
          ctx.textBaseline = labelAbove ? 'bottom' : 'top';
          ctx.fillText(tag, Math.min(Math.max(6, x1 + 4), paneWidth - 72), labelAbove ? y1 - 4 : y1 + 4);
        } else if (shape.type === 'arrow') {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = 9;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(
            x2 - head * Math.cos(angle - Math.PI / 6),
            y2 - head * Math.sin(angle - Math.PI / 6),
          );
          ctx.lineTo(
            x2 - head * Math.cos(angle + Math.PI / 6),
            y2 - head * Math.sin(angle + Math.PI / 6),
          );
          ctx.closePath();
          ctx.fillStyle = tone.line;
          ctx.fill();
          chip(shape.label, x2 + 6, y2, tone.line);
        } else {
          chip(shape.label, x2 + 6, y2, tone.line);
        }
      }
    };

    const paint = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Keep shapes inside the price pane — never over the axes or a study pane.
      const paneWidth = timeScale.width() || width;
      const paneHeight = chart.panes()[0]?.getHeight() ?? height;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, paneWidth, paneHeight);
      ctx.clip();

      paintAiShapes(paneWidth, paneHeight);

      for (const drawing of drawingsRef.current) {
        const pts = drawing.points.map(pixelOf);
        if (pts.some((p) => p === null)) continue;
        const px = pts as Pixel[];
        const selected = drawing.id === selectedRef.current;

        ctx.strokeStyle = drawing.color;
        ctx.lineWidth = selected ? 2 : 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();

        if (drawing.kind === 'hline') {
          ctx.moveTo(0, px[0].y);
          ctx.lineTo(paneWidth, px[0].y);
          ctx.stroke();
        } else if (drawing.kind === 'vline') {
          ctx.moveTo(px[0].x, 0);
          ctx.lineTo(px[0].x, paneHeight);
          ctx.stroke();
        } else if (drawing.kind === 'rect') {
          const x = Math.min(px[0].x, px[1].x);
          const y = Math.min(px[0].y, px[1].y);
          const w = Math.abs(px[1].x - px[0].x);
          const h = Math.abs(px[1].y - px[0].y);
          ctx.fillStyle = 'rgba(41,98,255,0.12)';
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        } else if (drawing.kind === 'fib') {
          const left = Math.min(px[0].x, px[1].x);
          const right = Math.max(px[0].x, px[1].x);
          const priceSpan = drawing.points[1].price - drawing.points[0].price;
          ctx.font = '10px "Trebuchet MS", Roboto, sans-serif';
          ctx.textBaseline = 'bottom';
          FIB_RATIOS.forEach((ratio, i) => {
            const y = px[0].y + (px[1].y - px[0].y) * ratio;
            if (i > 0) {
              const prevY = px[0].y + (px[1].y - px[0].y) * FIB_RATIOS[i - 1];
              ctx.fillStyle = i % 2 ? 'rgba(41,98,255,0.06)' : 'rgba(41,98,255,0.12)';
              ctx.fillRect(left, Math.min(prevY, y), right - left, Math.abs(y - prevY));
            }
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.stroke();
            const price = drawing.points[0].price + priceSpan * ratio;
            ctx.fillStyle = labelColor;
            ctx.fillText(`${ratio.toFixed(3)}  ${price.toFixed(2)}`, left + 4, y - 2);
          });
        } else if (drawing.kind === 'ray') {
          const dx = px[1].x - px[0].x;
          const dy = px[1].y - px[0].y;
          ctx.moveTo(px[0].x, px[0].y);
          ctx.lineTo(px[1].x + dx * 400, px[1].y + dy * 400);
          ctx.stroke();
        } else {
          ctx.moveTo(px[0].x, px[0].y);
          ctx.lineTo(px[1].x, px[1].y);
          ctx.stroke();
        }

        if (selected) {
          ctx.fillStyle = drawing.color;
          px.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, HANDLE_PX, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }

      ctx.restore();
    };

    // The price scale can be dragged without firing any chart event, so the
    // mapping is re-read every frame and repainted only when it moved.
    let raf = 0;
    let signature = '';
    const tick = () => {
      // An empty chart should cost nothing per frame.
      if (!drawingsRef.current.length && !aiRef.current.length) {
        if (signature !== 'empty') {
          signature = 'empty';
          paint();
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const probe = barsRef.current[0];
      const lastBar = barsRef.current[barsRef.current.length - 1];
      const next = [
        host.clientWidth,
        host.clientHeight,
        timeScale.logicalToCoordinate(0 as Logical),
        timeScale.logicalToCoordinate(100 as Logical),
        probe ? series.priceToCoordinate(probe.close) : 0,
        probe ? series.priceToCoordinate(probe.close * 1.01) : 0,
        drawingsRef.current.length,
        // A fresh set of AI shapes can be the same length as the old one, and
        // bar-offset anchors move as soon as a new candle arrives.
        aiRevisionRef.current,
        barsRef.current.length,
        lastBar ? lastBar.time : 0,
        selectedRef.current,
      ].join('|');
      if (next !== signature) {
        signature = next;
        paint();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const repaint = () => {
      signature = '';
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      const at: Pixel = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const point = pointAt(event.clientX, event.clientY);
      if (!point) return;

      const activeTool = toolRef.current;
      if (activeTool === 'cursor') {
        const hit = hitTest(at);
        if (!hit) {
          if (selectedRef.current) {
            setSelectedId(null);
            repaint();
          }
          return; // let the chart pan
        }
        event.stopPropagation();
        event.preventDefault();
        setSelectedId(hit.drawing.id);
        dragRef.current =
          hit.handle === null
            ? { mode: 'move', id: hit.drawing.id, from: point }
            : { mode: 'handle', id: hit.drawing.id, index: hit.handle };
        repaint();
        return;
      }

      event.stopPropagation();
      event.preventDefault();

      const needed = POINTS_NEEDED[activeTool];
      const id = newDrawingId();
      const shape: Drawing = {
        id,
        kind: activeTool,
        points: needed === 1 ? [point] : [point, point],
        color: DRAW_COLOR,
      };
      commit([...drawingsRef.current, shape]);
      setSelectedId(id);
      if (needed === 1) {
        doneRef.current();
      } else {
        dragRef.current = { mode: 'new', id, index: 1 };
      }
      repaint();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = pointAt(event.clientX, event.clientY);
      if (!point) return;
      event.preventDefault();

      const next = drawingsRef.current.map((d) => {
        if (d.id !== drag.id) return d;
        if (drag.mode === 'move') {
          const dt = point.time - drag.from.time;
          const dp = point.price - drag.from.price;
          return { ...d, points: d.points.map((p) => ({ time: p.time + dt, price: p.price + dp })) };
        }
        const points = [...d.points];
        points[drag.index] = point;
        return { ...d, points };
      });
      if (drag.mode === 'move') dragRef.current = { ...drag, from: point };
      drawingsRef.current = next;
      setDrawings(next);
      repaint();
    };

    const onPointerUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;

      // A click without a drag leaves a zero-length shape; drop it.
      if (drag.mode === 'new') {
        const shape = drawingsRef.current.find((d) => d.id === drag.id);
        const [a, b] = shape?.points ?? [];
        if (a && b && a.time === b.time && a.price === b.price) {
          drawingsRef.current = drawingsRef.current.filter((d) => d.id !== drag.id);
          setDrawings(drawingsRef.current);
          setSelectedId(null);
        }
      }

      saveDrawings(storageKey, drawingsRef.current);
      if (drag.mode === 'new') doneRef.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null);
        repaint();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!selectedRef.current) return;
      event.preventDefault();
      commit(drawingsRef.current.filter((d) => d.id !== selectedRef.current));
      setSelectedId(null);
      repaint();
    };

    /**
     * The chart also listens for mouse/touch events of its own, which pointer
     * events do not cancel — they have to be swallowed separately or the chart
     * pans underneath the shape being drawn.
     */
    const blockChartGesture = (event: Event) => {
      if (toolRef.current === 'cursor' && !dragRef.current) return;
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
    };

    // Capture phase: a drawing gesture must win before the chart starts panning.
    host.addEventListener('pointerdown', onPointerDown, true);
    host.addEventListener('mousedown', blockChartGesture, true);
    host.addEventListener('touchstart', blockChartGesture, { capture: true, passive: false });
    host.addEventListener('touchmove', blockChartGesture, { capture: true, passive: false });
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointerdown', onPointerDown, true);
      host.removeEventListener('mousedown', blockChartGesture, true);
      host.removeEventListener('touchstart', blockChartGesture, true);
      host.removeEventListener('touchmove', blockChartGesture, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('keydown', onKeyDown);
      dragRef.current = null;
    };
  }, [hostRef, canvasRef, chartRef, seriesRef, epoch, commit, storageKey, isDark]);

  return { drawings, selectedId, undo, clear, removeSelected };
}
