import { apiFetch } from '../config/api';
import { loadAppSession } from './appInviteAuth';

export type IndicatorItem = {
  id: string;
  title: string;
  description: string;
  /** Invite / share URL — only present when access + TV grant allow it. */
  link: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt?: string;
  imageUrl: string | null;
  /** Latest TV access request status for this user, if any. */
  tvAccessStatus?: 'pending' | 'granted' | 'dismissed' | null;
};

export type TvAccessStatusPayload = {
  ok: boolean;
  status: 'pending' | 'granted' | 'dismissed' | null;
  inviteUnlocked: boolean;
  inviteLink: string;
  request: {
    id: string;
    tradingViewId: string;
    status: 'pending' | 'granted' | 'dismissed';
    createdAt: string;
  } | null;
};

function sessionHeaders(): HeadersInit {
  const session = loadAppSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

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

async function readJson(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : fallback);
  }
  return data;
}

export async function listIndicators(): Promise<IndicatorItem[]> {
  const res = await apiFetch('/api/app-auth/indicators', { headers: sessionHeaders() });
  const data = await readJson(res, 'Could not load indicators');
  return (data.indicators || []) as IndicatorItem[];
}

export async function getIndicator(id: string): Promise<IndicatorItem> {
  const res = await apiFetch(`/api/app-auth/indicators/${encodeURIComponent(id)}`, {
    headers: sessionHeaders(),
  });
  const data = await readJson(res, 'Could not load indicator');
  return data.indicator as IndicatorItem;
}

export async function adminListIndicators(
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<IndicatorItem[]> {
  const res = await apiFetch('/api/app-auth/admin/indicators', {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await readJson(res, 'Could not load indicators');
  return (data.indicators || []) as IndicatorItem[];
}

export type IndicatorInput = {
  title: string;
  description: string;
  link: string;
  image?: string | null;
  sortOrder?: number;
  published?: boolean;
};

export async function adminCreateIndicator(
  input: IndicatorInput,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<IndicatorItem> {
  const res = await apiFetch('/api/app-auth/admin/indicators', {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(input),
  });
  const data = await readJson(res, 'Could not create indicator');
  return data.indicator as IndicatorItem;
}

export async function adminUpdateIndicator(
  id: string,
  input: Partial<IndicatorInput>,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<IndicatorItem> {
  const res = await apiFetch(`/api/app-auth/admin/indicators/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(input),
  });
  const data = await readJson(res, 'Could not update indicator');
  return data.indicator as IndicatorItem;
}

export async function adminDeleteIndicator(
  id: string,
  adminEmail?: string | null,
  adminPassword?: string | null,
): Promise<void> {
  const res = await apiFetch(`/api/app-auth/admin/indicators/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(adminEmail, adminPassword),
  });
  await readJson(res, 'Could not delete indicator');
}

/** Submit TradingView username for manual invite — admin Approves to unlock invite link. */
export async function submitTradingViewAccess(
  indicatorId: string,
  tradingViewId: string,
): Promise<{ ok: boolean; message: string; inviteLink: string; status: string | null }> {
  const res = await apiFetch(
    `/api/app-auth/indicators/${encodeURIComponent(indicatorId)}/tv-access`,
    {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify({ tradingViewId }),
    },
  );
  const data = await readJson(res, 'Could not submit TradingView ID');
  const request = data.request as { status?: string } | undefined;
  return {
    ok: true,
    message: typeof data.message === 'string' ? data.message : 'Submitted',
    inviteLink: typeof data.inviteLink === 'string' ? data.inviteLink : '',
    status: request?.status || null,
  };
}

/** Poll TV access / invite unlock status for an indicator. */
export async function getTradingViewAccessStatus(
  indicatorId: string,
): Promise<TvAccessStatusPayload> {
  const res = await apiFetch(
    `/api/app-auth/indicators/${encodeURIComponent(indicatorId)}/tv-access`,
    { headers: sessionHeaders() },
  );
  const data = await readJson(res, 'Could not load TradingView access status');
  return {
    ok: true,
    status: (data.status as TvAccessStatusPayload['status']) || null,
    inviteUnlocked: Boolean(data.inviteUnlocked),
    inviteLink: typeof data.inviteLink === 'string' ? data.inviteLink : '',
    request: (data.request as TvAccessStatusPayload['request']) || null,
  };
}
