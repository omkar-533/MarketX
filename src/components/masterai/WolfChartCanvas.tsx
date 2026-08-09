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
};

type Props = {
  children: ReactNode;
  /** When set AND followWolf is true, smoothly zoom/pan to this bbox. */
  focusBbox?: NormalizedBBox | null;
  /** Wolf may move the camera only while following. */
  followWolf?: boolean;
  className?: string;
  onPoint?: (nx: number, ny: number) => void;
  /** Normalized selection rectangle (legacy region ask). */
  onSelectRegion?: (bbox: NormalizedBBox) => void;
  /** Drawing toolbar active. */
  drawMode?: boolean;
  drawTool?: DrawTool | null;
  drawings?: UserDrawing[];
  onDrawingsChange?: (next: UserDrawing[]) => void;
  onFullscreenChange?: (on: boolean) => void;
  /** Hide built-in chart tools (parent renders them). */
  hideChartTools?: boolean;
};

/**
 * Interactive screenshot stage — pan / wheel zoom / draw tools / fullscreen.
 * Focus camera moves only when followWolf is on.
 */
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
  const drag = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
    drawing?: boolean;
    start?: { x: number; y: number };
  } | null>(null);
  const [draft, setDraft] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(
    null,
  );

  const reset = useCallback(() => {
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

  useImperativeHandle(
    ref,
    () => ({
      zoomIn,
      zoomOut,
      reset,
      toggleFullscreen,
      undoDrawing,
      clearDraft: () => setDraft(null),
    }),
    [zoomIn, zoomOut, reset, toggleFullscreen, undoDrawing],
  );

  useEffect(() => {
    if (!followWolf || !focusBbox) return;
    const el = shellRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    const nextScale = Math.min(2.6, Math.max(1.35, 0.78 / Math.max(focusBbox.width, focusBbox.height * 0.75)));
    const cx = (focusBbox.x + focusBbox.width / 2) * w;
    const cy = (focusBbox.y + focusBbox.height / 2) * h;
    setScale(nextScale);
    setTx(w / 2 - cx * nextScale);
    setTy(h / 2 - cy * nextScale);
  }, [focusBbox, followWolf]);

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

  const toNorm = (clientX: number, clientY: number) => {
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

  const eraseNear = (p: { x: number; y: number }) => {
    const hit = [...drawings]
      .reverse()
      .find((d) => {
        const midX = (d.a.x + d.b.x) / 2;
        const midY = (d.a.y + d.b.y) / 2;
        return Math.hypot(p.x - midX, p.y - midY) < 0.06;
      });
    if (hit) onDrawingsChange?.(drawings.filter((d) => d.id !== hit.id));
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (drawMode && drawTool) {
      const n = toNorm(e.clientX, e.clientY);
      if (drawTool === 'eraser') {
        eraseNear(n);
        drag.current = null;
        return;
      }
      drag.current = { x: e.clientX, y: e.clientY, tx, ty, drawing: true, start: n };
      setDraft({ a: n, b: n });
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    if (drag.current.drawing && drag.current.start) {
      const b = toNorm(e.clientX, e.clientY);
      setDraft({ a: drag.current.start, b });
      return;
    }
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (drag.current?.drawing && draft && drawTool && drawTool !== 'eraser') {
      const tool = drawTool;
      const next: UserDrawing = {
        id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tool,
        a: draft.a,
        b:
          tool === 'horizontal'
            ? { x: Math.min(0.98, Math.max(0.02, draft.b.x)), y: draft.a.y }
            : draft.b,
      };
      const w = Math.abs(next.b.x - next.a.x);
      const h = Math.abs(next.b.y - next.a.y);
      if (tool === 'zone' ? w > 0.015 && h > 0.015 : w + h > 0.01) {
        onDrawingsChange?.([...drawings, next]);
        if (tool === 'zone') {
          onSelectRegion?.({
            x: Math.min(next.a.x, next.b.x),
            y: Math.min(next.a.y, next.b.y),
            width: Math.max(0.02, Math.abs(next.b.x - next.a.x)),
            height: Math.max(0.02, Math.abs(next.b.y - next.a.y)),
          });
        }
      }
      setDraft(null);
    } else if (drag.current && Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) < 6) {
      const n = toNorm(e.clientX, e.clientY);
      onPoint?.(n.x, n.y);
    }
    drag.current = null;
  };

  const renderStroke = (d: UserDrawing | { tool: DrawTool; a: { x: number; y: number }; b: { x: number; y: number } }, key: string, ghost?: boolean) => {
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
            width: `${Math.abs(x2 - x1)}%`,
            height: `${Math.abs(y2 - y1)}%`,
          }}
        />
      );
    }
    if (d.tool === 'horizontal') {
      return (
        <div
          key={key}
          className={cls}
          style={{ left: '2%', right: '2%', top: `${y1}%` }}
        />
      );
    }
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const len = Math.hypot(x2 - x1, y2 - y1);
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
      className={`wolf-canvas ${fullscreen ? 'is-fullscreen' : ''} ${className}`}
      ref={shellRef}
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
