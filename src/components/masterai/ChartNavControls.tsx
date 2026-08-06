import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react';
import type { IChartApi } from 'lightweight-charts';
import { tvResetView, tvScroll, tvZoom } from '../../services/chart/chartNavActions';

export type ChartNavControlsProps = {
  chart: IChartApi | null;
  /** Chart plot area — fab is portaled & fixed over this box (TV control_bar). */
  anchorRef: RefObject<HTMLElement | null>;
  onReset?: () => void;
  onInteract?: () => void;
  className?: string;
};

/** LWC time-axis strip height; fab sits just above it, over the candles. */
const TIME_AXIS_PX = 28;

type Box = { left: number; top: number; width: number; height: number };

/**
 * TradingView `control_bar`: floating overlay (− + 〈 〉 reset) over the chart pane.
 * Portaled to `document.body` with `position: fixed` so parent overflow / canvases
 * never clip it — same pattern as TV and our drawing flyouts.
 */
export default function ChartNavControls({
  chart,
  anchorRef,
  onReset,
  onInteract,
  className = '',
}: ChartNavControlsProps) {
  const [box, setBox] = useState<Box | null>(null);
  const [lit, setLit] = useState(false);
  const overFab = useRef(false);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;

    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) {
          setBox(null);
          return;
        }
        setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
      });
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);

    const light = () => setLit(true);
    const dim = () => {
      if (!overFab.current) setLit(false);
    };
    el.addEventListener('pointerenter', light);
    el.addEventListener('pointerleave', dim);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      el.removeEventListener('pointerenter', light);
      el.removeEventListener('pointerleave', dim);
    };
  }, [anchorRef, chart]);

  if (!chart || !box || typeof document === 'undefined') return null;

  const style: CSSProperties = {
    left: box.left + box.width / 2,
    top: box.top + box.height - TIME_AXIS_PX - 4,
  };

  const run = (fn: () => void) => {
    try {
      onInteract?.();
      fn();
    } catch {
      /* chart disposing */
    }
  };

  return createPortal(
    <div
      className={`mai-nc__navfab ${lit ? 'mai-nc__navfab--lit' : ''} ${className}`.trim()}
      style={style}
      role="toolbar"
      aria-label="Chart navigation"
      onPointerEnter={() => {
        overFab.current = true;
        setLit(true);
      }}
      onPointerLeave={() => {
        overFab.current = false;
        setLit(false);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <HoldBtn title="Zoom out" ariaLabel="Zoom out" onAct={() => run(() => tvZoom(chart, 'out'))}>
        <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />
      </HoldBtn>
      <span className="mai-nc__navfab-sep" aria-hidden />
      <HoldBtn title="Zoom in" ariaLabel="Zoom in" onAct={() => run(() => tvZoom(chart, 'in'))}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
      </HoldBtn>
      <span className="mai-nc__navfab-sep" aria-hidden />
      <HoldBtn title="Scroll left" ariaLabel="Scroll left" onAct={() => run(() => tvScroll(chart, 'left'))}>
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
      </HoldBtn>
      <span className="mai-nc__navfab-sep" aria-hidden />
      <HoldBtn title="Scroll right" ariaLabel="Scroll right" onAct={() => run(() => tvScroll(chart, 'right'))}>
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} />
      </HoldBtn>
      <span className="mai-nc__navfab-sep" aria-hidden />
      <button
        type="button"
        className="mai-nc__navfab-btn"
        title="Reset chart"
        aria-label="Reset chart"
        onClick={() => {
          try {
            if (onReset) onReset();
            else tvResetView(chart);
          } catch {
            /* disposing */
          }
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>
    </div>,
    document.body,
  );
}

function HoldBtn({
  title,
  ariaLabel,
  onAct,
  children,
}: {
  title: string;
  ariaLabel: string;
  onAct: () => void;
  children: ReactNode;
}) {
  const onActRef = useRef(onAct);
  onActRef.current = onAct;
  const timers = useRef<{ delay?: number; tick?: number }>({});

  const clear = useCallback(() => {
    if (timers.current.delay) window.clearTimeout(timers.current.delay);
    if (timers.current.tick) window.clearInterval(timers.current.tick);
    timers.current = {};
  }, []);

  useEffect(() => clear, [clear]);

  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      onActRef.current();
    } catch {
      /* disposing */
    }
    timers.current.delay = window.setTimeout(() => {
      timers.current.tick = window.setInterval(() => {
        try {
          onActRef.current();
        } catch {
          clear();
        }
      }, 70);
    }, 380);
  };

  return (
    <button
      type="button"
      className="mai-nc__navfab-btn"
      title={title}
      aria-label={ariaLabel}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
    >
      {children}
    </button>
  );
}
