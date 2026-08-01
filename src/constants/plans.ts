/** Subscription plans shown on the landing page and in-app. Defaults until admin overrides via API. */

export type PlanId = 'trial' | 'monthly' | 'quarterly' | 'yearly';

export type Plan = {
  id: PlanId;
  name: string;
  /** Amount in INR — 0 for the trial. */
  price: number;
  period: string;
  /** Shown under the price, e.g. effective monthly cost. */
  equivalent?: string;
  tagline: string;
  badge?: string;
  save?: string;
  cta: string;
  note: string;
  featured?: boolean;
  /** When false, plan is hidden from public pricing. */
  enabled?: boolean;
  /** Feature bullets for this plan only — higher price = more included. */
  features: readonly string[];
};

export const TRIAL_DAYS = 3;

/** @deprecated Prefer plan.features — kept for any leftover imports. */
export const PLAN_FEATURES = [
  'Wolf AI — ask markets, get clear trade context',
  'Indicators library — browse & open invite links',
  'Trading Journal — log trades, review P&L & discipline',
] as const;

export const DEFAULT_PLANS: readonly Plan[] = [
  {
    id: 'trial',
    name: 'Free Trial',
    price: 0,
    period: `${TRIAL_DAYS} days free`,
    tagline: `Try the desk for ${TRIAL_DAYS} days — core Wolf AI, Indicators browse, and Journal basics.`,
    badge: 'Start here',
    cta: 'Start 3-day free trial',
    note: 'No card required · instant access',
    featured: true,
    enabled: true,
    features: [
      'Wolf AI — limited daily questions',
      'Indicators — browse & open invite links',
      'Trading Journal — log up to 20 trades',
      `${TRIAL_DAYS}-day access · no card needed`,
      'Email support only',
    ],
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: 2999,
    period: 'per month',
    tagline: 'Full access to Wolf AI, Indicators, and Trading Journal — cancel anytime.',
    cta: 'Choose monthly',
    note: 'Cancel anytime from profile',
    enabled: true,
    features: [
      'Wolf AI — full copilot access',
      'Indicators — browse & open invite links',
      'Trading Journal — unlimited trade logs',
      'All 3 modules unlocked',
      'Standard WhatsApp support',
    ],
  },
  {
    id: 'quarterly',
    name: '3 Months',
    price: 5999,
    period: 'per 3 months',
    equivalent: '≈ ₹2,000 / month',
    tagline: 'Better rate for 3 months — deeper AI usage, full Indicators library, and journal analytics.',
    badge: 'Best balance',
    save: 'Save ₹2,998',
    cta: 'Choose 3 months',
    note: 'Billed once for 3 months',
    enabled: true,
    features: [
      'Everything in Monthly',
      'Wolf AI — higher daily limit',
      'Indicators — full library + new drops first',
      'Trading Journal — P&L analytics & tags',
      'Priority WhatsApp support',
    ],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: 14999,
    period: 'per year',
    equivalent: '≈ ₹1,250 / month',
    tagline: 'Best value year — max Wolf AI, full Indicators vault, and advanced journal reviews.',
    badge: 'Best value',
    save: 'Save ₹20,989',
    cta: 'Choose yearly',
    note: 'Billed once for 12 months',
    enabled: true,
    features: [
      'Everything in 3 Months',
      'Wolf AI — highest limits + priority replies',
      'Indicators — full vault + priority invite links',
      'Trading Journal — advanced reviews & exports',
      'VIP WhatsApp support · fastest response',
    ],
  },
] as const;

/** @deprecated Prefer DEFAULT_PLANS / fetchPublicPlans — alias for backwards compat. */
export const PLANS = DEFAULT_PLANS;

export function planById(id: PlanId, plans: readonly Plan[] = DEFAULT_PLANS): Plan {
  return plans.find((p) => p.id === id) ?? plans[0] ?? DEFAULT_PLANS[0];
}

export function featuresForPlan(id: PlanId, plans: readonly Plan[] = DEFAULT_PLANS): readonly string[] {
  return planById(id, plans).features;
}
