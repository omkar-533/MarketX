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
  'Master AI copilot for market questions',
  'Indicators library — browse, preview, copy code',
  'Trading journal with P&L analytics',
  'Invite-only workspace access',
  'Priority support on WhatsApp',
] as const;

export const PLANS: readonly Plan[] = [
  {
    id: 'trial',
    name: 'Free Trial',
    price: 0,
    period: `${TRIAL_DAYS} days free`,
    tagline: 'Full access for 3 days — see the desk before you pay a rupee.',
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
    tagline: 'Month-to-month access for traders who like to stay flexible.',
    cta: 'Choose monthly',
    note: 'Cancel anytime from profile',
  },
  {
    id: 'quarterly',
    name: '3 Months',
    price: 5999,
    period: 'per 3 months',
    equivalent: '≈ ₹2,000 / month',
    tagline: 'One quarter of committed screen time at a lower monthly rate.',
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
    tagline: 'The serious option — a full season of markets at the best rate.',
    badge: 'Best value',
    save: 'Save ₹20,989',
    cta: 'Choose yearly',
    note: 'Billed once for 12 months',
  },
] as const;

export function planById(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
