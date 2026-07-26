import { apiFetch } from '../config/api';
import type { User } from '../hooks/useAuth';

const APP_SESSION_KEY = 'tradeflow_app_session';

export type AppSession = {
  token: string;
  user: User;
};

export function loadAppSession(): AppSession | null {
  try {
    const raw = localStorage.getItem(APP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppSession;
    if (!parsed?.token || !parsed?.user?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAppSession(session: AppSession) {
  localStorage.setItem(APP_SESSION_KEY, JSON.stringify(session));
}

export function clearAppSession() {
  localStorage.removeItem(APP_SESSION_KEY);
}

export async function loginWithInvite(email: string, password: string): Promise<AppSession> {
  const res = await apiFetch('/api/app-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Invalid email or password');
  }
  const session: AppSession = {
    token: String(data.token),
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role === 'admin' ? 'admin' : 'user',
      plan: data.user.plan === 'premium' || data.user.plan === 'pro' ? data.user.plan : 'free',
      verified: true,
      createdAt: data.user.createdAt || new Date().toISOString(),
    },
  };
  saveAppSession(session);
  return session;
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

export type InviteUserInput = {
  name: string;
  email: string;
  password: string;
  plan?: 'free' | 'pro' | 'premium';
};

export type InviteUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  active: boolean;
  createdAt: string;
};

export async function adminListUsers(adminEmail?: string | null, adminPassword?: string | null) {
  const res = await apiFetch('/api/app-auth/admin/users', {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not load users');
  return (data.users || []) as InviteUserRow[];
}

export async function adminCreateUser(
  input: InviteUserInput,
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch('/api/app-auth/admin/users', {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not create user');
  return data as { user: InviteUserRow; message?: string };
}

export async function adminSetUserActive(
  id: string,
  active: boolean,
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch(`/api/app-auth/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify({ active }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not update user');
  return data.user as InviteUserRow;
}

export async function adminDeleteUser(
  id: string,
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch(`/api/app-auth/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not delete user');
  return true;
}
