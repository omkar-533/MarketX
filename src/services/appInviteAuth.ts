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

export type AccessStatus = 'trial' | 'granted' | 'locked' | 'blocked';

export type AccessRequestSummary = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  createdAt: string;
  adminNote: string | null;
};

export type AccessState = {
  status: AccessStatus;
  unlocked: boolean;
  isTrial: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
  hoursLeft: number | null;
  reason: string | null;
  trialDays: number;
  request: AccessRequestSummary | null;
};

export type AccessPopup = {
  enabled: boolean;
  title: string;
  message: string;
  url: string;
  buttonLabel: string;
  whatsapp: string;
};

export type AccessSnapshot = {
  access: AccessState;
  popup: AccessPopup;
};

export type OtpChallenge = {
  phone: string;
  expiresInSec: number;
  channel: 'sms';
  devMode: boolean;
  /** Only present when Twilio is not configured, so testing still works. */
  devCode: string | null;
};

function toOtpChallenge(data: Record<string, unknown>): OtpChallenge {
  return {
    phone: String(data.phone || ''),
    expiresInSec: Number(data.expiresInSec) || 600,
    channel: 'sms',
    devMode: data.devMode === true,
    devCode: data.devCode ? String(data.devCode) : null,
  };
}

function toSession(data: {
  token?: unknown;
  user?: Record<string, unknown>;
}): AppSession {
  const raw = (data.user ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (value == null ? null : String(value));
  return {
    token: String(data.token),
    user: {
      id: String(raw.id),
      name: String(raw.name),
      email: String(raw.email),
      role: raw.role === 'admin' ? 'admin' : 'user',
      plan: raw.plan === 'premium' || raw.plan === 'pro' ? raw.plan : 'free',
      verified: true,
      createdAt: str(raw.createdAt) || new Date().toISOString(),
      trialEndsAt: str(raw.trialEndsAt),
      phone: str(raw.phone) ?? undefined,
      phoneVerified: raw.phoneVerified === true,
      accessStatus: (str(raw.accessStatus) as AccessStatus | null) ?? 'trial',
      accessExpiresAt: str(raw.accessExpiresAt),
    },
  };
}

function snapshotOf(data: Record<string, unknown>): AccessSnapshot | null {
  if (!data?.access) return null;
  return { access: data.access as AccessState, popup: data.popup as AccessPopup };
}

async function readJson(res: Response, fallbackError: string) {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : fallbackError);
  }
  return data;
}

