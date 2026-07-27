import { apiFetch } from '../config/api';
import { loadAppSession } from './appInviteAuth';

export type IndicatorItem = {
  id: string;
  title: string;
  description: string;
  /** Invite / share URL — only present when access is unlocked. */
  link: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt?: string;
  imageUrl: string | null;
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
