import { getApiBaseUrl } from '../../config/api';
import { loadAppSession } from '../appInviteAuth';
import type { WolfFnoDesk } from './wolfFnoTypes';

function authHeaders(): HeadersInit {
  const session = loadAppSession();
  return {
    Accept: 'application/json',
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

export async function fetchWolfFnoDesk(): Promise<WolfFnoDesk> {
  const res = await fetch(`${getApiBaseUrl()}/api/market-data/wolf-fno`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  const body = (await res.json().catch(() => ({}))) as WolfFnoDesk & { error?: string };
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body;
}
