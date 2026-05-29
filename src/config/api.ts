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

const API_TIMEOUT_MS = 50_000;
const API_HEALTH_TIMEOUT_MS = 28_000;
const API_RETRY_DELAY_MS = 1_000;

export type ApiFetchOpts = {
  retries?: number;
  timeoutMs?: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isFetchOpts(v: unknown): v is ApiFetchOpts {
  return Boolean(v && typeof v === 'object' && ('retries' in v || 'timeoutMs' in v));
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
  opts?: ApiFetchOpts,
): Promise<Response> {
  const resolved = isFetchOpts(opts)
    ? opts
    : {
        retries: path.includes('/api/health') ? 1 : 2,
        timeoutMs: path.includes('/api/health') ? API_HEALTH_TIMEOUT_MS : API_TIMEOUT_MS,
      };
  const { retries = 2, timeoutMs = API_TIMEOUT_MS } = resolved;
  const base = getApiBaseUrl();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });
      clearTimeout(timer);
      const retryable = res.status === 502 || res.status === 503 || res.status === 504;
      if (!retryable || attempt >= retries) return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt >= retries) throw err;
    }
    await sleep(API_RETRY_DELAY_MS * (attempt + 1));
  }

  throw lastError ?? new Error('Request failed');
}
