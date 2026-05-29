import { useEffect, useState, type ReactNode } from 'react';
import {
  getAutoRefreshTick,
  startAutoRefreshHub,
  subscribeAutoRefresh,
  type AutoRefreshDetail,
} from '../services/autoRefreshHub';
import { API_SERVER_READY_EVENT } from '../services/apiAutoConnect';
import { refreshMarketConnection } from '../services/marketConnection';
import { startMarketTickStream } from '../services/marketTickStream';

type AutoRefreshMeta = {
  tick: number;
  lastAt: number;
};

/** Starts global refresh hub only — does NOT re-render the whole app every tick */
export function AutoRefreshProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onApiReady = () => {
      void refreshMarketConnection(true);
      if (enabled) {
        startMarketTickStream();
      }
    };
    window.addEventListener(API_SERVER_READY_EVENT, onApiReady);

    if (!enabled) {
      return () => window.removeEventListener(API_SERVER_READY_EVENT, onApiReady);
    }

    const stopHub = startAutoRefreshHub();
    const stopStream = startMarketTickStream();
    void refreshMarketConnection(true);

    return () => {
      window.removeEventListener(API_SERVER_READY_EVENT, onApiReady);
      stopHub();
      stopStream();
    };
  }, [enabled]);

  return <>{children}</>;
}

/** Subscribe locally (Header, heatmap, etc.) — chart canvas stays isolated */
export function useAutoRefreshMeta(): AutoRefreshMeta {
  const [state, setState] = useState<AutoRefreshMeta>({
    tick: getAutoRefreshTick(),
    lastAt: Date.now(),
  });

  useEffect(() => {
    return subscribeAutoRefresh((detail: AutoRefreshDetail) => {
      setState({ tick: detail.tick, lastAt: detail.at });
    });
  }, []);

  return state;
}
