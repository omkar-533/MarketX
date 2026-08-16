/**
 * Top-level LIVE WOLF route — owns market-data connect modal for this desk.
 */
import { useEffect, useState } from 'react';
import LiveWolfPage from './LiveWolfPage';
import ConnectMarketDataModal from '../radar/ConnectMarketDataModal';
import {
  fetchMarketDataStatus,
  isIndstocksLive,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';

type Props = {
  onAskWolf?: () => void;
};

export default function LiveWolfRoute({ onAskWolf }: Props) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [mdStatus, setMdStatus] = useState<ServerConnectionStatus | null>(null);

  useEffect(() => {
    void fetchMarketDataStatus()
      .then(async (s) => {
        setMdStatus(s);
        if (isIndstocksLive(s)) {
          await initMarketDataService(serverMarketDataProvider).connect();
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <LiveWolfPage
        onAskWolf={onAskWolf}
        onConnectData={() => setConnectOpen(true)}
        dataConnected={mdStatus ? isIndstocksLive(mdStatus) : undefined}
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
          }
        }}
      />
    </>
  );
}
