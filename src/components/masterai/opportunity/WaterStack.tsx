import {
  Children,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';

type Props = { children: ReactNode };

const VISIBLE_ROWS = 5;
const OVERSCAN = 6;
const VIRTUALIZE_AFTER = VISIBLE_ROWS + OVERSCAN;
const DEFAULT_STRIDE = 5.25 * 16;

function cssLenPx(token: string, remPx: number, emPx: number): number {
  const n = parseFloat(token);
  if (!Number.isFinite(n)) return 0;
  if (token.endsWith('rem')) return n * remPx;
  if (token.endsWith('em')) return n * emPx;
  return n;
}

function stackMetrics(el: HTMLElement): { stride: number; gap: number } {
  const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const cs = getComputedStyle(el);
  const emPx = parseFloat(cs.fontSize) || remPx;
  const row = cssLenPx(cs.getPropertyValue('--opp-row').trim() || '4.85rem', remPx, emPx);
  const gap = cssLenPx(cs.getPropertyValue('--opp-gap').trim() || '0.4rem', remPx, emPx);
  return { stride: Math.max(1, row + gap), gap };
}

/** Native-smooth 5-row list. Wheel stays inside the box; only visible rows mount. */
export default function WaterStack({ children }: Props) {
  const wellRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const virtualize = items.length > VIRTUALIZE_AFTER;
  const [start, setStart] = useState(0);
  const [stride, setStride] = useState(DEFAULT_STRIDE);
  const [gap, setGap] = useState(0.4 * 16);
  const rafRef = useRef(0);

  const syncWindow = useCallback((el: HTMLElement) => {
    const metrics = stackMetrics(el);
    setStride((prev) => (Math.abs(prev - metrics.stride) < 0.5 ? prev : metrics.stride));
    setGap((prev) => (Math.abs(prev - metrics.gap) < 0.5 ? prev : metrics.gap));
    const next = Math.max(0, Math.floor(el.scrollTop / metrics.stride) - OVERSCAN);
    setStart((prev) => (prev === next ? prev : next));
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!virtualize) {
      setStart(0);
      return;
    }
    if (el) syncWindow(el);
  }, [virtualize, items.length, syncWindow]);

  useEffect(() => {
    const el = ref.current;
    const well = wellRef.current;
    if (!el || !well) return;

    const onWheel = (e: WheelEvent) => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const atTop = el.scrollTop <= 0.5;
      const atBot = el.scrollTop >= max - 0.5;
      const leaving = max <= 0 || (atTop && e.deltaY < 0) || (atBot && e.deltaY > 0);
      if (!leaving) return;
      e.preventDefault();
      e.stopPropagation();
    };

    well.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => well.removeEventListener('wheel', onWheel, true);
  }, []);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!virtualize) return;
    if (rafRef.current) return;
    const target = e.currentTarget;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      syncWindow(target);
    });
  };

  useEffect(
    () => () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  let body: ReactNode = children;
  if (virtualize) {
    const windowSize = VISIBLE_ROWS + OVERSCAN * 2;
    const maxStart = Math.max(0, items.length - windowSize);
    const from = Math.min(start, maxStart);
    const to = Math.min(items.length, from + windowSize);
    const offset = from * stride;
    const totalH = items.length * stride - gap;
    body = (
      <div className="wolf-opp__stack-spacer" style={{ height: Math.max(0, totalH) }}>
        <div className="wolf-opp__stack-window" style={{ transform: `translate3d(0, ${offset}px, 0)` }}>
          {items.slice(from, to)}
        </div>
      </div>
    );
  }

  return (
    <div ref={wellRef} className="wolf-opp__stack-well">
      <div ref={ref} className="wolf-opp__stack wolf-opp__stack--merged" onScroll={onScroll}>
        {body}
      </div>
    </div>
  );
}
