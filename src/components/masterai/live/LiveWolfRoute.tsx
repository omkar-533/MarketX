/**
 * Top-level LIVE WOLF route — owns market-data connect modal for this desk.
 */
import { useEffect, useState } from 'react';
import LiveWolfPage from './LiveWolfPage';
import ConnectMarketDataModal from '../radar/ConnectMarketDataModal';
import {
  fetchMarketDataStatus,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { mockMarketDataProvider } from '../../../services/radar/MockMarketDataProvider';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';

type Props = {
  onAskWolf: () => void;
};

export default function LiveWolfRoute({ onAskWolf }: Props) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [mdStatus, setMdStatus] = useState<ServerConnectionStatus | null>(null);

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
  }, []);

  return (
    <>
      <LiveWolfPage
        onAskWolf={onAskWolf}
        onConnectData={() => setConnectOpen(true)}
        dataConnected={mdStatus ? mdStatus.status === 'CONNECTED' : undefined}
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
        }}
      />
    </>
  );
}
