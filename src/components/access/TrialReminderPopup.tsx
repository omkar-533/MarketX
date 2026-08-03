import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Hourglass, X } from 'lucide-react';
import AccessProofUpload from './AccessProofUpload';
import type { AccessState } from '../../services/appInviteAuth';

type TrialReminderPopupProps = {
  access: AccessState | null;
  userId?: string;
  userName?: string | null;
  userPhone?: string | null;
  onRefresh: () => unknown | Promise<unknown>;
};

const SESSION_KEY_PREFIX = 'tradeflow_trial_nudge_session_';
const LAST_SHOWN_PREFIX = 'tradeflow_trial_nudge_last_';
/**
 * Do NOT interrupt right after login — give the member time on the desk first.
 * First nudge ~12 minutes after they land (same session only once).
 */
const SHOW_DELAY_MS = 12 * 60 * 1000;
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
 * Occasional trial countdown for free-trial members.
 * Skips the moment of login so the popup does not appear immediately.
 */
export default function TrialReminderPopup({
  access,
  userId,
  userName,
  userPhone,
  onRefresh,
}: TrialReminderPopupProps) {
  const [open, setOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const daysLeft = access?.daysLeft ?? null;
  const hoursLeft = access?.hoursLeft ?? null;
  const expiresAt = access?.expiresAt ?? null;
  const eligible = Boolean(access?.unlocked && access.isTrial && userId);

  const tryShow = (reason: 'session' | 'interval') => {
    if (!eligible || !userId) return;
    const sessionKey = `${SESSION_KEY_PREFIX}${userId}`;
    const lastKey = `${LAST_SHOWN_PREFIX}${userId}`;
    const last = Number(localStorage.getItem(lastKey) || 0);
    const now = Date.now();

    if (reason === 'session') {
      if (sessionStorage.getItem(sessionKey) === '1') return;
    } else if (now - last < RESHOW_EVERY_MS) {
      return;
    }

    setOpen(true);
    sessionStorage.setItem(sessionKey, '1');
    localStorage.setItem(lastKey, String(now));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, userId]);

  const close = () => {
    setOpen(false);
    setShowUpload(false);
  };

  const expiryLabel = formatExpiry(expiresAt);
  const countdown = formatCountdown(daysLeft, hoursLeft);
  const headline =
    daysLeft !== null && daysLeft <= 0
      ? 'Your free trial ends today'
      : 'Your free trial is running';

  return (
    <AnimatePresence>
      {open && eligible ? (
        <motion.div
          className="trial-nudge-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
        >
          <button
            type="button"
            className="trial-nudge-overlay__backdrop"
            aria-label="Dismiss"
            onClick={close}
          />
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
              Your free trial is active. Submit verification details anytime so the desk can extend
              access before it ends.
            </p>

            <div className="trial-nudge__scroll">
              {showUpload ? (
                <AccessProofUpload
                  request={access?.request ?? null}
                  defaults={{ name: userName, phone: userPhone }}
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
                  Submit verification
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
