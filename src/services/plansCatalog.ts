import { apiFetch } from '../config/api';
import { DEFAULT_PLANS, TRIAL_DAYS, type Plan, type PlanId } from '../constants/plans';
import { loadAppSession } from './appInviteAuth';

export type SubscriptionCatalog = {
  trialDays: number;
  plans: Plan[];
  /** When true, signup creates the account without SMS OTP. */
  skipOtp?: boolean;
};

export type AdminSubscriptionCatalog = SubscriptionCatalog & {
  defaults?: SubscriptionCatalog;
};

function authHeaders(adminEmail?: string | null, adminPassword?: string | null): HeadersInit {
  const session = loadAppSession();
  if (session?.token && session.user.role === 'admin') {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    };
  }
  if (adminEmail && adminPassword) {
    return {
      'Content-Type': 'application/json',
      'X-Admin-Email': adminEmail,
      'X-Admin-Password': adminPassword,
    };
  }
  return { 'Content-Type': 'application/json' };
}

function normalizePlan(raw: Partial<Plan> | null | undefined, fallback: Plan): Plan {
  const price = Number(raw?.price);
  const features = Array.isArray(raw?.features)
    ? raw!.features.map((f) => String(f || '').trim()).filter(Boolean)
    : [...fallback.features];
  return {
    id: fallback.id,
    name: String(raw?.name || fallback.name).trim() || fallback.name,
    price: Number.isFinite(price) && price >= 0 ? Math.round(price) : fallback.price,
    period: String(raw?.period || fallback.period).trim() || fallback.period,
    equivalent: raw?.equivalent ? String(raw.equivalent).trim() : fallback.equivalent,
    tagline: String(raw?.tagline || fallback.tagline).trim() || fallback.tagline,
    badge: raw?.badge ? String(raw.badge).trim() : undefined,
    save: raw?.save ? String(raw.save).trim() : undefined,
    cta: String(raw?.cta || fallback.cta).trim() || fallback.cta,
    note: String(raw?.note || fallback.note).trim() || fallback.note,
    featured: Boolean(raw?.featured),
    enabled: raw?.enabled !== false,
    features: features.length ? features : [...fallback.features],
  };
}

function normalizeCatalog(data: Partial<SubscriptionCatalog> | null | undefined): SubscriptionCatalog {
  const byId = new Map((data?.plans || []).map((p) => [p.id, p]));
  const plans = DEFAULT_PLANS.map((def) => normalizePlan(byId.get(def.id), { ...def }));
  const days = Number(data?.trialDays);
  return {
    trialDays: Number.isFinite(days) && days > 0 ? Math.round(days) : TRIAL_DAYS,
    plans,
    skipOtp: data?.skipOtp === true,
  };
}

/** Public pricing — enabled plans only. Falls back to defaults on network error. */
export async function fetchPublicPlans(): Promise<SubscriptionCatalog> {
  try {
    const res = await apiFetch('/api/app-auth/plans');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Could not load plans');
    const catalog = normalizeCatalog(data);
    return {
      trialDays: catalog.trialDays,
      plans: catalog.plans.filter((p) => p.enabled !== false),
      skipOtp: catalog.skipOtp,
    };
  } catch {
    return {
      trialDays: TRIAL_DAYS,
      plans: DEFAULT_PLANS.filter((p) => p.enabled !== false).map((p) => ({ ...p, features: [...p.features] })),
      // Match current prod until Twilio is fixed — avoid flashing OTP copy on load/error.
      skipOtp: true,
    };
  }
}

export async function adminGetPlans(
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<AdminSubscriptionCatalog> {
  const res = await apiFetch('/api/app-auth/admin/plans', {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not load plans');
  const catalog = normalizeCatalog(data);
  return {
    ...catalog,
    defaults: data.defaults ? normalizeCatalog(data.defaults) : undefined,
  };
}

export async function adminSavePlans(
  catalog: SubscriptionCatalog,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<SubscriptionCatalog> {
  const res = await apiFetch('/api/app-auth/admin/plans', {
    method: 'PUT',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(catalog),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not save plans');
  return normalizeCatalog(data);
}

export function planFromCatalog(id: PlanId, plans: readonly Plan[]): Plan {
  return plans.find((p) => p.id === id) ?? plans[0] ?? { ...DEFAULT_PLANS[0], features: [...DEFAULT_PLANS[0].features] };
}
