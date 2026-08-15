/** Candle timestamp → setup/trade time from the last CLOSED bar — never the scan clock. */

import { getIstParts, istCalendarDay } from '../../utils/marketHours';

export const BAR_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
};

export function candleTimeMs(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp > 1e12 ? timestamp : timestamp * 1000;
}

function barDurationMs(timeframe: string): number {
  return BAR_MS[timeframe] || 0;
}

export function closedBarIndex(
  candles: { timestamp: number }[],
  timeframe: string,
  now = Date.now(),
): number {
  if (!candles.length) return -1;
  const dur = barDurationMs(timeframe);
  const sessionEnd = timeframe === '1D' ? 0 : istSessionEndMs(now);
  let i = candles.length - 1;
  while (i > 0 && sessionEnd && candleTimeMs(candles[i].timestamp) >= sessionEnd) i -= 1;
  const minKeep = Math.max(0, i - 4);
  while (i > minKeep) {
    const open = candleTimeMs(candles[i].timestamp);
    const unclosed =
      open > now + 2_000 ||
      (dur > 0 && open + dur > now + 2_000 && now - open < dur + 8_000) ||
      (dur === 0 && now - open < 30_000);
    if (!unclosed) break;
    i -= 1;
  }
  return i;
}

/**
 * When that bar closed — never Date.now().
 * If `timestamp` is already a close (adding duration lands in the future), keep it.
 */
export function setupCreatedAtMs(
  timestamp: number,
  timeframe: string,
  now = Date.now(),
): number {
  const open = candleTimeMs(timestamp);
  if (!open) return 0;
  const dur = barDurationMs(timeframe);
  const sessionEnd = timeframe === '1D' ? 0 : istSessionEndMs(now);
  if (!dur) {
    const t = open > now ? 0 : open;
    if (t && sessionEnd && t > sessionEnd) return sessionEnd;
    return t;
  }
  let close = open + dur;
  if (sessionEnd && open < sessionEnd && close > sessionEnd) close = sessionEnd;
  if (close > now + 2_000) return open <= now ? open : 0;
  if (sessionEnd && close > sessionEnd) return sessionEnd;
  return close;
}

export function setupCreatedAtFromCandles(
  candles: { timestamp: number }[] | undefined,
  timeframe: string,
  now = Date.now(),
): number {
  if (!candles?.length) return 0;
  const idx = closedBarIndex(candles, timeframe, now);
  if (idx < 0) return 0;
  return setupCreatedAtMs(candles[idx].timestamp, timeframe, now);
}

/**
 * First closed bar of the current consecutive hit — when the setup was created,
 * not the latest scan / last candle (which is usually "now").
 * `hitsAt(i)` is true when candles[0..=i] still match the scanner.
 */
