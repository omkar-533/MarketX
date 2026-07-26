import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Hourglass, X } from 'lucide-react';
import AccessProofUpload from './AccessProofUpload';
import type { AccessPopup, AccessState } from '../../services/appInviteAuth';

type TrialReminderPopupProps = {
  access: AccessState | null;
  popup: AccessPopup | null;
  userId?: string;
  onRefresh: () => unknown | Promise<unknown>;
};

const STORAGE_PREFIX = 'tradeflow_trial_reminder_';
const SHOW_DELAY_MS = 3500;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Trial countdown nudge: once a day, and every session on the final day so the
 * user is never surprised by the lock screen.
 */
export default function TrialReminderPopup({
  access,
  popup,
  userId,
  onRefresh,
}: TrialReminderPopupProps) {
  const [open, setOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const daysLeft = access?.daysLeft ?? null;
  const eligible = Boolean(
    access?.unlocked && access.isTrial && daysLeft !== null && userId && popup?.enabled,
  );
  const finalDay = daysLeft !== null && daysLeft <= 1;

  useEffect(() => {
    if (!eligible || !userId) return;

    const dayKey = `${STORAGE_PREFIX}${userId}`;
    const sessionKey = `${dayKey}_session`;

    if (finalDay) {
      if (sessionStorage.getItem(sessionKey)) return;
    } else if (localStorage.getItem(dayKey) === today()) {
      return;
    }

    const timer = window.setTimeout(() => {
      setOpen(true);
      localStorage.setItem(dayKey, today());
      sessionStorage.setItem(sessionKey, '1');
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [eligible, finalDay, userId]);

  const close = () => {
    setOpen(false);
    setShowUpload(false);
  };

  const headline =
    daysLeft === null
      ? 'Trial running'
      : daysLeft <= 0
        ? 'Your trial ends today'
        : daysLeft === 1
          ? '1 day left in your trial'
          : `${daysLeft} days left in your trial`;

  return (
    <AnimatePresence>
      {open && eligible ? (
        <motion.aside
          className="trial-nudge"
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
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
          <p className="trial-nudge__body">{popup?.message}</p>

          {popup?.url ? (
            <a
              className="trial-nudge__link"
              href={popup.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {popup.buttonLabel || 'Open link'}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : null}

          {showUpload ? (
            <AccessProofUpload
              request={access?.request ?? null}
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
              Upload screenshot
            </button>
          )}

          <button type="button" className="trial-nudge__later" onClick={close}>
            Remind me later
          </button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
