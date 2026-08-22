import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Crown,
  Hourglass,
  Loader2,
  Star,
  Ticket,
} from 'lucide-react';
import type { User } from '../hooks/useAuth';
import { usePlansCatalog } from '../hooks/usePlansCatalog';
import type { AccessPopup, AccessState } from '../services/appInviteAuth';
import { redeemPromoCode } from '../services/promoCodes';
import AccessUnlockPanel from './access/AccessUnlockPanel';
import { PlanContactActions, PlanContactModal } from './PlanContactActions';
import { SHOW_INDICATORS, SHOW_PAPER_TRADING } from '../constants/featureFlags';

interface SubscriptionProps {
  user: User | null;
  access?: AccessState | null;
  popup?: AccessPopup | null;
  onAccessSubmitted?: () => unknown | Promise<unknown>;
}

function statusLine(access: AccessState | null | undefined) {
  if (!access) return 'Your plan is managed by the desk.';
  if (access.status === 'blocked') return 'Your access is paused — contact the desk.';
  if (!access.unlocked) {
    return access.reason === 'trial_expired'
      ? 'Your access has ended — follow the unlock steps below or contact us on WhatsApp.'
      : 'Your access has expired — follow the unlock steps below or contact us on WhatsApp.';
  }
  if (access.daysLeft === null) return 'You have lifetime access. Nothing to renew.';
  if (access.isTrial) {
    return access.daysLeft <= 1
      ? `Access ends in ${access.hoursLeft ?? 0} hours — renew via Call / WhatsApp below.`
      : `${access.daysLeft} days left on your access — renew anytime via Call / WhatsApp.`;
  }
  return `${access.daysLeft} days left on your current access.`;
}

/** In-app pricing — paid plans + Call / WhatsApp activation (no payment gateway yet). */
export default function Subscription({
  user,
  access,
  popup,
  onAccessSubmitted,
}: SubscriptionProps) {
  const { plans } = usePlansCatalog();
  const showUnlock = Boolean(popup && popup.enabled !== false && access?.status !== 'blocked');
  const [buyPlan, setBuyPlan] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [promoOk, setPromoOk] = useState('');

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      window.scrollTo(0, 0);
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const applyPromo = async () => {
    setPromoError('');
    setPromoOk('');
    if (!user) {
      setPromoError('Sign in first to redeem a promo code.');
      return;
    }
    if (!promoInput.trim()) {
      setPromoError('Enter a promo code.');
      return;
    }
    setPromoBusy(true);
    try {
      const result = await redeemPromoCode(promoInput.trim());
      setPromoOk(result.message || 'Promo applied.');
      setPromoInput('');
      await onAccessSubmitted?.();
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Could not redeem promo code');
    } finally {
      setPromoBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[#d4af37] flex items-center justify-center gap-2">
          <Crown className="w-5 h-5" />
          Subscription Plans
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Every plan covers Wolf AI
          {SHOW_INDICATORS ? ', Indicators' : ''}
          {SHOW_PAPER_TRADING ? ', Paper Trading' : ''}
          , and Trading Journal. Buy via Call or WhatsApp — payment gateway coming soon.
        </p>
      </div>

      <div className="w-full flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-[#1a1f2e] bg-[#0b0e17]">
        <Hourglass className="w-4 h-4 text-[#d4af37] shrink-0" />
        <p className="text-xs text-slate-300">{statusLine(access)}</p>
      </div>

      <div className="w-full rounded-xl border border-[#1a1f2e] bg-[#0b0e17] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#d4af37]">
          <Ticket className="w-4 h-4" />
          Have a promo code?
        </div>
        <p className="text-[11px] text-slate-500">
          Enter the code from the desk to unlock access instantly.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            placeholder="XXXXXX"
            className="flex-1 px-3 py-2.5 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200 tracking-wider focus:outline-none focus:border-[#d4af37]/40"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void applyPromo();
            }}
          />
          <button
            type="button"
            disabled={promoBusy}
            onClick={() => void applyPromo()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#d4af37] text-[#0b0e17] text-xs font-bold disabled:opacity-50"
          >
            {promoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Redeem
          </button>
        </div>
        {promoError ? <p className="text-xs text-rose-400">{promoError}</p> : null}
        {promoOk ? <p className="text-xs text-emerald-400">{promoOk}</p> : null}
      </div>

      {showUnlock ? (
        <AccessUnlockPanel
          className="access-unlock--inline"
          popup={popup ?? null}
          request={access?.request ?? null}
          onSubmitted={onAccessSubmitted || (() => undefined)}
          defaults={{
            name: user?.name,
            phone: user?.phone,
            email: user?.email,
          }}
        />
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
        {plans.map((plan, idx) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className={`relative bg-[#0b0e17] border rounded-xl p-5 flex flex-col ${
              plan.featured
                ? 'border-[#d4af37]/40 shadow-lg shadow-[#d4af37]/5'
                : 'border-[#1a1f2e]'
            }`}
          >
            {plan.badge ? (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#d4af37] text-[#0b0e17] text-[10px] font-bold rounded-full flex items-center gap-1 whitespace-nowrap">
                <Star className="w-3 h-3" />
                {plan.badge}
              </div>
            ) : null}

            <div className="text-center mb-4 mt-1">
              <div className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                {plan.name}
              </div>
              <div className="mt-2">
                <span className="text-3xl font-bold text-[#d4af37]">
                  {`₹${plan.price.toLocaleString('en-IN')}`}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{plan.period}</div>
              {plan.equivalent ? (
                <div className="text-[10px] text-emerald-400 mt-0.5">{plan.equivalent}</div>
              ) : null}
              {plan.save ? (
                <div className="text-[10px] text-emerald-400 mt-0.5">{plan.save}</div>
              ) : null}
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed mb-4">{plan.tagline}</p>

            <ul className="space-y-2 mb-5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-[11px] text-slate-400">
                  <Check
                    className={`w-3.5 h-3.5 mt-px shrink-0 ${plan.featured ? 'text-[#d4af37]' : 'text-emerald-400'}`}
                  />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              <button
                type="button"
                onClick={() => setBuyPlan(plan.name)}
                className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  plan.featured
                    ? 'bg-[#d4af37] text-[#0b0e17] hover:bg-[#b8941f]'
                    : 'bg-[#121520] text-slate-300 border border-[#1a1f2e] hover:border-[#d4af37]/30'
                }`}
              >
                {plan.cta}
              </button>
              <p className="text-[10px] text-slate-600 text-center mt-2">{plan.note}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <PlanContactActions />

      <p className="text-[11px] text-slate-600 text-center max-w-2xl mx-auto">
        Prices in INR, inclusive of taxes. Paid access is activated by the desk after Call or
        WhatsApp — or use the unlock form above with demat + F&amp;O screenshot.
      </p>

      <PlanContactModal
        open={Boolean(buyPlan)}
        planName={buyPlan || undefined}
        onClose={() => setBuyPlan(null)}
      />
    </div>
  );
}
