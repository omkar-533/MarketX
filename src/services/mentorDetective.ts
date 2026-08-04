import { apiFetch } from '../config/api';
import type { DetectiveCard } from './mentorDrills';

export async function fetchMentorDetective(
  symbol: string,
  interval: string,
): Promise<DetectiveCard | null> {
  const sym = symbol.includes(':') ? symbol.split(':').pop()! : symbol;
  const tf = /^\d+$/.test(interval) ? `${interval}m` : interval;
  try {
    const res = await apiFetch(
      `/api/mentor/detective?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(tf)}`,
      {},
      { retries: 1, timeoutMs: 25_000 },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.detective as DetectiveCard) || null;
  } catch {
    return null;
  }
}
