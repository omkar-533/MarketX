import { useCallback, useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, Logical, SeriesType } from 'lightweight-charts';
import type { ChartAnchor, ChartShape } from '../../utils/chartAnnotations';
import {
  POINTS_NEEDED,
  SHAPE_TONE,
  FIB_RATIOS,
  defaultColorFor,
  defaultLabelFor,
  drawingsKey,
  formatMeasureLabel,
  isContinuousKind,
  isDrawingKind,
  isEphemeralKind,
  loadDrawings,
  logicalToTime,
  newDrawingId,
  saveDrawings,
  snapToBar,
  timeToLogical,
  type Drawing,
  type DrawPoint,
  type DrawingKind,
  type DrawingTool,
  type MagnetMode,
  type Pixel,
} from '../../services/chart/chartDrawings';
import { hitUserDrawing, paintUserDrawing } from '../../services/chart/chartDrawPaint';
import type { ChartBar } from '../../types/chart';

const HIT_PX_FINE = 8;
const HIT_PX_COARSE = 16;
const HANDLE_R = 4.5;

function hitRadiusPx(): number {
  if (typeof window === 'undefined') return HIT_PX_FINE;
  try {
    return window.matchMedia('(pointer: coarse)').matches ? HIT_PX_COARSE : HIT_PX_FINE;
  } catch {
    return HIT_PX_FINE;
  }
}

type Drag =
  | { mode: 'new'; id: string; index: number }
  | { mode: 'handle'; id: string; index: number }
  | { mode: 'move'; id: string; from: DrawPoint }
  | { mode: 'zoom'; a: Pixel; b: Pixel }
  | null;

export interface ChartDrawingsApi {
  drawings: Drawing[];
  selectedId: string | null;
  undo: () => void;
  clear: () => void;
  removeSelected: () => void;
  /** Replace the whole drawing set (templates / paste). */
  replaceAll: (next: Drawing[]) => void;
  /** Append one drawing. */
  addDrawing: (drawing: Drawing) => void;
  /** Patch one drawing by id (style / lock / points…). */
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  /** Patch the selected drawing. */
  updateSelected: (patch: Partial<Drawing>) => void;
  selectDrawing: (id: string | null) => void;
  cloneSelected: () => void;
  /** Visual order — TradingView bring to front / send to back. */
  reorderSelected: (dir: 'front' | 'forward' | 'backward' | 'back') => void;
}

export interface UseChartDrawingsOptions {
  /** Chart + overlay container — pointer capture attaches here so tools always receive clicks. */
  areaRef: React.RefObject<HTMLDivElement | null>;
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
  onShapeDone: (info?: { kind: DrawingKind }) => void;
  /** Double-click a drawing → open properties (TradingView). */
  onOpenDrawingSettings?: (id: string) => void;
  magnetMode: MagnetMode;
  lockDrawings: boolean;
  hideDrawings: boolean;
  hideIndicators: boolean;
  removeLocked: boolean;
  isDark: boolean;
}

/**
 * Drawing tools for the native chart: creation, selection, dragging and
 * painting, on a transparent canvas stacked over the chart.
 */
