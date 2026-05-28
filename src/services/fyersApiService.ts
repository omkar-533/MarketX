import { apiFetch } from '../config/api';
import { SERVER_OFFLINE_MSG, sanitizeDisplayMessage } from '../constants/brandLabels';

export type FyersStatus = {
  configured: boolean;
  connected: boolean;
  hasToken: boolean;
  redirectUri: string;
};

export async function fetchFyersStatus(): Promise<FyersStatus | null> {
  try {
    const res = await apiFetch('/api/fyers/status');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchFyersLoginUrl(): Promise<string | null> {
  try {
    const res = await apiFetch('/api/fyers/login-url');
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

export async function connectFyersAuthCode(authCode: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/fyers/connect', {
      method: 'POST',
      body: JSON.stringify({ auth_code: authCode.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: sanitizeDisplayMessage(data?.error || 'Connection failed') };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: SERVER_OFFLINE_MSG };
  }
}

export async function connectFyersAccessToken(
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/fyers/access-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: sanitizeDisplayMessage(data?.error || 'Failed') };
    return { ok: true };
  } catch {
    return { ok: false, error: SERVER_OFFLINE_MSG };
  }
}

export async function disconnectFyers(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/auth/logout', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
