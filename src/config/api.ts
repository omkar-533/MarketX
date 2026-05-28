/** API base — empty in dev (Vite proxy); set VITE_API_URL in production (Render). */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.trim() || '';
  return raw.replace(/\/$/, '');
}

/** Socket.IO origin — defaults to API base or current origin */
export function getWsBaseUrl(): string {
  const ws = import.meta.env.VITE_WS_URL?.trim();
  if (ws) return ws.replace(/\/$/, '');
  const api = getApiBaseUrl();
  return api || (typeof window !== 'undefined' ? window.location.origin : '');
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}
