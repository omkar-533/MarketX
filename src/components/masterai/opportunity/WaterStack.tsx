import { useEffect, useRef, type ReactNode } from 'react';

type Props = { children: ReactNode };

/** Native-smooth 5-row list. Wheel stays inside the box; no JS scroll hijack. */
export default function WaterStack({ children }: Props) {
  const wellRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={wellRef} className="wolf-opp__stack-well">
      <div ref={ref} className="wolf-opp__stack wolf-opp__stack--merged">
        {children}
      </div>
    </div>
  );
}
