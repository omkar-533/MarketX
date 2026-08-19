import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, MessageCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import AccessUnlockPanel from './AccessUnlockPanel';
import AppLink from '../AppLink';
import { DESK_WHATSAPP_E164 } from '../../constants/deskContact';
import type { AccessPopup, AccessState } from '../../services/appInviteAuth';

type AccessGateProps = {
  access: AccessState | null;
  popup: AccessPopup | null;
  userName?: string;
  userFullName?: string | null;
  userPhone?: string | null;
  onRefresh: () => unknown | Promise<unknown>;
  onLogout: () => void;
  onSeePlans: () => void;
};

/**
 * Professional lock modal (TradeFinder-style): title, click-here link, bullet steps, proof upload.
 */
export default function AccessGate({
  access,
  popup,
  userFullName,
  userPhone,
  onRefresh,
  onLogout,
  onSeePlans,
}: AccessGateProps) {
  const locked = Boolean(access && !access.unlocked);
  const isBlocked = access?.status === 'blocked';
  const whatsapp = DESK_WHATSAPP_E164;

  // Prevent background page from keeping a mid-scroll position under the sheet.
  useEffect(() => {
    if (!locked) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [locked]);

  const goSeePlans = () => {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      window.scrollTo(0, 0);
    }
    onSeePlans();
  };

  return (
    <AnimatePresence>
      {locked ? (
        <motion.div
          className="access-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-gate-title"
        >
          <motion.div
            className="access-gate__card"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {isBlocked ? (
              <div className="access-gate__blocked">
                <ShieldAlert className="w-5 h-5" />
                <p>Your account has been paused. Reach out to the desk to get it reviewed.</p>
              </div>
            ) : (
              <AccessUnlockPanel
                className="access-unlock--gate"
                titleId="access-gate-title"
                popup={popup}
                request={access?.request ?? null}
                onSubmitted={onRefresh}
                defaults={{ name: userFullName, phone: userPhone }}
              />
            )}

            <div className="access-gate__actions">
              <button type="button" className="access-gate__ghost" onClick={() => void onRefresh()}>
                <RefreshCw className="w-3.5 h-3.5" />
                Check again
              </button>
              <AppLink to="subscription" className="access-gate__ghost" onActivate={goSeePlans}>
                See plans
              </AppLink>
              {whatsapp ? (
                <a
                  className="access-gate__ghost access-gate__ghost--wa"
                  href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              ) : null}
              <button type="button" className="access-gate__ghost" onClick={onLogout}>
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
