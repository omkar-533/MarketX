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
  const [rescanToken, setRescanToken] = useState(0);
  const [sessionKnown, setSessionKnown] = useState(false);

  useEffect(() => {
    void fetchMarketDataStatus()
      .then(async (s) => {
        setMdStatus(s);
        if (isIndstocksLive(s)) {
          await initMarketDataService(serverMarketDataProvider).connect();
        }
      })
      .catch(() => undefined)
      .finally(() => setSessionKnown(true));
  }, []);

  useEffect(() => {
    if (!sessionKnown) return;
    if (!mdStatus) return;
    if (isIndstocksLive(mdStatus)) return;
    setConnectOpen(true);
  }, [sessionKnown, mdStatus]);

  return (
    <>
      <WolfOpportunityPage
        onOpenWolfAi={onOpenWolfAi}
        onOpenLive={onOpenLive}
        onConnectData={() => setConnectOpen(true)}
        liveHint={isIndstocksLive(mdStatus)}
        rescanToken={rescanToken}
        sessionKnown={sessionKnown}
      />
      <ConnectMarketDataModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        status={mdStatus}
        onStatusChange={(s) => {
          setMdStatus(s);
          if (isIndstocksLive(s)) {
            setConnectOpen(false);
            void initMarketDataService(serverMarketDataProvider).connect();
            setRescanToken((n) => n + 1);
          }
        }}
      />
    </>
  );
}
