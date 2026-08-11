/**
 * Wolf AI product page — AI Analyst only.
 * Radar / LIVE / Strategy Lab / Watchlist live as top-level product menu routes.
 */
import { useEffect } from 'react';
import MasterAI from './MasterAI';
import { initMarketDataService } from '../services/marketData/MarketDataService';
import { mockMarketDataProvider } from '../services/radar/MockMarketDataProvider';
import { serverMarketDataProvider } from '../services/marketData/ServerMarketDataProvider';
import { fetchMarketDataStatus } from '../services/marketData/marketDataApi';

export default function WolfAiWorkspace() {
  useEffect(() => {
    initMarketDataService(mockMarketDataProvider);
    void fetchMarketDataStatus()
      .then(async (s) => {
        if (s.status === 'CONNECTED' && s.mode === 'LIVE') {
          await initMarketDataService(serverMarketDataProvider).connect();
        } else if (s.status === 'CONNECTED') {
          await initMarketDataService(mockMarketDataProvider).connect();
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="wolf-ai-workspace is-analyst">
      <div className="wolf-ai-workspace__body">
        <div className="wolf-ai-workspace__pane is-show">
          <MasterAI />
        </div>
      </div>
    </div>
  );
}
