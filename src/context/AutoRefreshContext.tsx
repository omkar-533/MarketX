import { useEffect, useState, type ReactNode } from 'react';
import {
  getAutoRefreshTick,
  subscribeAutoRefresh,
  type AutoRefreshDetail,
} from '../services/autoRefreshHub';
import { API_SERVER_READY_EVENT } from '../services/apiAutoConnect';
import { refreshMarketConnection } from '../services/marketConnection';

type AutoRefreshMeta = {
  tick: number;
  lastAt: number;
};

/**
 * Keeps API connection warm. Does NOT start Fyers websocket ticks or
 * global live-market refresh — product tabs don't consume live quotes.
 */
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
    };
    window.addEventListener(API_SERVER_READY_EVENT, onApiReady);

    if (!enabled) {
      return () => window.removeEventListener(API_SERVER_READY_EVENT, onApiReady);
    }

    void refreshMarketConnection(true);

    return () => {
      window.removeEventListener(API_SERVER_READY_EVENT, onApiReady);
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
