import { useEffect, useState } from 'react';
import WolfOpportunityPage from './WolfOpportunityPage';
import ConnectMarketDataModal from '../radar/ConnectMarketDataModal';
import {
  fetchMarketDataStatus,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { mockMarketDataProvider } from '../../../services/radar/MockMarketDataProvider';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';

type Props = {
  onOpenWolfAi: () => void;
  onOpenLive: () => void;
};

export default function WolfOpportunityRoute({ onOpenWolfAi, onOpenLive }: Props) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [mdStatus, setMdStatus] = useState<ServerConnectionStatus | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void fetchMarketDataStatus()
      .then(async (s) => {
        setMdStatus(s);
        if (s.status === 'CONNECTED' && s.mode === 'LIVE') {
          await initMarketDataService(serverMarketDataProvider).connect();
        } else if (s.status === 'CONNECTED') {
          await initMarketDataService(mockMarketDataProvider).connect();
        }
      })
      .catch(() => undefined);
  }, [tick]);

  return (
    <>
      <WolfOpportunityPage
        key={tick}
        onOpenWolfAi={onOpenWolfAi}
        onOpenLive={onOpenLive}
        onConnectData={() => setConnectOpen(true)}
      />
      <ConnectMarketDataModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        status={mdStatus}
        onStatusChange={(s) => {
          setMdStatus(s);
          if (s.status === 'CONNECTED' && s.mode === 'LIVE') {
            void initMarketDataService(serverMarketDataProvider).connect();
          } else if (s.status === 'CONNECTED') {
            void initMarketDataService(mockMarketDataProvider).connect();
          }
          setTick((n) => n + 1);
        }}
      />
    </>
  );
}
