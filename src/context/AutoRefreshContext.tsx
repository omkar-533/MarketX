import { useEffect, useState, type ReactNode } from 'react';
import {
  getAutoRefreshTick,
  runGlobalRefresh,
  startAutoRefreshHub,
  stopAutoRefreshHub,
  subscribeAutoRefresh,
  type AutoRefreshDetail,
} from '../services/autoRefreshHub';
import { API_SERVER_READY_EVENT } from '../services/apiAutoConnect';
import { refreshMarketConnection } from '../services/marketConnection';
import { ensureSiteWideLiveFeed, nudgeSiteWideLiveFeed } from '../services/siteWideLiveFeed';

type AutoRefreshMeta = {
  tick: number;
  lastAt: number;
};

/**
 * 24×7 while logged in:
 * - Starts the global auto-refresh hub (drives every useAutoRefresh screen)
 * - Keeps site-wide TradingView Socket.IO + REST quote seed alive
 * - Re-nudges on tab focus / network online / API ready
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
      if (enabled) nudgeSiteWideLiveFeed();
    };
    window.addEventListener(API_SERVER_READY_EVENT, onApiReady);

    if (!enabled) {
      stopAutoRefreshHub();
      return () => window.removeEventListener(API_SERVER_READY_EVENT, onApiReady);
    }

    void refreshMarketConnection(true);
    ensureSiteWideLiveFeed();
    const stopHub = startAutoRefreshHub(15_000);

    const onWake = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      runGlobalRefresh();
      nudgeSiteWideLiveFeed();
      void refreshMarketConnection(true);
    };

    window.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);

    return () => {
      stopHub();
      window.removeEventListener(API_SERVER_READY_EVENT, onApiReady);
      window.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
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
