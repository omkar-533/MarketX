import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Hourglass, X } from 'lucide-react';
import AccessProofUpload from './AccessProofUpload';
import type { AccessPopup, AccessState } from '../../services/appInviteAuth';

type TrialReminderPopupProps = {
  access: AccessState | null;
  popup: AccessPopup | null;
  userId?: string;
  userName?: string | null;
  userPhone?: string | null;
  userEmail?: string | null;
  onRefresh: () => unknown | Promise<unknown>;
};

const SESSION_KEY_PREFIX = 'tradeflow_trial_nudge_session_';
const LAST_SHOWN_PREFIX = 'tradeflow_trial_nudge_last_';
/** First nudge after login — short delay so the desk can settle. */
const SHOW_DELAY_MS = 1800;
/** Occasional re-show while they stay logged in (~3.5 hours) */
const RESHOW_EVERY_MS = 3.5 * 60 * 60 * 1000;

function formatExpiry(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function formatCountdown(daysLeft: number | null, hoursLeft: number | null) {
  if (daysLeft === null) return 'Trial active';
  if (daysLeft <= 0) {
    const h = hoursLeft ?? 0;
    if (h <= 0) return 'Ends very soon';
    if (h === 1) return 'About 1 hour left';
    return `About ${h} hours left`;
  }
  if (daysLeft === 1) {
    const h = hoursLeft ?? 24;
    if (h < 24) return `About ${h} hours left`;
    return '1 day left';
  }
  return `${daysLeft} days left`;
}

/**
 * Trial countdown popup. Once opened it stays until the member dismisses it —
 * access polling / backdrop taps must not wipe it away on first login.
 */
export default function TrialReminderPopup({
  access,
  popup,
  userId,
  userName,
  userPhone,
  userEmail,
  onRefresh,
}: TrialReminderPopupProps) {
  const [open, setOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const openRef = useRef(false);

  const daysLeft = access?.daysLeft ?? null;
  const hoursLeft = access?.hoursLeft ?? null;
  const expiresAt = access?.expiresAt ?? null;
  const eligible = Boolean(access?.unlocked && access.isTrial && userId);

  const markSessionShown = () => {
    if (!userId) return;
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${userId}`, '1');
    localStorage.setItem(`${LAST_SHOWN_PREFIX}${userId}`, String(Date.now()));
  };

  const tryShow = (reason: 'session' | 'interval') => {
    if (!eligible || !userId || openRef.current) return;
    const sessionKey = `${SESSION_KEY_PREFIX}${userId}`;
    const lastKey = `${LAST_SHOWN_PREFIX}${userId}`;
    const last = Number(localStorage.getItem(lastKey) || 0);
    const now = Date.now();

    if (reason === 'session') {
      if (sessionStorage.getItem(sessionKey) === '1') return;
    } else if (now - last < RESHOW_EVERY_MS) {
      return;
    }

    openRef.current = true;
    setOpen(true);
    // Mark only after it is actually showing — not before — so a failed flash can retry.
    markSessionShown();
  };

  useEffect(() => {
    if (!eligible || !userId) return;

    const timer = window.setTimeout(() => tryShow('session'), SHOW_DELAY_MS);
    const interval = window.setInterval(
      () => tryShow('interval'),
      Math.min(RESHOW_EVERY_MS, 15 * 60 * 1000),
    );

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
    // Intentionally not depending on daysLeft/hoursLeft — access polling must not remount this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, userId]);

  const close = () => {
    openRef.current = false;
    setOpen(false);
    setShowUpload(false);
    markSessionShown();
  };

  const expiryLabel = formatExpiry(expiresAt);
  const countdown = formatCountdown(daysLeft, hoursLeft);
  const headline =
    daysLeft !== null && daysLeft <= 0
      ? 'Your free trial ends today'
      : 'Your free trial is running';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="trial-nudge-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
        >
          {/* Backdrop does not dismiss — first-login popup must stay until a real action. */}
          <div className="trial-nudge-overlay__backdrop" aria-hidden />
          <motion.aside
            className="trial-nudge"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Trial reminder"
          >
            <button type="button" className="trial-nudge__close" onClick={close} aria-label="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="trial-nudge__badge">
              <Hourglass className="w-3 h-3" />
              Free trial
            </div>

            <p className="trial-nudge__title">{headline}</p>

            <div className="trial-nudge__timing">
              <div className="trial-nudge__countdown">
                <Clock className="w-4 h-4" />
                <span>{countdown}</span>
              </div>
              {expiryLabel ? (
                <p className="trial-nudge__expires">
                  Expires: <strong>{expiryLabel}</strong>
                </p>
              ) : null}
            </div>

            <p className="trial-nudge__body">
              {popup?.message?.trim() ||
                'Fill in your details to request longer access. Our team will get back to you within 24 hours.'}
            </p>

            <div className="trial-nudge__scroll">
              {showUpload ? (
                <AccessProofUpload
                  request={access?.request ?? null}
                  defaults={{ name: userName, phone: userPhone, email: userEmail }}
                  onSubmitted={async () => {
                    await onRefresh();
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="trial-nudge__cta"
                  onClick={() => setShowUpload(true)}
                >
                  Request access
                </button>
              )}
            </div>

            <div className="trial-nudge__footer">
              <button type="button" className="trial-nudge__dismiss" onClick={close}>
                Dismiss
              </button>
              {!showUpload ? (
                <button type="button" className="trial-nudge__later" onClick={close}>
                  Remind me later
                </button>
              ) : (
                <button type="button" className="trial-nudge__later" onClick={() => setShowUpload(false)}>
                  Back
                </button>
              )}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
