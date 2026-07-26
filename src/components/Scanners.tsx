import { useEffect, useState } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { User } from '../hooks/useAuth';
import {
  getScreenerFeedStatus,
  refreshScreenerFeedAsync,
  type ScreenerMarketRow,
} from '../services/screenerDataService';
import { getCachedScreenerRows, subscribeScreenerFeed } from '../services/screenerLiveService';
import { subscribeMarketLive } from '../services/marketLiveStore';
import ReadyMadeScreeners from './ReadyMadeScreeners';

interface ScannersProps {
  user: User | null;
}

export default function Scanners(_props: ScannersProps) {
  const [stocks, setStocks] = useState<ScreenerMarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedStatus, setFeedStatus] = useState(getScreenerFeedStatus);

  const applyRows = (rows: ScreenerMarketRow[]) => {
    setStocks(rows);
    setFeedStatus(getScreenerFeedStatus());
  };

  const refresh = async (opts?: { forceOhlc?: boolean }) => {
    setLoading(true);
    try {
      await refreshScreenerFeedAsync(opts);
      applyRows(getCachedScreenerRows());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh({ forceOhlc: true });
    return subscribeScreenerFeed(() => applyRows(getCachedScreenerRows()));
  }, []);

  useEffect(() => subscribeMarketLive(() => setFeedStatus(getScreenerFeedStatus())), []);

  useAutoRefresh(() => {
    void refresh();
  });

  return (
    <div className="animate-in fade-in duration-500">
      <ReadyMadeScreeners
        rows={stocks}
        loading={loading}
        feedLabel={feedStatus.message}
        feedMode={feedStatus.mode}
        onRefresh={() => void refresh({ forceOhlc: true })}
      />
    </div>
  );
}
