/**
 * Opportunity Created clock — each signal episode today, not the scan clock.
 * First print of a run stays. A later reprint is a 2nd listing with its own time.
 */
import { keepDisplaySetupTime, runWindowsOfIstDay } from '../radar/barTime';

export type OpportunityCreatedWindow = { createdAt: number; startIndex: number; endIndex: number };

export function opportunityCreatedWindows(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
  opts?: { includeFirstBar?: boolean },
): OpportunityCreatedWindow[] {
  const seen = new Set<number>();
  const out: OpportunityCreatedWindow[] = [];
  for (const w of runWindowsOfIstDay(candles, timeframe, hitsAt, now, opts)) {
    const createdAt = keepDisplaySetupTime(w.startMs, now);
    if (!(createdAt > 0) || seen.has(createdAt)) continue;
    seen.add(createdAt);
    out.push({ createdAt, startIndex: w.startIndex, endIndex: w.endIndex });
  }
  return out;
}

export function opportunityCreatedTimesMs(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
  opts?: { includeFirstBar?: boolean },
): number[] {
  return opportunityCreatedWindows(candles, timeframe, hitsAt, now, opts).map((w) => w.createdAt);
}

/** Latest still-active run, else 0. */
export function opportunityCreatedAtMs(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
): number {
  const times = opportunityCreatedTimesMs(candles, timeframe, hitsAt, now);
  return times.length ? times[times.length - 1] : 0;
}

export function formatOpportunityCreatedClock(ms: number, now = Date.now()): string {
  const t0 = ms > 0 && ms < 1e11 ? ms * 1000 : ms;
  if (!Number.isFinite(t0) || t0 <= 0) return '—';
  if (t0 > now + 2_000) return '—';
  return new Date(t0).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}
