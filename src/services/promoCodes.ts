import { apiFetch } from '../config/api';
import { loadAppSession } from './appInviteAuth';

export type PromoCodeRow = {
  id: string;
  code: string;
  label: string;
  grantDays: number;
  planId: 'monthly' | 'quarterly' | 'yearly' | null;
  maxRedemptions: number | null;
  usedCount: number;
  expiresAt: string | null;
  enabled: boolean;
  createdAt: string;
  createdBy: string;
};

export type PromoRedeemResult = {
  ok: boolean;
  message: string;
  promo?: { code: string; label: string; grantDays: number; planId: string | null };
};

function authHeaders(adminEmail?: string | null, adminPassword?: string | null): HeadersInit {
  const session = loadAppSession();
  if (session?.token && (session.user.role === 'admin' || session.user.role === 'subadmin')) {
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

function sessionHeaders(): HeadersInit {
  const session = loadAppSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

async function readJson(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || fallback);
  return data;
}

export async function adminListPromoCodes(
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<PromoCodeRow[]> {
  const res = await apiFetch('/api/app-auth/admin/promo-codes', {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = (await readJson(res, 'Could not load promo codes')) as { codes?: PromoCodeRow[] };
  return Array.isArray(data.codes) ? data.codes : [];
}

export async function adminCreatePromoCode(
  input: {
    code: string;
    label?: string;
    grantDays: number;
    planId?: string | null;
    maxRedemptions?: number | null;
    expiresAt?: string | null;
    enabled?: boolean;
  },
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<PromoCodeRow> {
  const res = await apiFetch('/api/app-auth/admin/promo-codes', {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(input),
  });
  const data = (await readJson(res, 'Could not create promo code')) as { code: PromoCodeRow };
  return data.code;
}

export async function adminUpdatePromoCode(
  id: string,
  patch: Partial<{
    code: string;
    label: string;
    grantDays: number;
    planId: string | null;
    maxRedemptions: number | null;
    expiresAt: string | null;
    enabled: boolean;
  }>,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<PromoCodeRow> {
  const res = await apiFetch(`/api/app-auth/admin/promo-codes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(patch),
  });
  const data = (await readJson(res, 'Could not update promo code')) as { code: PromoCodeRow };
  return data.code;
}

export async function adminDeletePromoCode(
  id: string,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<void> {
  const res = await apiFetch(`/api/app-auth/admin/promo-codes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(adminEmail, adminPassword),
  });
  await readJson(res, 'Could not delete promo code');
}

/** Signed-in member redeems a promo for access days. */
export async function redeemPromoCode(code: string): Promise<PromoRedeemResult> {
  const res = await apiFetch('/api/app-auth/promo-codes/redeem', {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify({ code }),
  });
  return (await readJson(res, 'Could not redeem promo code')) as PromoRedeemResult;
}
