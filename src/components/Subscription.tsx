import { motion } from 'framer-motion';
import {
  Check,
  Crown,
  Hourglass,
  MessageCircle,
  ShieldCheck,
  Star,
} from 'lucide-react';
import type { User } from '../hooks/useAuth';
import { usePlansCatalog } from '../hooks/usePlansCatalog';
import type { AccessPopup, AccessState } from '../services/appInviteAuth';
import AccessProofUpload from './access/AccessProofUpload';

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
      ? 'Your free trial has ended — fill the form below. We respond within 24 hours.'
      : 'Your access has expired — fill the form below. We respond within 24 hours.';
  }
  if (access.daysLeft === null) return 'You have lifetime access. Nothing to renew.';
  if (access.isTrial) {
    return access.daysLeft <= 1
      ? `Your free trial ends in ${access.hoursLeft ?? 0} hours.`
      : `${access.daysLeft} days left in your free trial.`;
  }
  return `${access.daysLeft} days left on your current access.`;
}

/** In-app pricing — same plans and prices as the landing page. */
export default function Subscription({
  user,
  access,
  popup,
  onAccessSubmitted,
}: SubscriptionProps) {
  const { plans, trialDays } = usePlansCatalog();
  const whatsapp = popup?.whatsapp?.trim();
  const isTrialUser = access?.isTrial ?? Boolean(user?.trialEndsAt);
  const needsForm = Boolean(access && !access.unlocked && access.status !== 'blocked');

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[#d4af37] flex items-center justify-center gap-2">
          <Crown className="w-5 h-5" />
          Subscription Plans
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Every plan covers Wolf AI and Trading Journal — higher plans unlock more.
        </p>
      </div>

      <div className="w-full flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-[#1a1f2e] bg-[#0b0e17]">
        <Hourglass className="w-4 h-4 text-[#d4af37] shrink-0" />
        <p className="text-xs text-slate-300">{statusLine(access)}</p>
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1a1f2e] text-slate-300 text-[11px] font-bold hover:border-[#d4af37]/30"
          >
            <MessageCircle className="w-3 h-3" />
            Talk to the desk
          </a>
        ) : null}
      </div>

      {needsForm ? (
        <div className="w-full rounded-xl border border-[#1a1f2e] bg-[#0b0e17] p-4 space-y-2">
          <p className="text-sm font-bold text-[#d4af37]">
            {popup?.title?.trim() || 'Request access'}
          </p>
          <p className="text-[11px] text-slate-500">
            {popup?.message?.trim() ||
              'Fill your name, registered mobile, demat account number, and upload your first F&O trade screenshot. Our team verifies within 24 hours. TradingView ID is not required for this unlock.'}
          </p>
          <AccessProofUpload
            request={access?.request ?? null}
            onSubmitted={onAccessSubmitted || (() => undefined)}
            defaults={{
              name: user?.name,
              phone: user?.phone,
              email: user?.email,
            }}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 w-full">
        {plans.map((plan, idx) => {
          const isTrial = plan.id === 'trial';
          return (
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
                    {plan.price === 0 ? 'Free' : `₹${plan.price.toLocaleString('en-IN')}`}
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
                {isTrial ? (
                  <div className="w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-4 h-4" />
                    {isTrialUser ? 'Your current trial' : `${trialDays} days, already used`}
                  </div>
                ) : whatsapp ? (
                  <a
                    href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      plan.featured
                        ? 'bg-[#d4af37] text-[#0b0e17] hover:bg-[#b8941f]'
                        : 'bg-[#121520] text-slate-300 border border-[#1a1f2e] hover:border-[#d4af37]/30'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {plan.cta}
                  </a>
                ) : (
                  <div className="w-full py-2.5 rounded-lg text-[11px] text-slate-500 text-center border border-[#1a1f2e]">
                    Contact the desk to activate
                  </div>
                )}
                <p className="text-[10px] text-slate-600 text-center mt-2">{plan.note}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-600 text-center max-w-2xl mx-auto">
        Prices in INR, inclusive of taxes. Paid access is activated by the desk after your account
        is verified — upload your screenshot from the popup and we switch it on.
      </p>
    </div>
  );
}
