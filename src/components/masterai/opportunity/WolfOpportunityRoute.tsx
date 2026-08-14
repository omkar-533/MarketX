import { useEffect, useState } from 'react';
import WolfOpportunityPage from './WolfOpportunityPage';
import ConnectMarketDataModal from '../radar/ConnectMarketDataModal';
import {
  fetchMarketDataStatus,
  isIndstocksLive,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
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
        if (isIndstocksLive(s)) {
          await initMarketDataService(serverMarketDataProvider).connect();
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
          if (isIndstocksLive(s)) {
            void initMarketDataService(serverMarketDataProvider).connect();
          }
          setTick((n) => n + 1);
        }}
      />
    </>
  );
}
