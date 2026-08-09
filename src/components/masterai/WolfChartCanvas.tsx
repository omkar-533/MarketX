import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import type { NormalizedBBox } from '../../utils/wolfEvidence';

type Props = {
  children: ReactNode;
  /** When set, smoothly zoom/pan so this bbox is centered & prominent. */
  focusBbox?: NormalizedBBox | null;
  className?: string;
  onPoint?: (nx: number, ny: number) => void;
  /** Normalized selection rectangle (user draw). */
  onSelectRegion?: (bbox: NormalizedBBox) => void;
  drawMode?: boolean;
};

/**
 * Interactive screenshot stage — pan / pinch-wheel zoom / double-click reset / optional draw.
 * Wolf focusBbox drives cinematic camera moves without freezing user control forever.
 */
export default function WolfChartCanvas({
  children,
  focusBbox = null,
  className = '',
  onPoint,
  onSelectRegion,
  drawMode = false,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; drawing?: boolean } | null>(null);
  const [draft, setDraft] = useState<NormalizedBBox | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
    setDraft(null);
  }, []);

  useEffect(() => {
    if (!focusBbox) return;
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
  }, [focusBbox]);

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

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (drawMode) {
      const n = toNorm(e.clientX, e.clientY);
      drag.current = { x: e.clientX, y: e.clientY, tx, ty, drawing: true };
      setDraft({ x: n.x, y: n.y, width: 0.01, height: 0.01 });
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    if (drag.current.drawing && draft) {
      const a = toNorm(drag.current.x, drag.current.y);
      const b = toNorm(e.clientX, e.clientY);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      setDraft({
        x,
        y,
        width: Math.max(0.02, Math.abs(b.x - a.x)),
        height: Math.max(0.02, Math.abs(b.y - a.y)),
      });
      return;
    }
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (drag.current?.drawing && draft) {
      onSelectRegion?.(draft);
    } else if (drag.current && Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) < 6) {
      const n = toNorm(e.clientX, e.clientY);
      onPoint?.(n.x, n.y);
    }
    drag.current = null;
  };

  return (
    <div className={`wolf-canvas ${className}`} ref={shellRef}>
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
        {draft ? (
          <div
            className="wolf-canvas__draft"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.width * 100}%`,
              height: `${draft.height * 100}%`,
            }}
          />
        ) : null}
      </div>
      <div className="wolf-canvas__tools">
        <button type="button" onClick={() => setScale((s) => Math.min(3.5, s * 1.15))} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => setScale((s) => Math.max(1, s / 1.15))} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={reset} aria-label="Reset view">
          ⟲
        </button>
      </div>
    </div>
  );
}
