import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link2, Radio, X } from 'lucide-react';
import ConnectMarketDataModal from '../masterai/radar/ConnectMarketDataModal';
import {
  fetchMarketDataStatus,
  type ServerConnectionStatus,
} from '../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../services/marketData/MarketDataService';
import { serverMarketDataProvider } from '../../services/marketData/ServerMarketDataProvider';

const SESSION_KEY_PREFIX = 'wolf_live_connect_nudge_';
const SHOW_DELAY_MS = 900;

type Props = {
  userId?: string | null;
  enabled: boolean;
};

function isLiveConnected(status: ServerConnectionStatus | null | undefined) {
  return status?.status === 'CONNECTED' && status.mode === 'LIVE';
}

/**
 * After login: nudge members to connect live market data.
 * Shown once per browser session (cleared on logout). Skipped if already LIVE
 * (token survives logout until the broker rejects it — do not ask for the key again).
 */
export default function ConnectLiveNudgePopup({ userId, enabled }: Props) {
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [mdStatus, setMdStatus] = useState<ServerConnectionStatus | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setNudgeOpen(false);
      return;
    }

    const sessionKey = `${SESSION_KEY_PREFIX}${userId}`;
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return;
    } catch {
      /* ignore */
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchMarketDataStatus()
        .then(async (s) => {
          if (cancelled) return;
          setMdStatus(s);
          if (isLiveConnected(s)) {
            if (s.mode === 'LIVE') {
              await initMarketDataService(serverMarketDataProvider).connect();
            }
            return;
          }
          setNudgeOpen(true);
          try {
            sessionStorage.setItem(sessionKey, '1');
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          if (cancelled) return;
          setNudgeOpen(true);
          try {
            sessionStorage.setItem(sessionKey, '1');
          } catch {
            /* ignore */
          }
        });
    }, SHOW_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, userId]);

  const dismiss = () => setNudgeOpen(false);

  const openConnect = () => {
    setNudgeOpen(false);
    setConnectOpen(true);
  };

  return (
    <>
      <AnimatePresence>
        {nudgeOpen && enabled ? (
          <motion.div
            className="trial-nudge-overlay live-connect-nudge-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
          >
            <button
              type="button"
              className="trial-nudge-overlay__backdrop"
              aria-label="Dismiss"
              onClick={dismiss}
            />
            <motion.aside
              className="trial-nudge live-connect-nudge"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Connect live data"
            >
              <button
                type="button"
                className="trial-nudge__close"
                onClick={dismiss}
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="trial-nudge__badge">
                <Radio className="w-3 h-3" />
                Live data
              </div>

              <p className="trial-nudge__title">Connect live data</p>

              <p className="trial-nudge__body">
                Please connect live data to experience the real power of Wolf AI.
              </p>

              <button type="button" className="trial-nudge__cta" onClick={openConnect}>
                <Link2 className="w-3.5 h-3.5" />
                Connect
              </button>

              <div className="trial-nudge__footer">
                <button type="button" className="trial-nudge__later" onClick={dismiss}>
                  Later
                </button>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ConnectMarketDataModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        status={mdStatus}
        onStatusChange={(s) => {
          setMdStatus(s);
          if (s.status === 'CONNECTED' && s.mode === 'LIVE') {
            void initMarketDataService(serverMarketDataProvider).connect();
            setConnectOpen(false);
          }
        }}
      />
    </>
  );
}

/** Clear so the nudge can show again on the next login in this tab. */
export function clearConnectLiveNudgeSession(userId?: string | null) {
  if (!userId) return;
  try {
    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${userId}`);
  } catch {
    /* ignore */
  }
}
