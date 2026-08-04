import { useEffect, useState, type MouseEvent } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { ArrowRight, Check, Sparkles, Zap } from 'lucide-react';
import type { Plan, PlanId } from '../../constants/plans';
import { usePlansCatalog } from '../../hooks/usePlansCatalog';
import { fetchPublicAccessPopup, type AccessPopup } from '../../services/appInviteAuth';
import AccessUnlockPanel from '../access/AccessUnlockPanel';
import { Counter, EASE, GradientLine, Reveal, Words } from './scrollFx';

type AuthPricingProps = {
  onStartTrial: () => void;
  onChoosePlan: (plan: PlanId) => void;
  onSignIn?: () => void;
};

function PlanCard({
  plan,
  index,
  trialDays,
  onSelect,
}: {
  plan: Plan;
  index: number;
  trialDays: number;
  onSelect: () => void;
}) {
  const reduced = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, { stiffness: 240, damping: 20 });
  const rotateY = useSpring(rawY, { stiffness: 240, damping: 20 });

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
      initial={{ opacity: 0, y: 56, rotateX: 14, filter: 'blur(9px)' }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-8% 0px -8% 0px' }}
      transition={{ delay: 0.09 * index, duration: 0.85, ease: EASE }}
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
                <span className="plan__period">for {trialDays} days</span>
              </>
            ) : (
              <>
                <span className="plan__amount">
                  <i aria-hidden>₹</i>
                  <Counter to={plan.price} duration={1.4} />
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
            <p className="plan__meta plan__meta--empty">Wolf AI · Journal</p>
          )}

          <p className="plan__tagline">{plan.tagline}</p>

          <button
            type="button"
            className={`plan__cta ${plan.featured ? 'plan__cta--solid' : ''}`}
            onClick={onSelect}
          >
            {plan.featured ? <Zap className="w-4 h-4" aria-hidden /> : null}
            {plan.cta}
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
          <p className="plan__note">{plan.note}</p>

          <ul className="plan__features">
            {plan.features.map((feature, i) => (
              <motion.li
                key={feature}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-6% 0px -6% 0px' }}
                transition={{ delay: 0.09 * index + 0.24 + i * 0.05, duration: 0.5, ease: EASE }}
              >
                <span className="plan__tick" aria-hidden="true">
                  <Check className="w-3 h-3" />
                </span>
                {feature}
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.article>
    </motion.div>
  );
}

/** Pricing wall — catalog from admin (fallback to defaults) + unlock path. */
export default function AuthPricing({ onStartTrial, onChoosePlan, onSignIn }: AuthPricingProps) {
  const { plans, trialDays } = usePlansCatalog();
  const [popup, setPopup] = useState<AccessPopup | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchPublicAccessPopup();
      if (!cancelled) setPopup(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="pricing" className="auth-lux__pricing">
      <div className="auth-lux__pricing-inner">
        <div className="auth-lux__features-head">
          <Reveal y={24} blur={false}>
            <p className="auth-lux__kicker">Pricing</p>
          </Reveal>
          <h2 className="auth-lux__section-title">
            <Words text="Same full desk," />
            <br />
            <GradientLine text="your choice of term" delay={0.22} />
          </h2>
          <Reveal delay={0.26} y={22}>
            <p className="auth-lux__section-sub">
              Features grow with each plan. Pick the term that matches how deep you want Wolf AI and
              Journal — or unlock free after trial with desk verification.
            </p>
          </Reveal>
        </div>

        <div className="auth-lux__plans">
          {plans.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={i}
              trialDays={trialDays}
              onSelect={() => (plan.id === 'trial' ? onStartTrial() : onChoosePlan(plan.id))}
            />
          ))}
        </div>

        {popup?.enabled !== false ? (
          <div className="auth-lux__unlock" id="unlock">
            <Reveal y={24} blur={false}>
              <div className="auth-lux__unlock-grid">
                <div className="auth-lux__unlock-copy">
                  <p className="auth-lux__kicker">After free trial</p>
                  <h3>Unlock with desk approval</h3>
                  <p>
                    When your free trial ends, follow the same steps we show in-app — open the
                    referral link, take a small F&amp;O trade, then submit demat + screenshot after
                    sign-in. The desk verifies and unlocks premium access.
                  </p>
                </div>
                <AccessUnlockPanel
                  className="access-unlock--inline"
                  popup={popup}
                  guestMode
                  onGuestStartTrial={onStartTrial}
                  onGuestSignIn={onSignIn}
                />
              </div>
            </Reveal>
          </div>
        ) : null}

        <Reveal delay={0.2} y={18} blur={false}>
          <p className="auth-lux__plans-foot">
            Prices in INR, inclusive of taxes. Paid plans are activated by the desk after signup —
            your trial keeps running until then. Free unlock uses the verification form above after
            you sign in.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
