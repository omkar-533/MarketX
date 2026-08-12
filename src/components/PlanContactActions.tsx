import { Phone, MessageCircle, X } from 'lucide-react';
import {
  deskPhoneDisplay,
  deskTelHref,
  deskWhatsAppUrl,
} from '../constants/deskContact';

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

/** Call + WhatsApp desk contact — no payment gateway yet. */
export function PlanContactActions({
  planName,
  className = '',
  variant = 'section',
}: PlanContactActionsProps) {
  const wa = deskWhatsAppUrl(waMessage(planName));
  return (
    <div className={`plan-contact plan-contact--${variant} ${className}`.trim()}>
      {variant === 'section' ? (
        <p className="plan-contact__lead">
          Payment gateway coming soon — call or WhatsApp us to activate your plan.
        </p>
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
};

/** Shown when a Buy / Choose plan CTA is clicked. */
export function PlanContactModal({ open, onClose, planName }: PlanContactModalProps) {
  if (!open) return null;
  return (
    <div className="plan-contact-modal" role="dialog" aria-modal="true" aria-labelledby="plan-contact-title">
      <button type="button" className="plan-contact-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="plan-contact-modal__panel">
        <button type="button" className="plan-contact-modal__close" onClick={onClose} aria-label="Close">
          <X className="w-4 h-4" />
        </button>
        <h3 id="plan-contact-title">
          {planName ? `Get ${planName}` : 'Contact desk'}
        </h3>
        <p>
          No online payment yet. Call or WhatsApp{' '}
          <strong>{deskPhoneDisplay()}</strong> and we will activate your access.
        </p>
        <PlanContactActions planName={planName} variant="inline" />
      </div>
    </div>
  );
}
