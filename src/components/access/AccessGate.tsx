import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, MessageCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import AccessProofUpload from './AccessProofUpload';
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

function formatWhatsAppDisplay(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return raw.trim();
}

function linkRowLabel(title: string) {
  const base = title.trim().replace(/^open\s+/i, '') || 'Account';
  if (/opening\s+link/i.test(base)) return base.endsWith(':') ? base : `${base}:`;
  return `${base} Opening Link:`;
}

function stepsFromMessage(message: string | undefined | null, whatsapp: string): string[] {
  const lines = String(message || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean);

  if (lines.length >= 2) return lines;

  const wa = whatsapp ? formatWhatsAppDisplay(whatsapp) : 'our WhatsApp desk';
  return [
    'Open the account using the referral link above',
    'Take any small trade in the F&O segment',
    `Send your account details on WhatsApp: ${wa}`,
    'Our team will verify and unlock your premium access',
    'Make sure you take a trade first, then send details — only then we can verify',
    'Hurrey !!! You are done.',
  ];
}

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
  const link = popup?.url?.trim();
  const whatsapp = popup?.whatsapp?.trim();
  const pending = access?.request?.status === 'pending';
  const title = popup?.title?.trim() || (isBlocked ? 'Access paused' : 'Unlock premium access');
  const linkLabel = popup?.buttonLabel?.trim() || 'click here';
  const steps = stepsFromMessage(popup?.message, whatsapp || '');

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
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            {isBlocked ? (
              <div className="access-gate__blocked">
                <ShieldAlert className="w-5 h-5" />
                <p>Your account has been paused. Reach out to the desk to get it reviewed.</p>
              </div>
            ) : (
              <>
                <h2 id="access-gate-title" className="access-gate__title">
                  {title}
                </h2>

                <div className="access-gate__link-row">
                  <span className="access-gate__link-label">{linkRowLabel(title)}</span>
                  {link ? (
                    <a
                      className="access-gate__click"
                      href={link}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {linkLabel.toLowerCase() === 'open link' ? 'click here' : linkLabel}
                    </a>
                  ) : (
                    <span className="access-gate__link-missing">Link coming soon</span>
                  )}
                </div>

                <p className="access-gate__steps-heading">
                  Follow the steps below to unlock all premium features for free:
                </p>
                <ul className="access-gate__bullets">
                  {steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>

                {popup?.enabled !== false ? (
                  <div className="access-gate__proof">
                    <p className="access-gate__proof-title">
                      {pending ? 'Verification under review' : 'Submit details for verification'}
                    </p>
                    <AccessProofUpload
                      request={access?.request ?? null}
                      onSubmitted={onRefresh}
                      defaults={{ name: userFullName, phone: userPhone }}
                    />
                  </div>
                ) : null}
              </>
            )}

            <div className="access-gate__actions">
              <button type="button" className="access-gate__ghost" onClick={() => void onRefresh()}>
                <RefreshCw className="w-3.5 h-3.5" />
                Check again
              </button>
              <button type="button" className="access-gate__ghost" onClick={onSeePlans}>
                See plans
              </button>
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
