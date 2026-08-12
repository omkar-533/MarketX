import { apiFetch } from '../config/api';
import { loadAppSession } from './appInviteAuth';

export type PromoCodeRow = {
  id: string;
  code: string;
  label: string;
  grantDays: number;
  planId: 'monthly' | 'quarterly' | 'yearly' | null;
  /** 0–100 — percent off the tagged plan (desk / signup display). */
  discountPercent: number;
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
  promo?: {
    code: string;
    label: string;
    grantDays: number;
    planId: string | null;
    discountPercent?: number;
  };
};

function authHeaders(adminEmail?: string | null, adminPassword?: string | null): HeadersInit {
  const session = loadAppSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.token && session.user.role === 'admin') {
    headers.Authorization = `Bearer ${session.token}`;
  }
  if (adminEmail && adminPassword) {
    headers['X-Admin-Email'] = adminEmail;
    headers['X-Admin-Password'] = adminPassword;
  }
  return headers;
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
  try {
    const res = await apiFetch(
      '/api/app-auth/admin/promo-codes',
      { headers: authHeaders(adminEmail, adminPassword) },
      { retries: 3, timeoutMs: 25_000 },
    );
    if (res.status === 404) return [];
    const data = (await readJson(res, 'Could not load promo codes')) as { codes?: PromoCodeRow[] };
    return Array.isArray(data.codes) ? data.codes : [];
  } catch {
    return [];
  }
}

export async function adminCreatePromoCode(
  input: {
    code: string;
    label?: string;
    grantDays: number;
    planId?: string | null;
    discountPercent?: number;
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
    discountPercent: number;
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

/** Public check — does not redeem the code. */
export async function verifyPromoCode(code: string): Promise<{
  ok: boolean;
  valid: boolean;
  promo?: {
    code: string;
    label: string | null;
    grantDays: number;
    planId: string | null;
    discountPercent?: number;
  };
  error?: string;
}> {
  const res = await apiFetch('/api/app-auth/promo-codes/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      valid: false,
      error: (data as { error?: string })?.error || 'Invalid promo code',
    };
  }
  return data as {
    ok: boolean;
    valid: boolean;
    promo?: {
      code: string;
      label: string | null;
      grantDays: number;
      planId: string | null;
      discountPercent?: number;
    };
  };
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
