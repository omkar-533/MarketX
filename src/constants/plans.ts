/** Subscription plans shown on the landing page. Every plan unlocks the same workspace. */

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
};

export const TRIAL_DAYS = 3;

/** Same feature set on every plan — only the billing duration changes. */
export const PLAN_FEATURES = [
  'Master AI — ask markets, get clear trade context',
  'Indicators library — browse, preview & copy code',
  'Trading Journal — log trades, review P&L & discipline',
  'All three modules unlocked on every plan',
  'WhatsApp support when you need a hand',
] as const;

export const PLANS: readonly Plan[] = [
  {
    id: 'trial',
    name: 'Free Trial',
    price: 0,
    period: `${TRIAL_DAYS} days free`,
    tagline:
      'Try Master AI, Indicators, and Trading Journal for 3 days — full desk, zero payment.',
    badge: 'Start here',
    cta: 'Start 3-day free trial',
    note: 'No card required · instant access',
    featured: true,
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: 2999,
    period: 'per month',
    tagline:
      'Flexible month access to Master AI, the Indicators library, and your Trading Journal.',
    cta: 'Choose monthly',
    note: 'Cancel anytime from profile',
  },
  {
    id: 'quarterly',
    name: '3 Months',
    price: 5999,
    period: 'per 3 months',
    equivalent: '≈ ₹2,000 / month',
    tagline:
      'Three months of the full desk — AI answers, indicator codes, and journal reviews at a better rate.',
    badge: 'Best balance',
    save: 'Save ₹2,998',
    cta: 'Choose 3 months',
    note: 'Billed once for 3 months',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: 14999,
    period: 'per year',
    equivalent: '≈ ₹1,250 / month',
    tagline:
      'A full year with Master AI, Indicators, and Trading Journal — best value for serious traders.',
    badge: 'Best value',
    save: 'Save ₹20,989',
    cta: 'Choose yearly',
    note: 'Billed once for 12 months',
  },
] as const;

export function planById(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
