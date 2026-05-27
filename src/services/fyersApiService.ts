export type FyersStatus = {
  configured: boolean;
  connected: boolean;
  hasToken: boolean;
  redirectUri: string;
};

export async function fetchFyersStatus(): Promise<FyersStatus | null> {
  try {
    const res = await fetch('/api/fyers/status');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchFyersLoginUrl(): Promise<string | null> {
  try {
    const res = await fetch('/api/fyers/login-url');
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url || null;
  } catch {
    return null;
  }
}

export async function connectFyersAuthCode(authCode: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/fyers/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_code: authCode.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || 'Connection failed' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'API server offline — run npm run server' };
  }
}

export async function disconnectFyers(): Promise<boolean> {
  try {
    const res = await fetch('/api/fyers/disconnect', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
