import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, MessageCircle, Ticket, X, ArrowRight, Loader2, Check } from 'lucide-react';
import {
  deskPhoneDisplay,
  deskTelHref,
  deskWhatsAppUrl,
} from '../constants/deskContact';
import { verifyPromoCode } from '../services/promoCodes';

type PlanContactActionsProps = {
  /** Optional plan label for WhatsApp prefill. */
  planName?: string;
  className?: string;
  /** Compact row under pricing grids. */
  variant?: 'section' | 'inline';
};

function waMessage(planName?: string) {
  if (planName?.trim()) {
    return `Hi, I want to buy the ${planName.trim()} plan on Wolf Trade AI.`;
  }
  return 'Hi, I want to buy a plan on Wolf Trade AI.';
}

/** Call + WhatsApp desk contact. */
export function PlanContactActions({
  planName,
  className = '',
  variant = 'section',
}: PlanContactActionsProps) {
  const wa = deskWhatsAppUrl(waMessage(planName));
  return (
    <div className={`plan-contact plan-contact--${variant} ${className}`.trim()}>
      {variant === 'section' ? (
        <p className="plan-contact__lead">Call or WhatsApp us to activate your plan.</p>
      ) : null}
      <div className="plan-contact__btns">
        <a className="plan-contact__btn plan-contact__btn--call" href={deskTelHref()}>
          <Phone className="w-4 h-4" aria-hidden />
          Call {deskPhoneDisplay()}
        </a>
        <a
          className="plan-contact__btn plan-contact__btn--wa"
          href={wa}
          target="_blank"
          rel="noreferrer noopener"
        >
          <MessageCircle className="w-4 h-4" aria-hidden />
          WhatsApp message
        </a>
      </div>
    </div>
  );
}

type PlanContactModalProps = {
  open: boolean;
  onClose: () => void;
  planName?: string;
  /** After a promo is verified, Sign up appears and calls this with the code. */
  onSignUpWithPromo?: (promoCode: string) => void;
};

/** Shown when a Buy / Choose plan CTA is clicked (portaled so transforms don't clip it). */
export function PlanContactModal({
  open,
  onClose,
  planName,
  onSignUpWithPromo,
}: PlanContactModalProps) {
  const [promoCode, setPromoCode] = useState('');
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyOk, setVerifyOk] = useState('');

  useEffect(() => {
    if (!open) {
      setPromoCode('');
      setVerifiedCode(null);
      setVerifying(false);
      setVerifyError('');
      setVerifyOk('');
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const trimmed = promoCode.trim();
  const isVerified = Boolean(verifiedCode && verifiedCode === trimmed);
  const canSignUp = Boolean(onSignUpWithPromo) && isVerified;

  const runVerify = async () => {
    setVerifyError('');
    setVerifyOk('');
    setVerifiedCode(null);
    if (trimmed.length < 3) {
      setVerifyError('Enter a promo code first.');
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyPromoCode(trimmed);
      if (!result.valid) {
        setVerifyError(result.error || 'Invalid promo code');
        return;
      }
      const code = result.promo?.code || trimmed;
      setVerifiedCode(code);
      setPromoCode(code);
      const planNames: Record<string, string> = {
        trial: '3-day trial',
        monthly: 'Monthly',
        quarterly: '3 Months',
        yearly: 'Yearly',
      };
      const discount = Number(result.promo?.discountPercent) || 0;
      const planName = result.promo?.planId ? planNames[result.promo.planId] || result.promo.planId : '';
      const bits: string[] = [];
      if (discount > 0) bits.push(`${discount}% off${planName ? ` ${planName}` : ''}`);
      else if (planName) bits.push(planName);
      if (result.promo?.grantDays && result.promo.grantDays > 0) {
        bits.push(`${result.promo.grantDays} day access`);
      }
      setVerifyOk(bits.length ? `Code verified — ${bits.join(' · ')}.` : 'Code verified — ready to sign up.');
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Could not verify promo code');
    } finally {
      setVerifying(false);
    }
  };

  return createPortal(
    <div
      className="plan-contact-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-contact-title"
    >
      <button
        type="button"
        className="plan-contact-modal__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="plan-contact-modal__panel">
        <button
          type="button"
          className="plan-contact-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <h3 id="plan-contact-title">{planName ? `Get ${planName}` : 'Contact desk'}</h3>
        <p>
          Call or WhatsApp <strong>{deskPhoneDisplay()}</strong> and we will activate your access.
        </p>
        <PlanContactActions planName={planName} variant="inline" />

        {onSignUpWithPromo ? (
          <div className="plan-contact-modal__promo">
            <label className="plan-contact-modal__promo-label" htmlFor="plan-contact-promo">
              Have a promo code?
            </label>
            <div className="plan-contact-modal__promo-row">
              <span className="plan-contact-modal__promo-icon" aria-hidden>
                <Ticket className="w-4 h-4" />
              </span>
              <input
                id="plan-contact-promo"
                className="plan-contact-modal__promo-input"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value.toUpperCase());
                  setVerifiedCode(null);
                  setVerifyOk('');
                  setVerifyError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runVerify();
                  }
                }}
                placeholder="XXXXXX"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              className="plan-contact-modal__verify"
              disabled={verifying || trimmed.length < 3}
              onClick={() => void runVerify()}
            >
              {verifying ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : isVerified ? (
                <Check className="w-4 h-4" aria-hidden />
              ) : null}
              {verifying ? 'Verifying…' : isVerified ? 'Verified' : 'Verify code'}
            </button>
            {verifyError ? <p className="plan-contact-modal__promo-err">{verifyError}</p> : null}
            {verifyOk ? <p className="plan-contact-modal__promo-ok">{verifyOk}</p> : null}
            {canSignUp ? (
              <button
                type="button"
                className="plan-contact-modal__signup"
                onClick={() => {
                  onClose();
                  onSignUpWithPromo(verifiedCode!);
                }}
              >
                Sign up
                <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
            ) : (
              <p className="plan-contact-modal__promo-hint">
                Verify a valid promo code to unlock Sign up.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
