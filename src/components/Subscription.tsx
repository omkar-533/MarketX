import { type MouseEvent } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Crown,
  ExternalLink,
  Hourglass,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { PLANS, TRIAL_DAYS, type Plan } from '../constants/plans';
import type { User } from '../hooks/useAuth';
import type { AccessPopup, AccessState } from '../services/appInviteAuth';

interface SubscriptionProps {
  user: User | null;
  access?: AccessState | null;
  popup?: AccessPopup | null;
}

function statusLine(access: AccessState | null | undefined) {
  if (!access) return 'Your plan is managed by the desk.';
  if (access.status === 'blocked') return 'Your access is paused — contact the desk.';
  if (!access.unlocked) {
    return access.reason === 'trial_expired'
      ? 'Your free trial has ended — pick a plan below to continue.'
      : 'Your access has expired — renew below to continue.';
  }
  if (access.daysLeft === null) return 'You have lifetime access. Nothing to renew.';
  if (access.isTrial) {
    return access.daysLeft <= 1
      ? `Your free trial ends in ${access.hoursLeft ?? 0} hours.`
      : `${access.daysLeft} days left in your free trial.`;
  }
  return `${access.daysLeft} days left on your current access.`;
}

function PlanCard({
  plan,
  index,
  link,
  isTrialUser,
  popupLabel,
}: {
  plan: Plan;
  index: number;
  link?: string;
  isTrialUser: boolean;
  popupLabel?: string;
}) {
  const reduced = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, { stiffness: 240, damping: 20 });
  const rotateY = useSpring(rawY, { stiffness: 240, damping: 20 });
  const isTrial = plan.id === 'trial';

  const onMove = (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    if (reduced) return;
    rawY.set((px - 0.5) * 11);
    rawX.set(-(py - 0.5) * 11);
  };

  const onLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.div
      className={`plan-wrap ${plan.featured ? 'plan-wrap--featured' : ''}`}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 * index, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.article
        className={`plan ${plan.featured ? 'plan--featured' : ''}`}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ rotateX, rotateY, transformPerspective: 1000 }}
      >
        <span className="plan__ring" aria-hidden="true" />
        <span className="plan__plate" aria-hidden="true" />
        <span className="plan__spot" aria-hidden="true" />
        {plan.featured ? <span className="plan__sheen" aria-hidden="true" /> : null}

        <div className="plan__body">
          {plan.badge ? (
            <span className={`plan__badge ${plan.featured ? 'plan__badge--hot' : ''}`}>
              {plan.featured ? <Sparkles className="w-3 h-3" aria-hidden /> : null}
              {plan.badge}
            </span>
          ) : (
            <span className="plan__badge plan__badge--ghost">Full access</span>
          )}

          <h3 className="plan__name">{plan.name}</h3>

          <div className="plan__price">
            {plan.price === 0 ? (
              <>
                <span className="plan__amount plan__amount--free">Free</span>
                <span className="plan__period">for {TRIAL_DAYS} days</span>
              </>
            ) : (
              <>
                <span className="plan__amount">
                  <i aria-hidden>₹</i>
                  {plan.price.toLocaleString('en-IN')}
                </span>
                <span className="plan__period">{plan.period}</span>
              </>
            )}
          </div>

          {plan.equivalent || plan.save ? (
            <p className="plan__meta">
              {plan.equivalent ? <span>{plan.equivalent}</span> : null}
              {plan.save ? <b>{plan.save}</b> : null}
            </p>
          ) : (
            <p className="plan__meta plan__meta--empty">Master AI · Indicators · Journal</p>
          )}

          <p className="plan__tagline">{plan.tagline}</p>

          {isTrial ? (
            <div className="plan__cta plan__cta--solid" style={{ pointerEvents: 'none', opacity: 0.9 }}>
              <ShieldCheck className="w-4 h-4" aria-hidden />
              {isTrialUser ? 'Your current trial' : `${TRIAL_DAYS} days, already used`}
            </div>
          ) : link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className={`plan__cta ${plan.featured ? 'plan__cta--solid' : ''}`}
            >
              {plan.featured ? <Zap className="w-4 h-4" aria-hidden /> : null}
              {popupLabel || plan.cta}
              <ExternalLink className="w-4 h-4" aria-hidden />
            </a>
          ) : (
            <div className="plan__cta" style={{ pointerEvents: 'none', opacity: 0.7 }}>
              Contact the desk
              <ArrowRight className="w-4 h-4" aria-hidden />
            </div>
          )}
          <p className="plan__note">{plan.note}</p>

          <ul className="plan__features">
            {plan.features.map((feature) => (
              <li key={feature}>
                <span className="plan__tick" aria-hidden="true">
                  <Check className="w-3 h-3" />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </motion.article>
    </motion.div>
  );
}

/** In-app pricing — same plan cards as the landing page. */
export default function Subscription({ user, access, popup }: SubscriptionProps) {
  const link = popup?.url?.trim();
  const whatsapp = popup?.whatsapp?.trim();
  const isTrialUser = access?.isTrial ?? Boolean(user?.trialEndsAt);

  return (
    <div className="app-lux-page space-y-8">
      <header className="app-lux-page__head">
        <p className="auth-lux__kicker">Pricing</p>
        <h2 className="auth-lux__section-title">
          <Crown className="inline-block w-7 h-7 mr-2 text-[#e8d48b] align-middle" />
          Same full desk, your choice of term
        </h2>
        <p className="auth-lux__section-sub">
          Every plan covers Master AI, Indicators, and Trading Journal — higher plans unlock more.
        </p>
      </header>

      <div className="lux-panel lux-panel--pad lux-panel--static flex flex-wrap items-center gap-3">
        <Hourglass className="w-4 h-4 text-[#e8d48b] shrink-0" />
        <p className="text-sm text-[rgba(190,190,198,0.9)]">{statusLine(access)}</p>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer noopener" className="auth-lux__btn-solid ml-auto text-xs !py-2 !px-4">
            {popup?.buttonLabel || 'Open link'}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : null}
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer noopener"
            className="auth-lux__btn-ghost text-xs !py-2 !px-4 inline-flex items-center gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Talk to the desk
          </a>
        ) : null}
      </div>

      <div className="auth-lux__plans">
        {PLANS.map((plan, i) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            index={i}
            link={link}
            isTrialUser={isTrialUser}
            popupLabel={popup?.buttonLabel}
          />
        ))}
      </div>

      <p className="auth-lux__plans-foot">
        Prices in INR, inclusive of taxes. Paid access is activated by the desk after your account
        is verified — upload your screenshot from the popup and we switch it on.
      </p>
    </div>
  );
}
