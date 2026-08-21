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

const SHOW_DELAY_MS = 900;
const AUTO_HIDE_MS = 5_000;
const PENDING_RETRY_MS = 1_200;
const PENDING_TRIES = 3;

/**
 * Kept in memory, not sessionStorage: a hard refresh has to ask again, but moving
 * between desks in the same page load must not re-open the nudge.
 */
const askedFor = new Set<string>();

type Props = {
  userId?: string | null;
  enabled: boolean;
};

function isLiveConnected(status: ServerConnectionStatus | null | undefined) {
  return status?.status === 'CONNECTED' && status.mode === 'LIVE';
}

/**
 * After login or a hard refresh: nudge members to connect live market data, then
 * step out of the way after {@link AUTO_HIDE_MS}. The connect sheet only opens on
 * a click — this popup never takes the screen on its own.
 */
export default function ConnectLiveNudgePopup({ userId, enabled }: Props) {
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [hold, setHold] = useState(false);
  const [mdStatus, setMdStatus] = useState<ServerConnectionStatus | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setNudgeOpen(false);
      // Signed out, so the next sign-in is a fresh ask. A locked account keeps its
      // id, so plan changes cannot bounce the nudge back onto the screen.
      if (!userId) askedFor.clear();
      return;
    }
    if (askedFor.has(userId)) return;

    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((done) => {
        timers.push(window.setTimeout(done, ms));
      });

    const ask = () => {
      askedFor.add(userId);
      setNudgeOpen(true);
    };

    const run = async () => {
      await wait(SHOW_DELAY_MS);
      if (cancelled) return;

      let status: ServerConnectionStatus | null = null;
      for (let attempt = 0; attempt < PENDING_TRIES; attempt += 1) {
        try {
          status = await fetchMarketDataStatus({ force: attempt > 0 });
        } catch {
          status = null;
        }
        if (cancelled) return;
        // A cold server answers /status from memory and flags it pending. Reading
        // that as "not connected" is what used to re-ask an already-live member
        // for their token, so wait for the confirmed answer before deciding.
        if (!status?.pending) break;
        await wait(PENDING_RETRY_MS);
        if (cancelled) return;
      }

      setMdStatus(status);
      if (isLiveConnected(status)) {
        askedFor.add(userId);
        await initMarketDataService(serverMarketDataProvider).connect();
        return;
      }
      ask();
    };

    void run();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [enabled, userId]);

  useEffect(() => {
    if (!nudgeOpen || hold) return;
    const timer = window.setTimeout(() => setNudgeOpen(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [nudgeOpen, hold]);

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
              onMouseEnter={() => setHold(true)}
              onMouseLeave={() => setHold(false)}
              onFocusCapture={() => setHold(true)}
              onBlurCapture={() => setHold(false)}
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