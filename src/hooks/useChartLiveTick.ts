import { useEffect, useRef } from 'react';
import { subscribeAutoRefresh } from '../services/autoRefreshHub';

/** Throttled live tick for charts — avoids 2.5s full re-render storm */
export function useChartLiveTick(
  onTick: () => void,
  intervalMs = 400,
  enabled = true,
) {
  const onTickRef = useRef(onTick);
  const lastRun = useRef(0);
  const rafId = useRef<number | null>(null);

  onTickRef.current = onTick;

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      const now = Date.now();
      if (now - lastRun.current < intervalMs) return;
      lastRun.current = now;
      onTickRef.current();
    };

    const unsub = subscribeAutoRefresh(() => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(run);
    });

    return () => {
      unsub();
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [intervalMs, enabled]);
}
