import { useEffect, useState } from 'react';
import WolfFnoPage from './WolfFnoPage';
import ConnectMarketDataModal from '../radar/ConnectMarketDataModal';
import {
  fetchMarketDataStatus,
  isIndstocksLive,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';

type Props = {
  onOpenLive: () => void;
};

export default function WolfFnoRoute({ onOpenLive }: Props) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [mdStatus, setMdStatus] = useState<ServerConnectionStatus | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [sessionKnown, setSessionKnown] = useState(false);

  useEffect(() => {
    void fetchMarketDataStatus()
      .then((s) => setMdStatus(s))
      .catch(() => undefined)
      .finally(() => setSessionKnown(true));
  }, []);

  return (
    <>
      <WolfFnoPage
        onOpenLive={onOpenLive}
        onConnectData={() => setConnectOpen(true)}
        liveHint={isIndstocksLive(mdStatus)}
        reloadToken={reloadToken}
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
            setReloadToken((n) => n + 1);
          }
        }}
      />
    </>
  );
}
