import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { NormalizedBBox } from '../../utils/wolfEvidence';
import type { DrawTool } from '../../utils/wolfActionRegistry';
import { wolfActionLabel } from '../../utils/wolfActionRegistry';

export type UserDrawing = {
  id: string;
  tool: Exclude<DrawTool, 'eraser'>;
  a: { x: number; y: number };
  b: { x: number; y: number };
};

export type WolfChartCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  toggleFullscreen: () => void;
  undoDrawing: () => void;
  clearDraft: () => void;
  clearDrawings: () => void;
  focusNormalized: (bbox: NormalizedBBox, animate?: boolean) => void;
};

type Point = { x: number; y: number };

type Props = {
  children: ReactNode;
  focusBbox?: NormalizedBBox | null;
  followWolf?: boolean;
  className?: string;
  onPoint?: (nx: number, ny: number) => void;
  onSelectRegion?: (bbox: NormalizedBBox) => void;
  drawMode?: boolean;
  drawTool?: DrawTool | null;
  drawings?: UserDrawing[];
  onDrawingsChange?: (next: UserDrawing[]) => void;
  onFullscreenChange?: (on: boolean) => void;
  hideChartTools?: boolean;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const WolfChartCanvas = forwardRef<WolfChartCanvasHandle, Props>(function WolfChartCanvas(
  {
    children,
    focusBbox = null,
    followWolf = false,
    className = '',
    onPoint,
    onSelectRegion,
    drawMode = false,
    drawTool = null,
    drawings = [],
    onDrawingsChange,
    onFullscreenChange,
    hideChartTools = false,
  },
  ref,
) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [draft, setDraft] = useState<{ a: Point; b: Point } | null>(null);
  const cameraAnim = useRef<number | null>(null);
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
    drawing?: boolean;
    start?: Point;
    end?: Point;
  } | null>(null);

  useEffect(() => {
    viewRef.current = { scale, tx, ty };
  }, [scale, tx, ty]);

  const animateTo = useCallback((nextScale: number, nextTx: number, nextTy: number, ms = 420) => {
    if (cameraAnim.current) cancelAnimationFrame(cameraAnim.current);
    const from = { ...viewRef.current };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const s = lerp(from.scale, nextScale, e);
      const x = lerp(from.tx, nextTx, e);
      const y = lerp(from.ty, nextTy, e);
      setScale(s);
      setTx(x);
      setTy(y);
      if (t < 1) cameraAnim.current = requestAnimationFrame(step);
      else cameraAnim.current = null;
    };
    cameraAnim.current = requestAnimationFrame(step);
  }, []);

  const focusNormalized = useCallback(
    (bbox: NormalizedBBox, animate = true) => {
      const el = shellRef.current;
      if (!el) return;
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      const nextScale = Math.min(2.8, Math.max(1.35, 0.78 / Math.max(bbox.width, bbox.height * 0.75, 0.08)));
      const cx = (bbox.x + bbox.width / 2) * w;
      const cy = (bbox.y + bbox.height / 2) * h;
      const nextTx = w / 2 - cx * nextScale;
      const nextTy = h / 2 - cy * nextScale;
      if (animate) animateTo(nextScale, nextTx, nextTy);
      else {
        setScale(nextScale);
        setTx(nextTx);
        setTy(nextTy);
      }
    },
    [animateTo],
  );

  const reset = useCallback(() => {
    if (cameraAnim.current) cancelAnimationFrame(cameraAnim.current);
    setScale(1);
    setTx(0);
    setTy(0);
    setDraft(null);
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(3.5, s * 1.15)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(1, s / 1.15)), []);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((v) => {
      const next = !v;
      onFullscreenChange?.(next);
      return next;
    });
  }, [onFullscreenChange]);

  const undoDrawing = useCallback(() => {
    if (!drawings.length) return;
    onDrawingsChange?.(drawings.slice(0, -1));
  }, [drawings, onDrawingsChange]);

  const clearDrawings = useCallback(() => {
    onDrawingsChange?.([]);
    setDraft(null);
  }, [onDrawingsChange]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn,
      zoomOut,
      reset,
      toggleFullscreen,
      undoDrawing,
      clearDraft: () => setDraft(null),
      clearDrawings,
      focusNormalized,
    }),
    [zoomIn, zoomOut, reset, toggleFullscreen, undoDrawing, clearDrawings, focusNormalized],
  );

  useEffect(() => {
    if (!followWolf || !focusBbox) return;
    focusNormalized(focusBbox, true);
  }, [focusBbox, followWolf, focusNormalized]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreen(false);
        onFullscreenChange?.(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, onFullscreenChange]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const el = shellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => {
      const next = Math.min(3.5, Math.max(1, prev * delta));
      const ratio = next / prev;
      setTx((t) => mx - (mx - t) * ratio);
      setTy((t) => my - (my - t) * ratio);
      return next;
    });
  };

  const toNorm = (clientX: number, clientY: number): Point => {
    const el = shellRef.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const rect = el.getBoundingClientRect();
    const lx = (clientX - rect.left - tx) / scale;
    const ly = (clientY - rect.top - ty) / scale;
    return {
      x: Math.min(1, Math.max(0, lx / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, ly / Math.max(1, rect.height))),
    };
  };

  const eraseNear = (p: Point) => {
    const hit = [...drawings]
      .reverse()
      .find((d) => {
        const midX = (d.a.x + d.b.x) / 2;
        const midY = (d.a.y + d.b.y) / 2;
        return Math.hypot(p.x - midX, p.y - midY) < 0.07;
      });
    if (hit) onDrawingsChange?.(drawings.filter((d) => d.id !== hit.id));
  };

  const commitStroke = (a: Point, b: Point, tool: Exclude<DrawTool, 'eraser'>) => {
    const next: UserDrawing = {
      id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tool,
      a,
      b:
        tool === 'horizontal'
          ? { x: Math.min(0.98, Math.max(0.02, b.x)), y: a.y }
          : b,
    };
    const w = Math.abs(next.b.x - next.a.x);
    const h = Math.abs(next.b.y - next.a.y);
    const ok = tool === 'zone' ? w > 0.012 && h > 0.012 : tool === 'horizontal' ? w > 0.02 || true : w + h > 0.008;
    if (!ok) return;
    onDrawingsChange?.([...drawings, next]);
    if (tool === 'zone') {
      onSelectRegion?.({
        x: Math.min(next.a.x, next.b.x),
        y: Math.min(next.a.y, next.b.y),
        width: Math.max(0.02, Math.abs(next.b.x - next.a.x)),
        height: Math.max(0.02, Math.abs(next.b.y - next.a.y)),
      });
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (drawMode && drawTool) {
      e.preventDefault();
      const n = toNorm(e.clientX, e.clientY);
      if (drawTool === 'eraser') {
        eraseNear(n);
        drag.current = null;
        return;
      }
      drag.current = { x: e.clientX, y: e.clientY, tx, ty, drawing: true, start: n, end: n };
      setDraft({ a: n, b: n });
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    if (drag.current.drawing && drag.current.start) {
      e.preventDefault();
      const b = toNorm(e.clientX, e.clientY);
      drag.current.end = b;
      setDraft({ a: drag.current.start, b });
      return;
    }
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (drag.current?.drawing && drag.current.start && drawTool && drawTool !== 'eraser') {
      const end = drag.current.end || toNorm(e.clientX, e.clientY);
      commitStroke(drag.current.start, end, drawTool);
      setDraft(null);
    } else if (drag.current && Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) < 6) {
      const n = toNorm(e.clientX, e.clientY);
      onPoint?.(n.x, n.y);
    }
    drag.current = null;
  };

  const renderStroke = (
    d: UserDrawing | { tool: DrawTool; a: Point; b: Point },
    key: string,
    ghost?: boolean,
  ) => {
    const x1 = d.a.x * 100;
    const y1 = d.a.y * 100;
    const x2 = d.b.x * 100;
    const y2 = d.b.y * 100;
    const cls = `wolf-canvas__stroke wolf-canvas__stroke--${d.tool}${ghost ? ' is-ghost' : ''}`;
    if (d.tool === 'zone') {
      return (
        <div
          key={key}
          className={cls}
          style={{
            left: `${Math.min(x1, x2)}%`,
            top: `${Math.min(y1, y2)}%`,
            width: `${Math.max(0.5, Math.abs(x2 - x1))}%`,
            height: `${Math.max(0.5, Math.abs(y2 - y1))}%`,
          }}
        />
      );
    }
    if (d.tool === 'horizontal') {
      return <div key={key} className={cls} style={{ left: '2%', right: '2%', top: `${y1}%` }} />;
    }
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const len = Math.max(0.4, Math.hypot(x2 - x1, y2 - y1));
    return (
      <div
        key={key}
        className={cls}
        style={{
          left: `${x1}%`,
          top: `${y1}%`,
          width: `${len}%`,
          transform: `rotate(${angle}deg)`,
        }}
        data-arrow={d.tool === 'arrow' ? '1' : undefined}
      />
    );
  };

  return (
    <div
      className={`wolf-canvas ${fullscreen ? 'is-fullscreen' : ''} ${drawMode ? 'is-drawing' : ''} ${className}`}
      ref={shellRef}
      style={drawMode ? { touchAction: 'none' } : undefined}
    >
      <div
        className={`wolf-canvas__plane ${drawMode ? 'is-draw' : ''}`}
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDraft(null);
        }}
        onDoubleClick={reset}
      >
        {children}
        <div className="wolf-canvas__drawings" aria-hidden>
          {drawings.map((d) => renderStroke(d, d.id))}
          {draft && drawTool && drawTool !== 'eraser'
            ? renderStroke({ tool: drawTool, a: draft.a, b: draft.b }, 'draft', true)
            : null}
        </div>
      </div>
      {!hideChartTools ? (
        <div className="wolf-canvas__tools" role="toolbar" aria-label="Chart controls">
          <button type="button" title={wolfActionLabel('CHART_ZOOM_IN')} onClick={zoomIn}>
            +
          </button>
          <button type="button" title={wolfActionLabel('CHART_ZOOM_OUT')} onClick={zoomOut}>
            −
          </button>
          <button type="button" title={wolfActionLabel('CHART_RESET')} onClick={reset}>
            RESET
          </button>
          <button
            type="button"
            title={wolfActionLabel('CHART_FULLSCREEN', { fullscreen })}
            onClick={toggleFullscreen}
          >
            {fullscreen ? 'EXIT' : 'FULL'}
          </button>
        </div>
      ) : null}
    </div>
  );
});

export default WolfChartCanvas;