export function firstConsecutiveHitTime(
  candles: { timestamp: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
): number {
  const end = closedBarIndex(candles, timeframe, now);
  if (end < 0) return 0;
  if (!hitsAt(end)) return setupCreatedAtMs(candles[end].timestamp, timeframe, now);
  const floor = Math.max(24, end - 72);
  let first = end;
  for (let i = end - 1; i >= floor; i -= 1) {
    if (!hitsAt(i)) break;
    first = i;
  }
  return setupCreatedAtMs(candles[first].timestamp, timeframe, now);
}

function shiftIstYmd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T12:00:00+05:30`) + days * 86_400_000;
  return istCalendarDay(new Date(t));
}

/**
 * NSE cash session day we stamp Created against.
 * Weekend / before 09:15 IST → last completed weekday (Fri on Sat/Sun/Mon morning).
 */
export function nseTradingDay(now = Date.now()): string {
  const ymd = istCalendarDay(new Date(now));
  const p = getIstParts(new Date(now));
  const open = Date.parse(`${ymd}T09:15:00+05:30`);
  if (p.day === 0) return shiftIstYmd(ymd, -2);
  if (p.day === 6) return shiftIstYmd(ymd, -1);
  if (Number.isFinite(open) && now < open) return shiftIstYmd(ymd, p.day === 1 ? -3 : -1);
  return ymd;
}

/** NSE cash/F&O session open for the active trading day (09:15). */
export function istSessionStartMs(now = Date.now()): number {
  const day = nseTradingDay(now);
  const open = Date.parse(`${day}T09:15:00+05:30`);
  return Number.isFinite(open) ? open : 0;
}

/** NSE cash/F&O session close (15:30). 1h bars must not stamp 4:15pm. */
export function istSessionEndMs(now = Date.now()): number {
  const day = nseTradingDay(now);
  const close = Date.parse(`${day}T15:30:00+05:30`);
  return Number.isFinite(close) ? close : 0;
}

const NSE_SESSION_MS = 375 * 60_000; // 09:15–15:30
const TIMEWALK_LOOKBACK_BARS = 40;

/**
 * Bars needed so a time-walk can see the first IST print (session + indicator lookback).
 * Never the scan clock; never a short 80-bar tail that drops the morning.
 */
export function sessionBarsNeeded(timeframe: string, now = Date.now()): number {
  if (timeframe === '1D' || timeframe === '4h') return 80;
  const dur = barDurationMs(timeframe);
  if (!dur) return 80;
  const session = istSessionStartMs(now);
  const elapsed =
    session > 0 && now >= session
      ? Math.min(now - session + dur, NSE_SESSION_MS)
      : NSE_SESSION_MS;
  return Math.min(500, Math.max(80, Math.ceil(elapsed / dur) + TIMEWALK_LOOKBACK_BARS + 4));
}

/**
 * First time this setup printed on the active NSE trading day.
 * Weekend / before the bell uses Friday's session — never a blank Saturday stamp.
 */
export function firstHitTimeOfIstDay(
  candles: { timestamp: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
): number {
  const end = closedBarIndex(candles, timeframe, now);
  if (end < 0) return 0;
  const today = nseTradingDay(now);
  const session =
    timeframe === '1D' || timeframe === '4h'
      ? Date.parse(`${today}T00:00:00+05:30`)
      : istSessionStartMs(now);
  if (!(session > 0) || session > now + 2_000) return 0;

  let start = -1;
  for (let i = 0; i <= end; i += 1) {
    if (candleTimeMs(candles[i].timestamp) >= session) {
      start = i;
      break;
    }
  }
  if (start < 0) return 0;

  const sessionEnd = timeframe === '1D' ? 0 : istSessionEndMs(now);
  const inSession = (i: number) => {
    const open = candleTimeMs(candles[i].timestamp);
    return !(sessionEnd && open >= sessionEnd);
  };
  const stamp = (i: number) => {
    const t = setupCreatedAtMs(candles[i].timestamp, timeframe, now);
    if (t > 0 && t <= now + 2_000 && istCalendarDay(new Date(t)) === today) return t;
    return 0;
  };

  // Coarse probe then walk back — full per-bar snapshots were freezing Opportunity.
  const span = end - start;
  const step = span <= 8 ? 1 : Math.max(3, Math.ceil(span / 12));
  let found = -1;
  for (let i = start; i <= end; i += step) {
    if (!inSession(i)) continue;
    if (hitsAt(i)) {
      found = i;
      break;
    }
  }
  if (found < 0 && inSession(end) && hitsAt(end)) found = end;
  if (found < 0) return 0;
  for (let i = found - 1; i >= start; i -= 1) {
    if (!inSession(i)) continue;
    if (!hitsAt(i)) break;
    found = i;
  }
  return stamp(found);
}

function onTradingDay(ms: number, now: number): number {
  const t = Number(ms) || 0;
  if (t <= 0 || t > now + 2_000) return 0;
  if (istCalendarDay(new Date(t)) !== nseTradingDay(now)) return 0;
  const end = istSessionEndMs(now);
  if (end && t > end) return end;
  return t;
}

/** Keep the earliest real setup time when the same name reprints later in the IST day. */
export function keepFirstSetupTime(prev: number, next: number, now = Date.now()): number {
  const a = onTradingDay(prev, now);
  const b = onTradingDay(next, now);
  if (a > 0 && b > 0) return Math.min(a, b);
  return a || b;
}
