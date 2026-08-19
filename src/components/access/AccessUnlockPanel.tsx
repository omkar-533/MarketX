import type { ReactNode } from 'react';
import { MessageCircle } from 'lucide-react';
import AccessProofUpload from './AccessProofUpload';
import { DESK_WHATSAPP_E164 } from '../../constants/deskContact';
import type { AccessPopup, AccessRequestSummary } from '../../services/appInviteAuth';

export type AccessUnlockPanelProps = {
  popup: AccessPopup | null;
  /** When set, shows the demat + screenshot form (signed-in). */
  request?: AccessRequestSummary | null;
  defaults?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  onSubmitted?: () => unknown | Promise<unknown>;
  /** Landing / guest: hide form, show CTAs instead. */
  guestMode?: boolean;
  onGuestStartTrial?: () => void;
  onGuestSignIn?: () => void;
  className?: string;
  titleId?: string;
  /** Extra footer actions (Check again, Sign out, etc.) */
  footer?: ReactNode;
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

export function stepsFromMessage(message: string | undefined | null, whatsapp: string): string[] {
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
 * Shared unlock / approval content used by AccessGate, Subscription, and landing pricing.
 */
export default function AccessUnlockPanel({
  popup,
  request = null,
  defaults,
  onSubmitted,
  guestMode = false,
  onGuestStartTrial,
  onGuestSignIn,
  className = '',
  titleId,
  footer,
}: AccessUnlockPanelProps) {
  const link = popup?.url?.trim();
  const whatsapp = DESK_WHATSAPP_E164;
  const pending = request?.status === 'pending';
  const title = popup?.title?.trim() || 'Unlock premium access';
  const linkLabel = popup?.buttonLabel?.trim() || 'click here';
  const steps = stepsFromMessage(popup?.message, whatsapp || '');
  const showForm = !guestMode && popup?.enabled !== false;

  return (
    <div className={`access-unlock ${className}`.trim()}>
      <h2 id={titleId} className="access-unlock__title">
        {title}
      </h2>

      <div className="access-unlock__link-row">
        <span className="access-unlock__link-label">{linkRowLabel(title)}</span>
        {link ? (
          <a
            className="access-unlock__click"
            href={link}
            target="_blank"
            rel="noreferrer noopener"
          >
            {linkLabel.toLowerCase() === 'open link' ? 'click here' : linkLabel}
          </a>
        ) : (
          <span className="access-unlock__link-missing">Link coming soon</span>
        )}
      </div>

      <p className="access-unlock__steps-heading">
        Follow the steps below to unlock all premium features for free:
      </p>
      <ul className="access-unlock__bullets">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>

      {showForm ? (
        <div className="access-unlock__proof">
          <p className="access-unlock__proof-title">
            {pending
              ? 'Verification under review'
              : 'Submit demat + F&O screenshot'}
          </p>
          <AccessProofUpload
            request={request}
            onSubmitted={onSubmitted || (() => undefined)}
            defaults={defaults}
          />
        </div>
      ) : null}

      {guestMode ? (
        <div className="access-unlock__guest">
          <p className="access-unlock__guest-note">
            Sign in to submit demat + F&amp;O screenshot for desk verification — or Call / WhatsApp
            us to buy a plan.
          </p>
          <div className="access-unlock__guest-actions">
            {onGuestSignIn ? (
              <button type="button" className="access-unlock__cta" onClick={onGuestSignIn}>
                Sign in to submit
              </button>
            ) : null}
            {whatsapp ? (
              <a
                className="access-unlock__ghost access-unlock__ghost--wa"
                href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {footer ? <div className="access-unlock__footer">{footer}</div> : null}
    </div>
  );
}