export function useChartDrawings({
  areaRef,
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
  onOpenDrawingSettings,
  magnetMode,
  lockDrawings,
  hideDrawings,
  hideIndicators,
  removeLocked,
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
  const magnetRef = useRef<MagnetMode>(magnetMode);
  const lockRef = useRef(lockDrawings);
  const hideDrawRef = useRef(hideDrawings);
  const hideIndRef = useRef(hideIndicators);
  const removeLockedRef = useRef(removeLocked);
  const dragRef = useRef<Drag>(null);
  const placeRef = useRef<{ id: string; nextIndex: number; needed: number } | null>(null);
  const doneRef = useRef(onShapeDone);
  const openSettingsRef = useRef(onOpenDrawingSettings);
  const aiRevisionRef = useRef(0);
  const drawRevisionRef = useRef(0);

  drawingsRef.current = drawings;
  selectedRef.current = selectedId;
  barsRef.current = bars;
  if (aiRef.current !== aiShapes) aiRevisionRef.current += 1;
  aiRef.current = aiShapes;
  toolRef.current = tool;
  magnetRef.current = magnetMode;
  lockRef.current = lockDrawings;
  hideDrawRef.current = hideDrawings;
  hideIndRef.current = hideIndicators;
  removeLockedRef.current = removeLocked;
  doneRef.current = onShapeDone;
  openSettingsRef.current = onOpenDrawingSettings;

  useEffect(() => {
    placeRef.current = null;
  }, [tool]);

  // Each symbol/timeframe keeps its own set, the way a TradingView layout does.
  useEffect(() => {
    setDrawings(loadDrawings(storageKey));
    setSelectedId(null);
  }, [storageKey]);

  const commit = useCallback(
    (next: Drawing[]) => {
      drawingsRef.current = next;
      drawRevisionRef.current += 1;
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
    if (removeLocked) {
      commit([]);
    } else {
      commit(drawingsRef.current.filter((d) => d.locked));
    }
    setSelectedId(null);
  }, [commit, removeLocked]);

  const removeSelected = useCallback(() => {
    const id = selectedRef.current;
    if (!id) return;
    commit(drawingsRef.current.filter((d) => d.id !== id));
    setSelectedId(null);
  }, [commit]);

  const replaceAll = useCallback(
    (next: Drawing[]) => {
      commit(next);
      setSelectedId(null);
    },
    [commit],
  );

  const addDrawing = useCallback(
    (drawing: Drawing) => {
      commit([...drawingsRef.current, drawing]);
    },
    [commit],
  );

  const updateDrawing = useCallback(
    (id: string, patch: Partial<Drawing>) => {
      const next = drawingsRef.current.map((d) => (d.id === id ? { ...d, ...patch, id: d.id, kind: d.kind } : d));
      commit(next);
    },
    [commit],
  );

  const updateSelected = useCallback(
    (patch: Partial<Drawing>) => {
      const id = selectedRef.current;
      if (!id) return;
      updateDrawing(id, patch);
    },
    [updateDrawing],
  );

  const selectDrawing = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const cloneSelected = useCallback(() => {
    const id = selectedRef.current;
    if (!id) return;
    const src = drawingsRef.current.find((d) => d.id === id);
    if (!src) return;
    const clone: Drawing = {
      ...src,
      id: newDrawingId(),
      points: src.points.map((p) => ({
        time: p.time,
        price: p.price * 1.0000, // keep nums
      })),
      locked: false,
    };
    // Nudge so the clone isn't fully stacked.
    if (clone.points.length) {
      const bars = barsRef.current;
      const step = bars.length > 1 ? Math.abs(bars[1].time - bars[0].time) : 60;
      clone.points = clone.points.map((p) => ({ time: p.time + step * 2, price: p.price }));
    }
    commit([...drawingsRef.current, clone]);
    setSelectedId(clone.id);
  }, [commit]);

  const reorderSelected = useCallback(
    (dir: 'front' | 'forward' | 'backward' | 'back') => {
      const id = selectedRef.current;
      if (!id) return;
      const list = [...drawingsRef.current];
      const idx = list.findIndex((d) => d.id === id);
      if (idx < 0) return;
      const [item] = list.splice(idx, 1);
      if (dir === 'front') list.push(item);
      else if (dir === 'back') list.unshift(item);
      else if (dir === 'forward') list.splice(Math.min(list.length, idx + 1), 0, item);
      else list.splice(Math.max(0, idx - 1), 0, item);
      commit(list);
    },
    [commit],
  );

  useEffect(() => {
    const area = areaRef.current;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!area || !host || !canvas || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const timeScale = chart.timeScale();
    const toX = (time: number): number | null =>
      timeScale.logicalToCoordinate(timeToLogical(barsRef.current, time) as Logical);
    const toY = (price: number): number | null => {
      const direct = series.priceToCoordinate(price);
      if (direct !== null) return direct;
      // Autoscale lag / extreme AI prices — map via bar range so marks still paint.
      const bars = barsRef.current;
      if (!bars.length || !(price > 0)) return null;
      let min = Infinity;
      let max = -Infinity;
      for (const b of bars) {
        if (b.low < min) min = b.low;
        if (b.high > max) max = b.high;
      }
      for (const s of aiRef.current) {
        if (typeof s.p1 === 'number' && s.p1 > 0) {
          min = Math.min(min, s.p1);
          max = Math.max(max, s.p1);
        }
        if (typeof s.p2 === 'number' && s.p2 > 0) {
          min = Math.min(min, s.p2);
          max = Math.max(max, s.p2);
        }
      }
      if (!(max > min)) return null;
      const paneH = chart.panes()[0]?.getHeight() ?? host.clientHeight;
      const top = paneH * 0.08;
      const usable = paneH * 0.68;
      return top + ((max - price) / (max - min)) * usable;
    };
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
      let price: number | null = series.coordinateToPrice(y);
      if (logical === null) return null;
      // Off-pane / scale lag — fall back so tools still place.
      if (price === null || !Number.isFinite(price)) {
        const bars = barsRef.current;
        if (!bars.length) return null;
        let min = Infinity;
        let max = -Infinity;
        for (const b of bars) {
          if (b.low < min) min = b.low;
          if (b.high > max) max = b.high;
        }
        if (!(max > min)) return null;
        const paneH = chart.panes()[0]?.getHeight() ?? host.clientHeight;
        const top = paneH * 0.08;
        const usable = Math.max(1, paneH * 0.68);
        const t = Math.min(1, Math.max(0, (y - top) / usable));
        price = max - t * (max - min);
      }
      const value = snapToBar(barsRef.current, logical, price, magnetRef.current);
      return { time: logicalToTime(barsRef.current, logical), price: value };
    };

    const hitTest = (at: Pixel): { drawing: Drawing; handle: number | null } | null => {
      for (let i = drawingsRef.current.length - 1; i >= 0; i -= 1) {
        const drawing = drawingsRef.current[i];
        // Hidden objects are only reachable from object tree / settings.
        if (drawing.visible === false && drawing.id !== selectedRef.current) continue;
        const pts = drawing.points.map(pixelOf);
        if (pts.some((p) => p === null)) continue;
        const px = pts as Pixel[];

        const hitPx = hitRadiusPx();
        const handle = px.findIndex((p) => Math.hypot(p.x - at.x, p.y - at.y) <= hitPx);
        if (handle >= 0) return { drawing, handle };

        if (hitUserDrawing(at, drawing, px, host.clientWidth, host.clientHeight) <= hitPx) {
          return { drawing, handle: null };
        }
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
            const isPineOb = Boolean(shape.borderColor || shape.fillColor) ||
              /^(bull|bear)\s*ob\b/i.test(shape.label || '');
            if (isPineOb) {
              // Pine box.new: solid border, translucent bgcolor, extend.right
              const border = shape.borderColor || shape.color || tone.line;
              const fill =
                shape.fillColor ||
                (border === '#00ff9d'
                  ? 'rgba(0,255,157,0.15)'
                  : border === '#ff4d4d'
                    ? 'rgba(255,77,77,0.15)'
                    : tone.fill);
              ctx.fillStyle = fill;
              ctx.strokeStyle = border;
              ctx.lineWidth = 1.5;
              ctx.setLineDash([]);
              ctx.fillRect(left, top, right - left, bottom - top);
              ctx.strokeRect(left, top, right - left, bottom - top);
              zoneLabel(shape.label, left, right, top, bottom, border);
            } else {
              ctx.fillRect(left, top, right - left, bottom - top);
              ctx.setLineDash([5, 4]);
              ctx.strokeRect(left, top, right - left, bottom - top);
              ctx.setLineDash([]);
              zoneLabel(shape.label, left, right, top, bottom, tone.line);
            }
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

          /**
           * Pine liquidity look:
           * line.new(..., extend.right, style_dotted, width=2, color)
           * label.new(..., style_label_left, color.new(col,20), textcolor white)
           */
          const isPineLiq =
            shape.lineStyle === 'dotted' ||
            /^(BSL|SSL|PDH|PDL|PWH|PWL|PMH|PML)\b/i.test(shape.label || '');
          const start =
            (shape.x1 === undefined
              ? zoneOriginX(shape.p1!, shape.p1!)
              : anchorX(shape.x1, -20)) ?? 0;
          const x0 = Math.min(Math.max(4, start), paneWidth - 40);

          if (isPineLiq) {
            const col =
              shape.color ||
              (/^BSL/i.test(shape.label)
                ? '#ef5350'
                : /^SSL/i.test(shape.label)
                  ? '#26a69a'
                  : /^PDH|^PDL/i.test(shape.label)
                    ? '#ff9800'
                    : /^PWH|^PWL/i.test(shape.label)
                      ? '#f0b90b'
                      : /^PMH|^PML/i.test(shape.label)
                        ? '#2962ff'
                        : tone.line);
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(x0, y1);
            ctx.lineTo(paneWidth - 4, y1);
            ctx.stroke();
            ctx.setLineDash([]);

            const text = String(shape.label || '').slice(0, 28);
            ctx.font = '600 10px "Trebuchet MS", Roboto, sans-serif';
            const tw = ctx.measureText(text).width;
            const padX = 5;
            const h = 15;
            const bx = x0 + 2;
            const by = y1 - h / 2;
            // color.new(col, 20) ≈ 80% opaque fill
            ctx.globalAlpha = 0.82;
            ctx.fillStyle = col;
            ctx.beginPath();
            const r = 3;
            ctx.moveTo(bx + r, by);
            ctx.arcTo(bx + tw + padX * 2, by, bx + tw + padX * 2, by + h, r);
            ctx.arcTo(bx + tw + padX * 2, by + h, bx, by + h, r);
            ctx.arcTo(bx, by + h, bx, by, r);
            ctx.arcTo(bx, by, bx + tw + padX * 2, by, r);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(text, bx + padX, y1);
            ctx.textBaseline = 'alphabetic';
            continue;
          }

          ctx.beginPath();
          ctx.moveTo(x0, y1);
          ctx.lineTo(paneWidth + 200, y1);
          ctx.stroke();
          chip(shape.label, Math.min(x0 + 8, paneWidth - 80), y1 - 2, tone.line);
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

        // trend / ray / arrow — never skip when timescale isn't ready yet;
        // clamp to the pane so "marked" replies always paint visible lines.
        if (y1 === null || y2 === null) continue;
        const x1 = anchorX(shape.x1, -45) ?? 8;
        const x2 = anchorX(shape.x2, 0) ?? Math.max(x1 + 40, paneWidth - 8);
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

      if (!hideIndRef.current) paintAiShapes(paneWidth, paneHeight);

      if (!hideDrawRef.current) {
        for (const drawing of drawingsRef.current) {
          const selected = drawing.id === selectedRef.current;
          if (drawing.visible === false && !selected) continue;
          const pts = drawing.points.map(pixelOf);
          if (pts.some((p) => p === null)) continue;
          const px = pts as Pixel[];
          paintUserDrawing(ctx, drawing, px, paneWidth, paneHeight, labelColor, selected, {
            bars: barsRef.current,
            map: {
              priceToY: (price) => {
                const y = series.priceToCoordinate(price);
                return y == null || !Number.isFinite(Number(y)) ? null : Number(y);
              },
              timeToX: (time) => {
                const x = timeScale.logicalToCoordinate(
                  timeToLogical(barsRef.current, time) as Logical,
                );
                return x == null || !Number.isFinite(Number(x)) ? null : Number(x);
              },
            },
          });

          if (selected && !lockRef.current && !drawing.locked) {
            px.forEach((p) => {
              // TradingView-style handle: white fill + blue ring.
              ctx.beginPath();
              ctx.arc(p.x, p.y, HANDLE_R + 1.5, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.lineWidth = 2;
              ctx.strokeStyle = drawing.color || '#2962ff';
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
              ctx.fillStyle = drawing.color || '#2962ff';
              ctx.fill();
            });
          }
        }
      }

      // Rubber-band crosshair tip while placing.
      const placing = placeRef.current;
      if (placing) {
        const d = drawingsRef.current.find((x) => x.id === placing.id);
        const tip = d?.points[placing.nextIndex];
        if (tip) {
          const p = pixelOf(tip);
          if (p) {
            ctx.save();
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = 'rgba(41,98,255,0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, 0);
            ctx.lineTo(p.x, paneHeight);
            ctx.moveTo(0, p.y);
            ctx.lineTo(paneWidth, p.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#2962ff';
            ctx.fill();
            ctx.restore();
          }
        }
      }

      const zoomDrag = dragRef.current;
      if (zoomDrag && zoomDrag.mode === 'zoom') {
        const x = Math.min(zoomDrag.a.x, zoomDrag.b.x);
        const y = Math.min(zoomDrag.a.y, zoomDrag.b.y);
        const w = Math.abs(zoomDrag.b.x - zoomDrag.a.x);
        const h = Math.abs(zoomDrag.b.y - zoomDrag.a.y);
        ctx.fillStyle = 'rgba(41,98,255,0.12)';
        ctx.strokeStyle = '#2962ff';
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
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
        drawRevisionRef.current,
        // A fresh set of AI shapes can be the same length as the old one, and
        // bar-offset anchors move as soon as a new candle arrives.
        aiRevisionRef.current,
        barsRef.current.length,
        lastBar ? lastBar.time : 0,
        selectedRef.current,
        hideDrawRef.current ? 1 : 0,
        hideIndRef.current ? 1 : 0,
        dragRef.current?.mode === 'zoom' ? 1 : 0,
        placeRef.current
          ? `${placeRef.current.id}:${placeRef.current.nextIndex}:${
              drawingsRef.current.find((d) => d.id === placeRef.current!.id)?.points[
                placeRef.current.nextIndex
              ]?.price ?? 0
            }`
          : '',
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

    const finishShape = (kind: DrawingKind) => {
      placeRef.current = null;
      dragRef.current = null;
      saveDrawings(storageKey, drawingsRef.current);
      doneRef.current({ kind });
      repaint();
    };

    const updateRubberBand = (point: DrawPoint) => {
      const pending = placeRef.current;
      if (!pending) return false;
      const next = drawingsRef.current.map((d) => {
        if (d.id !== pending.id) return d;
        const points = [...d.points];
        while (points.length < pending.needed) points.push({ ...point });
        points[pending.nextIndex] = point;
        for (let i = pending.nextIndex + 1; i < pending.needed; i += 1) points[i] = { ...point };
        if (d.kind === 'measure' && points[0] && points[1]) {
          return {
            ...d,
            points: points.slice(0, pending.needed),
            label: formatMeasureLabel(points[0], points[1], barsRef.current),
          };
        }
        return { ...d, points: points.slice(0, pending.needed) };
      });
      drawingsRef.current = next;
      setDrawings(next);
      repaint();
      return true;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const t = event.target as Node | null;
      if (t && !host.contains(t) && t !== canvas && !canvas.contains(t)) return;

      const rect = host.getBoundingClientRect();
      const at: Pixel = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const point = pointAt(event.clientX, event.clientY);
      if (!point) return;

      const activeTool = toolRef.current;
      const isSelect =
        activeTool === 'cursor' ||
        activeTool === 'crosshair' ||
        activeTool === 'dot' ||
        activeTool === 'arrowCursor';

      if (activeTool === 'eraser') {
        const hit = hitTest(at);
        if (!hit) return;
        event.stopPropagation();
        event.preventDefault();
        if (hit.drawing.locked && !removeLockedRef.current) return;
        commit(drawingsRef.current.filter((d) => d.id !== hit.drawing.id));
        setSelectedId(null);
        repaint();
        return;
      }

      if (activeTool === 'zoomIn') {
        event.stopPropagation();
        event.preventDefault();
        try {
          area.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        dragRef.current = { mode: 'zoom', a: at, b: at };
        repaint();
        return;
      }

      if (isSelect) {
        const hit = hitTest(at);
        if (!hit) {
          const hadMeasure = drawingsRef.current.some((d) => isEphemeralKind(d.kind));
          if (hadMeasure) commit(drawingsRef.current.filter((d) => !isEphemeralKind(d.kind)));
          if (selectedRef.current) {
            setSelectedId(null);
            repaint();
          } else if (hadMeasure) repaint();
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        try {
          area.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        setSelectedId(hit.drawing.id);
        if (lockRef.current || hit.drawing.locked) {
          repaint();
          return;
        }
        dragRef.current =
          hit.handle === null
            ? { mode: 'move', id: hit.drawing.id, from: point }
            : { mode: 'handle', id: hit.drawing.id, index: hit.handle };
        repaint();
        return;
      }

      if (!isDrawingKind(activeTool)) return;

      event.stopPropagation();
      event.preventDefault();

      const kind = activeTool;
      const needed = POINTS_NEEDED[kind];
      if (!(needed > 0)) return;
      const color = defaultColorFor(kind);

      // TradingView: click → move (rubber-band, no hold) → click to finish.
      const pending = placeRef.current;
      if (pending && drawingsRef.current.some((d) => d.id === pending.id)) {
        updateRubberBand(point);
        const lockedIndex = pending.nextIndex;
        if (lockedIndex >= needed - 1) {
          const shape = drawingsRef.current.find((d) => d.id === pending.id);
          if (shape?.kind === 'measure') {
            const [a, b] = shape.points;
            if (a && b && a.time === b.time && a.price === b.price) {
              commit(drawingsRef.current.filter((d) => d.id !== pending.id));
              placeRef.current = null;
              doneRef.current({ kind: 'measure' });
              repaint();
              return;
            }
          }
          finishShape(kind);
          return;
        }
        placeRef.current = { id: pending.id, nextIndex: lockedIndex + 1, needed };
        updateRubberBand(point);
        return;
      }

      if (isContinuousKind(kind)) {
        try {
          area.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        const id = newDrawingId();
        commit([...drawingsRef.current, { id, kind, points: [point], color }]);
        setSelectedId(id);
        dragRef.current = { mode: 'new', id, index: 0 };
        repaint();
        return;
      }

      let label = defaultLabelFor(kind);
      if (
        kind === 'text' ||
        kind === 'anchoredText' ||
        kind === 'note' ||
        kind === 'anchoredNote' ||
        kind === 'callout' ||
        kind === 'comment' ||
        kind === 'priceLabel' ||
        kind === 'priceNote' ||
        kind === 'table'
      ) {
        label = window.prompt('Label', label || 'Text') || label;
      }
      if (kind === 'sticker') {
        label = window.prompt('Emoji / sticker', '⭐') || '⭐';
      }

      const id = newDrawingId();
      const points: DrawPoint[] = Array.from({ length: needed }, () => ({ ...point }));
      const base = isEphemeralKind(kind)
        ? drawingsRef.current.filter((d) => !isEphemeralKind(d.kind))
        : drawingsRef.current;
      const shape: Drawing = {
        id,
        kind,
        points,
        color,
        label: kind === 'measure' ? formatMeasureLabel(point, point, barsRef.current) : label,
      };
      commit([...base, shape]);
      setSelectedId(id);

      if (needed === 1) {
        finishShape(kind);
        return;
      }

      placeRef.current = { id, nextIndex: 1, needed };
      dragRef.current = null;
      repaint();
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = pointAt(event.clientX, event.clientY);

      if (placeRef.current && point && !dragRef.current) {
        updateRubberBand(point);
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;
      const rect = host.getBoundingClientRect();
      const at: Pixel = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (drag.mode === 'zoom') {
        dragRef.current = { ...drag, b: at };
        repaint();
        return;
      }
      if (!point) return;
      event.preventDefault();

      const next = drawingsRef.current.map((d) => {
        if (d.id !== drag.id) return d;
        if (drag.mode === 'move') {
          const dt = point.time - drag.from.time;
          const dp = point.price - drag.from.price;
          return { ...d, points: d.points.map((p) => ({ time: p.time + dt, price: p.price + dp })) };
        }
        if (isContinuousKind(d.kind) && drag.mode === 'new') {
          const last = d.points[d.points.length - 1];
          if (
            last &&
            Math.abs(last.time - point.time) < 1 &&
            Math.abs(last.price - point.price) / Math.max(1, Math.abs(point.price)) < 0.00005
          ) {
            return d;
          }
          return { ...d, points: [...d.points, point] };
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

    const onPointerUp = (event: PointerEvent) => {
      try {
        if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.mode === 'zoom') {
        dragRef.current = null;
        const left = Math.min(drag.a.x, drag.b.x);
        const right = Math.max(drag.a.x, drag.b.x);
        if (right - left > 12) {
          const from = timeScale.coordinateToLogical(left);
          const to = timeScale.coordinateToLogical(right);
          if (from !== null && to !== null) {
            timeScale.setVisibleLogicalRange({ from, to });
          }
        }
        doneRef.current();
        repaint();
        return;
      }

      if (drag.mode === 'new') {
        const shape = drawingsRef.current.find((d) => d.id === drag.id);
        dragRef.current = null;
        if (!shape) return;
        if (isContinuousKind(shape.kind)) {
          if (shape.points.length < 2) commit(drawingsRef.current.filter((d) => d.id !== drag.id));
          else finishShape(shape.kind);
          return;
        }
        return;
      }

      dragRef.current = null;
      saveDrawings(storageKey, drawingsRef.current);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const pending = placeRef.current;
        if (pending) {
          commit(drawingsRef.current.filter((d) => d.id !== pending.id));
          placeRef.current = null;
        }
        dragRef.current = null;
        setSelectedId(null);
        doneRef.current();
        repaint();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!selectedRef.current) return;
      const sel = drawingsRef.current.find((d) => d.id === selectedRef.current);
      if (sel?.locked && !removeLockedRef.current) return;
      event.preventDefault();
      commit(drawingsRef.current.filter((d) => d.id !== selectedRef.current));
      setSelectedId(null);
      repaint();
    };

    const onDblClick = (event: MouseEvent) => {
      const t = event.target as Node | null;
      if (t && !host.contains(t) && t !== canvas && !canvas.contains(t)) return;
      const activeTool = toolRef.current;
      const isSelect =
        activeTool === 'cursor' ||
        activeTool === 'crosshair' ||
        activeTool === 'dot' ||
        activeTool === 'arrowCursor';
      if (!isSelect) return;

      const rect = host.getBoundingClientRect();
      const at: Pixel = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const hit = hitTest(at);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedId(hit.drawing.id);
      openSettingsRef.current?.(hit.drawing.id);
      repaint();
    };

    const blockChartGesture = (event: Event) => {
      const t = toolRef.current;
      const selecting =
        t === 'cursor' || t === 'crosshair' || t === 'dot' || t === 'arrowCursor';
      if (selecting && !dragRef.current && !placeRef.current) return;
      const target = event.target as Node | null;
      if (target && !host.contains(target) && target !== canvas && !canvas.contains(target)) return;
      event.stopPropagation();
      if (event.cancelable) event.preventDefault();
    };

    area.addEventListener('pointerdown', onPointerDown, true);
    area.addEventListener('dblclick', onDblClick, true);
    area.addEventListener('mousedown', blockChartGesture, true);
    area.addEventListener('touchstart', blockChartGesture, { capture: true, passive: false });
    area.addEventListener('touchmove', blockChartGesture, { capture: true, passive: false });
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      area.removeEventListener('pointerdown', onPointerDown, true);
      area.removeEventListener('dblclick', onDblClick, true);
      area.removeEventListener('mousedown', blockChartGesture, true);
      area.removeEventListener('touchstart', blockChartGesture, true);
      area.removeEventListener('touchmove', blockChartGesture, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('keydown', onKeyDown);
      dragRef.current = null;
    };

  }, [areaRef, hostRef, canvasRef, chartRef, seriesRef, epoch, commit, storageKey, isDark]);

  return {
    drawings,
    selectedId,
    undo,
    clear,
    removeSelected,
    replaceAll,
    addDrawing,
    updateDrawing,
    updateSelected,
    selectDrawing,
    cloneSelected,
    reorderSelected,
  };
}
