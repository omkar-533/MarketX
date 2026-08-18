import { useEffect, useRef, type ReactNode } from 'react';

type Props = { children: ReactNode };

function wheelDeltaY(e: WheelEvent, el: HTMLElement): number {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * el.clientHeight;
  return e.deltaY;
}

/** 5-row scroller: wheel always moves the list; never chains to the page. */
export default function WaterStack({ children }: Props) {
  const wellRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const well = wellRef.current;
    if (!el || !well) return;
    let pull = 0;
    let settleTimer = 0;
    let frame = 0;

    const paint = () => {
      el.style.setProperty('--opp-pull', `${pull}px`);
      frame = 0;
    };
    const settle = () => {
      pull = 0;
      el.style.willChange = '';
      el.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.setProperty('--opp-pull', '0px');
    };
    const onWheel = (e: WheelEvent) => {
      const dy = wheelDeltaY(e, el);
      if (!dy) return;
      e.preventDefault();
      e.stopPropagation();
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const atTop = el.scrollTop <= 0.5;
      const atBot = el.scrollTop >= max - 0.5;
      const blocked = max <= 0 || (atTop && dy < 0) || (atBot && dy > 0);
      if (blocked) {
        el.style.transition = 'none';
        el.style.willChange = 'transform';
        pull = Math.max(-28, Math.min(28, pull - dy * 0.18)) * 0.88;
        if (!frame) frame = requestAnimationFrame(paint);
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(settle, 90);
        return;
      }
      if (pull) settle();
      el.scrollTop += dy;
    };

    well.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      well.removeEventListener('wheel', onWheel, true);
      window.clearTimeout(settleTimer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={wellRef} className="wolf-opp__stack-well">
      <div ref={ref} className="wolf-opp__stack wolf-opp__stack--merged">
        {children}
      </div>
    </div>
  );
}
