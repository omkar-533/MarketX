import { useEffect, useRef, type ReactNode } from 'react';

type Props = { children: ReactNode };

/** 5-row scroller with iOS-style rubber bounce + water fade. */
export default function WaterStack({ children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pull = 0;
    let settleTimer = 0;
    let frame = 0;

    const paint = () => {
      el.style.setProperty('--opp-pull', `${pull}px`);
      frame = 0;
    };
    const settle = () => {
      pull = 0;
      el.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.setProperty('--opp-pull', '0px');
    };
    const onWheel = (e: WheelEvent) => {
      const atTop = el.scrollTop <= 0;
      const atBot = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const pulling = (atTop && e.deltaY < 0) || (atBot && e.deltaY > 0);
      if (!pulling) {
        if (pull) settle();
        return;
      }
      e.preventDefault();
      el.style.transition = 'none';
      const next = pull - e.deltaY * 0.22;
      pull = Math.max(-34, Math.min(34, next)) * 0.86;
      if (!frame) frame = requestAnimationFrame(paint);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 90);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(settleTimer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="wolf-opp__stack-well">
      <div ref={ref} className="wolf-opp__stack wolf-opp__stack--merged">
        {children}
      </div>
    </div>
  );
}
