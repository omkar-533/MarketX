import { useEffect, useRef } from 'react';
import {
  getAutoRefreshTick,
  subscribeAutoRefresh,
  type AutoRefreshDetail,
} from '../services/autoRefreshHub';

/**
 * Runs on mount and on every global live-data tick (no manual refresh needed).
 */
export function useAutoRefresh(
  onTick: (detail: AutoRefreshDetail) => void,
  enabled = true,
): void {
  const handlerRef = useRef(onTick);
  handlerRef.current = onTick;

  useEffect(() => {
    if (!enabled) return;
    const run = (detail: AutoRefreshDetail) => handlerRef.current(detail);
    run({ tick: getAutoRefreshTick(), at: Date.now() });
    return subscribeAutoRefresh(run);
  }, [enabled]);
}
