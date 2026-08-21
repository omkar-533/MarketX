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
      .then((s) => {
        setMdStatus(s);
        // The desk is gated on this, so let the broker handshake settle in the
        // background rather than holding up the first scan.
        if (isIndstocksLive(s)) {
          void initMarketDataService(serverMarketDataProvider).connect().catch(() => undefined);
        }
      })
      .catch(() => undefined)
      .finally(() => setSessionKnown(true));
  }, []);

  // A pending status is the server saying "still looking", so re-ask once it has
  // had time to finish rather than treating the user as disconnected.
  useEffect(() => {
    if (!mdStatus?.pending) return;
    const id = window.setTimeout(() => {
      void fetchMarketDataStatus({ force: true })
        .then(async (s) => {
          setMdStatus(s);
          if (isIndstocksLive(s)) {
            await initMarketDataService(serverMarketDataProvider).connect();
          }
        })
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearTimeout(id);
  }, [mdStatus]);

  useEffect(() => {
    if (!sessionKnown) return;
    if (!mdStatus) return;
    if (mdStatus.pending) return;
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