export async function loginWithInvite(
  identifier: string,
  password: string,
): Promise<AppSession & { snapshot: AccessSnapshot | null }> {
  const res = await apiFetch('/api/app-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await readJson(res, 'Invalid mobile number or password');
  const session = toSession(data);
  saveAppSession(session);
  return { ...session, snapshot: snapshotOf(data) };
}

/** Step 1 of sign-up: nothing is created yet, an OTP goes to the mobile number. */
export async function startSignup(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<OtpChallenge> {
  const res = await apiFetch('/api/app-auth/signup/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await readJson(res, 'Could not send the OTP');
  return toOtpChallenge(data);
}

export async function resendSignupOtp(phone: string): Promise<OtpChallenge> {
  const res = await apiFetch('/api/app-auth/signup/resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const data = await readJson(res, 'Could not resend the OTP');
  return toOtpChallenge(data);
}

/** Step 2: OTP proves the number, the account is created with the free trial live. */
export async function verifySignupOtp(
  phone: string,
  code: string,
): Promise<AppSession & { snapshot: AccessSnapshot | null }> {
  const res = await apiFetch('/api/app-auth/signup/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const data = await readJson(res, 'Could not verify the OTP');
  const session = toSession(data);
  saveAppSession(session);
  return { ...session, snapshot: snapshotOf(data) };
}

/* ────────────────────────── forgot password ────────────────────────── */

export type ResetChallenge = {
  /** Masked on the server — the full number is never sent back to the browser. */
  phoneMasked: string;
  expiresInSec: number;
  channel: 'sms';
  devMode: boolean;
  devCode: string | null;
};

function toResetChallenge(data: Record<string, unknown>): ResetChallenge {
  return {
    phoneMasked: String(data.phoneMasked || ''),
    expiresInSec: Number(data.expiresInSec) || 600,
    channel: 'sms',
    devMode: data.devMode === true,
    devCode: data.devCode ? String(data.devCode) : null,
  };
}

/** Step 1: texts a reset code to the mobile number on file for this login. */
export async function startPasswordReset(identifier: string): Promise<ResetChallenge> {
  const res = await apiFetch('/api/app-auth/password/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  return toResetChallenge(await readJson(res, 'Could not send the reset code'));
}

export async function resendPasswordResetOtp(identifier: string): Promise<ResetChallenge> {
  const res = await apiFetch('/api/app-auth/password/resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  return toResetChallenge(await readJson(res, 'Could not resend the reset code'));
}

/** Step 2: the code sets the new password and signs the user straight in. */
export async function completePasswordReset(
  identifier: string,
  code: string,
  password: string,
): Promise<AppSession & { snapshot: AccessSnapshot | null }> {
  const res = await apiFetch('/api/app-auth/password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, code, password }),
  });
  const data = await readJson(res, 'Could not reset the password');
  const session = toSession(data);
  saveAppSession(session);
  return { ...session, snapshot: snapshotOf(data) };
}

function sessionHeaders(): HeadersInit {
  const session = loadAppSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

/** Live gate state — the stored token is never trusted for access decisions. */
export async function fetchAccessState(): Promise<AccessSnapshot | null> {
  const session = loadAppSession();
  if (!session?.token) return null;

  const res = await apiFetch('/api/app-auth/access', { headers: sessionHeaders() });
  if (res.status === 401) {
    clearAppSession();
    return null;
  }
  const data = await readJson(res, 'Could not load your access status');

  const stored = loadAppSession();
  if (stored && data.user) {
    saveAppSession({ ...stored, user: toSession({ token: stored.token, user: data.user as Record<string, unknown> }).user });
  }
  return snapshotOf(data);
}

export async function submitAccessRequest(input: {
  fullName: string;
  phone: string;
  tradingViewId: string;
  email?: string;
  message?: string;
  screenshot?: string;
}) {
  const note = [
    `TradingView ID: ${input.tradingViewId.trim()}`,
    input.message?.trim() ? `Additional details: ${input.message.trim()}` : null,
    `Name: ${input.fullName.trim()}`,
    `Phone: ${input.phone.trim()}`,
    input.email?.trim() ? `Email: ${input.email.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await apiFetch('/api/app-auth/access/request', {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify({
      fullName: input.fullName,
      phone: input.phone,
      tradingViewId: input.tradingViewId,
      email: input.email || undefined,
      message: input.message || undefined,
      // Backward compatible with older API builds that only read note/screenshot.
      note,
      screenshot: input.screenshot || undefined,
    }),
  });
  const data = await readJson(res, 'Could not submit access request');
  return snapshotOf(data);
}

/** @deprecated Prefer submitAccessRequest with full member details. */
export async function submitAccessProof(screenshot: string, note?: string) {
  const res = await apiFetch('/api/app-auth/access/request', {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify({
      message: note || undefined,
      note: note || undefined,
      screenshot: screenshot || undefined,
    }),
  });
  const data = await readJson(res, 'Could not submit access request');
  return snapshotOf(data);
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
  phone?: string;
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
  phone?: string | null;
  phoneVerified?: boolean;
  accessStatus?: AccessStatus;
  accessExpiresAt?: string | null;
  firstLoginAt?: string | null;
  lastLoginAt?: string | null;
  loginCount?: number;
  adminSeenAt?: string | null;
  createdBy?: string | null;
  access?: Omit<AccessState, 'trialDays' | 'request'>;
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

/* ────────────────────────── admin: access control ────────────────────────── */

export type AdminAccessRequest = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  tradingViewId?: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  screenshotUrl: string | null;
};

export type AdminTvAccessRequest = {
  id: string;
  tradingViewId: string;
  indicatorId: string;
  indicatorTitle: string | null;
  userId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: 'pending' | 'granted' | 'dismissed';
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type AccessPopupSettings = AccessPopup & { defaultGrantDays: number };

/** `days` of 0 means lifetime access. */
export async function adminSetUserAccess(
  id: string,
  input: { status: AccessStatus; days?: number | null },
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch(`/api/app-auth/admin/users/${encodeURIComponent(id)}/access`, {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not update access');
  return data.user as InviteUserRow;
}

export async function adminVerifyUserPhone(
  id: string,
  phone: string | null,
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch(`/api/app-auth/admin/users/${encodeURIComponent(id)}/verify-phone`, {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify(phone ? { phone } : { verified: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not update mobile number');
  return data.user as InviteUserRow;
}

export async function adminMarkUsersSeen(
  ids: string[] | null,
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch('/api/app-auth/admin/users/seen', {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify({ ids }),
  });
  return res.ok;
}

export async function adminListAccessRequests(
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch(`/api/app-auth/admin/access-requests?status=${status}`, {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not load access requests');
  return {
    requests: (data.requests || []) as AdminAccessRequest[],
    pendingCount: Number(data.pendingCount || 0),
  };
}

export async function adminReviewAccessRequest(
  id: string,
  input: { approve: boolean; days?: number; adminNote?: string },
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const action = input.approve ? 'approve' : 'reject';
  const res = await apiFetch(
    `/api/app-auth/admin/access-requests/${encodeURIComponent(id)}/${action}`,
    {
      method: 'POST',
      headers: authHeaders(adminEmail, adminPassword),
      body: JSON.stringify({ days: input.days, adminNote: input.adminNote }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not ${action} the request`);
  return true;
}

export async function adminListTvAccessRequests(
  status: 'pending' | 'granted' | 'dismissed' | 'all' = 'pending',
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch(`/api/app-auth/admin/tv-access-requests?status=${status}`, {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not load TradingView access requests');
  return {
    requests: (data.requests || []) as AdminTvAccessRequest[],
    pendingCount: Number(data.pendingCount || 0),
    latestPending: (data.latestPending || null) as AdminTvAccessRequest | null,
  };
}

export async function adminReviewTvAccessRequest(
  id: string,
  action: 'granted' | 'dismiss',
  input: { adminNote?: string } = {},
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch(
    `/api/app-auth/admin/tv-access-requests/${encodeURIComponent(id)}/${action}`,
    {
      method: 'POST',
      headers: authHeaders(adminEmail, adminPassword),
      body: JSON.stringify({ adminNote: input.adminNote }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not ${action} the request`);
  return {
    ok: true as const,
    inviteLink: typeof data.inviteLink === 'string' ? data.inviteLink : '',
    request: (data.request || null) as AdminTvAccessRequest | null,
  };
}

export async function adminApproveAllTvAccessRequests(
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch('/api/app-auth/admin/tv-access-requests/approve-all', {
    method: 'POST',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not approve all requests');
  return { ok: true as const, updated: Number(data.updated || 0) };
}

export async function adminDeleteTvAccessRequest(
  id: string,
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch(`/api/app-auth/admin/tv-access-requests/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not delete the request');
  return true;
}

export async function adminGetSettings(
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch('/api/app-auth/admin/settings', {
    headers: authHeaders(adminEmail, adminPassword),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not load settings');
  return {
    popup: data.popup as AccessPopupSettings,
    sms: (data.sms || { provider: 'dev', devMode: true }) as {
      provider: string;
      devMode: boolean;
    },
    trialDays: Number(data.trialDays || 3),
  };
}

export async function adminSaveSettings(
  popup: Partial<AccessPopupSettings>,
  adminEmail?: string | null,
  adminPassword?: string | null,
) {
  const res = await apiFetch('/api/app-auth/admin/settings', {
    method: 'PUT',
    headers: authHeaders(adminEmail, adminPassword),
    body: JSON.stringify({ popup }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not save settings');
  return data.popup as AccessPopupSettings;
}
