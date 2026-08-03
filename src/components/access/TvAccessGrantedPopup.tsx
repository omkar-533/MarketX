import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bell, CheckCircle2, ExternalLink, X } from 'lucide-react';
import { listTvAccessGrants, type TvAccessGrant } from '../../services/indicatorLibrary';
import { BRAND } from '../../constants/brandLabels';
import { normalizeExternalUrl, openExternalUrl } from '../../utils/openExternalUrl';

const SEEN_KEY_PREFIX = 'wolf_tv_grant_seen_';
const POLL_MS = 12_000;
export const OPEN_INDICATOR_EVENT = 'wolf:open-indicator';

type TvAccessGrantedPopupProps = {
  userId?: string | null;
  onOpenIndicator: (indicatorId: string) => void;
};

function loadSeen(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${SEEN_KEY_PREFIX}${userId}`);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(userId: string, ids: Set<string>) {
  localStorage.setItem(`${SEEN_KEY_PREFIX}${userId}`, JSON.stringify([...ids]));
}

function fireBrowserNotification(grant: TvAccessGrant, onOpen: () => void) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification('Indicator access approved', {
      body: `${grant.indicatorTitle} is ready — open it now on ${BRAND}.`,
      tag: `tv-grant-${grant.id}`,
      renotify: true,
    });
    n.onclick = () => {
      window.focus();
      onOpen();
      n.close();
    };
  } catch {
    /* ignore */
  }
}

/**
 * When admin Approves a TV access request, show an in-app popup + browser
 * notification with a direct "Open {Indicator}" button.
 */
export default function TvAccessGrantedPopup({
  userId,
  onOpenIndicator,
}: TvAccessGrantedPopupProps) {
  const [grant, setGrant] = useState<TvAccessGrant | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    seenRef.current = loadSeen(userId);
    primedRef.current = false;
  }, [userId]);

  const markSeen = useCallback(
    (id: string) => {
      if (!userId) return;
      seenRef.current.add(id);
      saveSeen(userId, seenRef.current);
    },
    [userId],
  );

  const openIndicator = useCallback(
    (g: TvAccessGrant) => {
      markSeen(g.id);
      setGrant(null);
      onOpenIndicator(g.indicatorId);
      window.dispatchEvent(
        new CustomEvent(OPEN_INDICATOR_EVENT, { detail: { id: g.indicatorId } }),
      );
    },
    [markSeen, onOpenIndicator],
  );

  const dismiss = () => {
    if (grant) markSeen(grant.id);
    setGrant(null);
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const grants = await listTvAccessGrants();
        if (cancelled) return;

        // First poll: don't spam old approvals — only keep recent (15 min) as fresh.
        if (!primedRef.current) {
          primedRef.current = true;
          const cutoff = Date.now() - 15 * 60 * 1000;
          for (const g of grants) {
            const t = Date.parse(g.reviewedAt || g.createdAt || '') || 0;
            if (t && t < cutoff) seenRef.current.add(g.id);
          }
          saveSeen(userId, seenRef.current);
        }

        const fresh = grants.find((g) => !seenRef.current.has(g.id));
        if (!fresh) return;

        setGrant((current) => current ?? fresh);

        if (!notifiedRef.current.has(fresh.id)) {
          notifiedRef.current.add(fresh.id);
          fireBrowserNotification(fresh, () => openIndicator(fresh));
        }
      } catch {
        /* ignore poll errors */
      }
    };

    void pull();
    const timer = window.setInterval(() => void pull(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [userId, openIndicator]);

  // Ask once for browser notifications after login (non-blocking).
  useEffect(() => {
    if (!userId || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    const t = window.setTimeout(() => {
      void Notification.requestPermission().catch(() => {});
    }, 4000);
    return () => window.clearTimeout(t);
  }, [userId]);

  const title = grant?.indicatorTitle || 'Indicator';

  return (
    <AnimatePresence>
      {grant ? (
        <motion.div
          className="tv-grant-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            className="tv-grant-overlay__backdrop"
            aria-label="Dismiss"
            onClick={dismiss}
          />
          <motion.div
            className="tv-grant"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tv-grant-title"
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <button type="button" className="tv-grant__close" onClick={dismiss} aria-label="Close">
              <X className="w-4 h-4" />
            </button>

            <div className="tv-grant__badge">
              <Bell className="w-3.5 h-3.5" />
              Access approved
            </div>

            <div className="tv-grant__icon" aria-hidden>
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h2 id="tv-grant-title" className="tv-grant__title">
              {title} is unlocked
            </h2>
            <p className="tv-grant__body">
              Desk approved your TradingView access. Open the indicator now, or jump straight to the
              invite link.
            </p>

            <button
              type="button"
              className="tv-grant__cta"
              onClick={() => openIndicator(grant)}
            >
              Open {title}
              <ArrowRight className="w-4 h-4" />
            </button>

            {normalizeExternalUrl(grant.inviteLink) ? (
              <button
                type="button"
                className="tv-grant__invite"
                onClick={() => {
                  const ok = openExternalUrl(grant.inviteLink);
                  if (!ok) return;
                  markSeen(grant.id);
                  setGrant(null);
                }}
              >
                Open invite on TradingView
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            ) : null}

            <button type="button" className="tv-grant__later" onClick={dismiss}>
              Later
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
