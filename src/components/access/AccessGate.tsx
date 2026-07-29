import { AnimatePresence, motion } from 'framer-motion';
import { LockKeyhole, LogOut, MessageCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import BrandMark from '../BrandMark';
import AccessProofUpload from './AccessProofUpload';
import { BRAND } from '../../constants/brandLabels';
import type { AccessPopup, AccessState } from '../../services/appInviteAuth';

type AccessGateProps = {
  access: AccessState | null;
  popup: AccessPopup | null;
  userName?: string;
  userFullName?: string | null;
  userPhone?: string | null;
  userEmail?: string | null;
  onRefresh: () => unknown | Promise<unknown>;
  onLogout: () => void;
  onSeePlans: () => void;
};

const COPY: Record<string, { title: string; body: string }> = {
  trial_expired: {
    title: 'Your free trial has ended',
    body: 'Please fill in your details below. Our team will review your request and get back to you within 24 hours.',
  },
  access_expired: {
    title: 'Your access has expired',
    body: 'Submit your details in the form below. Our team will review and restore access within 24 hours.',
  },
  blocked: {
    title: 'Access paused by admin',
    body: 'Your account has been paused. Reach out to the desk to get it reviewed.',
  },
};

/**
 * Lock screen: in-app form (like TV access) → admin approve. Optional WhatsApp only.
 */
export default function AccessGate({
  access,
  popup,
  userName,
  userFullName,
  userPhone,
  userEmail,
  onRefresh,
  onLogout,
  onSeePlans,
}: AccessGateProps) {
  const locked = Boolean(access && !access.unlocked);
  const copy = COPY[access?.reason ?? 'trial_expired'] ?? COPY.trial_expired;
  const isBlocked = access?.status === 'blocked';
  const whatsapp = popup?.whatsapp?.trim();
  const pending = access?.request?.status === 'pending';

  return (
    <AnimatePresence>
      {locked ? (
        <motion.div
          className="access-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-gate-title"
        >
          <motion.div
            className="access-gate__card"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="access-gate__head">
              <BrandMark size="sm" iconOnly />
              <span className="access-gate__brand">{BRAND}</span>
              <span className="access-gate__badge">
                {isBlocked ? <ShieldAlert className="w-3 h-3" /> : <LockKeyhole className="w-3 h-3" />}
                {isBlocked ? 'Paused' : pending ? 'Pending approval' : 'Locked'}
              </span>
            </div>

            <h2 id="access-gate-title" className="access-gate__title">
              {userName ? `${userName}, ` : ''}
              {copy.title.charAt(0).toLowerCase() + copy.title.slice(1)}
            </h2>
            <p className="access-gate__body">{copy.body}</p>

            {!isBlocked ? (
              <div className="access-gate__steps">
                <div className="access-gate__step">
                  <span className="access-gate__step-num">1</span>
                  <div className="min-w-0 flex-1">
                    <p className="access-gate__step-title">
                      {popup?.title?.trim() || 'Request access'}
                    </p>
                    <p className="access-gate__step-body">
                      {popup?.message?.trim() ||
                        'Please fill in your name, mobile number, and TradingView ID. Our team will review your request and get back to you within 24 hours.'}
                    </p>
                    <AccessProofUpload
                      request={access?.request ?? null}
                      onSubmitted={onRefresh}
                      defaults={{
                        name: userFullName || userName,
                        phone: userPhone,
                        email: userEmail,
                      }}
                    />
                  </div>
                </div>

                {whatsapp ? (
                  <div className="access-gate__step">
                    <span className="access-gate__step-num">2</span>
                    <div>
                      <p className="access-gate__step-title">Need help?</p>
                      <p className="access-gate__step-body">
                        Optional — talk to the desk on WhatsApp.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <a
                          className="access-gate__link"
                          href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="access-gate__actions">
              <button type="button" className="access-gate__ghost" onClick={() => void onRefresh()}>
                <RefreshCw className="w-3.5 h-3.5" />
                Check approval
              </button>
              <button type="button" className="access-gate__ghost" onClick={onSeePlans}>
                See plans
              </button>
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
