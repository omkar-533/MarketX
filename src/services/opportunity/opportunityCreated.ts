/**
 * Opportunity Created clock — when this setup first printed on the current run.
 * Never the scan clock, never the last bar of the day for every name.
 */
import {
  currentRunStartOfIstDay,
  firstHitTimeOfIstDay,
  keepDisplaySetupTime,
} from '../radar/barTime';

export function opportunityCreatedAtMs(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
): number {
  const run = currentRunStartOfIstDay(candles, timeframe, hitsAt, now);
  if (run > 0) return keepDisplaySetupTime(run, now);
  return keepDisplaySetupTime(firstHitTimeOfIstDay(candles, timeframe, hitsAt, now), now);
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
