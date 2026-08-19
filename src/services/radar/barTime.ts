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

/** Accept `timestamp` (ms), ChartBar `time` (sec), or INDstocks `ts`. */
export function readCandleTimeMs(c: {
  timestamp?: number;
  time?: number;
  ts?: number;
} | number): number {
  if (typeof c === 'number') return candleTimeMs(c);
  const raw = [c?.timestamp, c?.time, c?.ts]
    .map((n) => Number(n))
    .find((n) => Number.isFinite(n) && n > 0);
  return raw ? candleTimeMs(raw) : 0;
}

export function lastBarStamp(
  candles: { timestamp?: number; time?: number; ts?: number }[] | undefined,
  timeframe: string,
  now = Date.now(),
): number {
  if (!candles?.length) return 0;
  let fallback = 0;
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const raw = readCandleTimeMs(candles[i]);
    if (!raw) continue;
    const t = setupCreatedAtMs(raw, timeframe, now);
    if (!(t > 0)) continue;
    if (!fallback) fallback = t;
    const kept = keepFirstSetupTime(0, t, now);
    if (kept) return kept;
  }
  return fallback;
}

function barDurationMs(timeframe: string): number {
  return BAR_MS[timeframe] || 0;
}

function barOpenMs(c: { timestamp?: number; time?: number; ts?: number }): number {
  return readCandleTimeMs(c);
}

export function closedBarIndex(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  now = Date.now(),
): number {
  if (!candles.length) return -1;
  const dur = barDurationMs(timeframe);
  const sessionEnd = timeframe === '1D' ? 0 : istSessionEndMs(now);
  let i = candles.length - 1;
  while (i > 0 && sessionEnd && barOpenMs(candles[i]) > sessionEnd) i -= 1;
  const minKeep = Math.max(0, i - 4);
  while (i > minKeep) {
    const open = barOpenMs(candles[i]);
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
  candles: { timestamp?: number; time?: number; ts?: number }[] | undefined,
  timeframe: string,
  now = Date.now(),
): number {
  if (!candles?.length) return 0;
  const idx = closedBarIndex(candles, timeframe, now);
  if (idx < 0) return 0;
  return setupCreatedAtMs(barOpenMs(candles[idx]), timeframe, now);
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
 * The time-walk re-asks session bounds for every bar × scanner — Intl timezone
 * formatters are too expensive for that. Outputs only move at IST day/session
 * boundaries, so a minute-granularity memo is exact for trading logic.
 */
const MINUTE_MS = 60_000;
const nseDayMemo = new Map<number, string>();
const sessionStartMemo = new Map<number, number>();
const sessionEndMemo = new Map<number, number>();

function memoMinute<S>(cache: Map<number, S>, ms: number, compute: () => S): S {
  const key = Math.floor(ms / MINUTE_MS);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  if (cache.size > 4000) cache.clear();
  cache.set(key, value);
  return value;
}

/**
 * NSE cash session day we stamp Created against.
 * Weekend / before 09:15 IST → last completed weekday (Fri on Sat/Sun/Mon morning).
 */
export function nseTradingDay(now = Date.now()): string {
  return memoMinute(nseDayMemo, now, () => {
    const ymd = istCalendarDay(new Date(now));
    const p = getIstParts(new Date(now));
    const open = Date.parse(`${ymd}T09:15:00+05:30`);
    if (p.day === 0) return shiftIstYmd(ymd, -2);
    if (p.day === 6) return shiftIstYmd(ymd, -1);
    if (Number.isFinite(open) && now < open) return shiftIstYmd(ymd, p.day === 1 ? -3 : -1);
    return ymd;
  });
}

/** NSE cash/F&O session open for the active trading day (09:15). */
export function istSessionStartMs(now = Date.now()): number {
  return memoMinute(sessionStartMemo, now, () => {
    const day = nseTradingDay(now);
    const open = Date.parse(`${day}T09:15:00+05:30`);
    return Number.isFinite(open) ? open : 0;
  });
}

/** NSE cash/F&O session close (15:30). 1h bars must not stamp 4:15pm. */
export function istSessionEndMs(now = Date.now()): number {
  return memoMinute(sessionEndMemo, now, () => {
    const day = nseTradingDay(now);
    const close = Date.parse(`${day}T15:30:00+05:30`);
    return Number.isFinite(close) ? close : 0;
  });
}

/**
 * Close time of the last fully finished bar on the NSE 09:15 grid.
 * Never the forming candle's projected close (that is why 11:42 was showing 11:45).
 */
export function lastClosedBarCloseMs(timeframe: string, now = Date.now()): number {
  const dur = barDurationMs(timeframe);
  const start = istSessionStartMs(now);
  if (!(start > 0) || now < start) return 0;
  const sessionEnd = istSessionEndMs(now);
  const cap = sessionEnd ? Math.min(now, sessionEnd) : now;
  if (!dur) return cap <= now ? cap : 0;
  const closed = Math.floor((cap - start) / dur);
  if (closed <= 0) return 0;
  const close = start + closed * dur;
  return close > now + 2_000 ? close - dur : close;
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

function istSessionWalk(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  now: number,
): {
  start: number;
  end: number;
  inSession: (i: number) => boolean;
  stamp: (i: number) => number;
} | null {
  const end = closedBarIndex(candles, timeframe, now);
  if (end < 0) return null;
  const today = nseTradingDay(now);
  const session =
    timeframe === '1D' || timeframe === '4h'
      ? Date.parse(`${today}T00:00:00+05:30`)
      : istSessionStartMs(now);
  if (!(session > 0) || session > now + 2_000) return null;

  let start = -1;
  for (let i = 0; i <= end; i += 1) {
    if (barOpenMs(candles[i]) >= session) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const sessionEnd = timeframe === '1D' ? 0 : istSessionEndMs(now);
  const inSession = (i: number) => {
    const open = barOpenMs(candles[i]);
    return !(sessionEnd && open > sessionEnd);
  };
  const stamp = (i: number) => {
    const t = setupCreatedAtMs(barOpenMs(candles[i]), timeframe, now);
    if (t > 0 && t <= now + 2_000) return t;
    return 0;
  };
  return { start, end, inSession, stamp };
}

/**
 * First time this setup printed on the active NSE trading day.
 * Weekend / before the bell uses Friday's session — never a blank Saturday stamp.
 */
export function firstHitTimeOfIstDay(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
): number {
  const w = istSessionWalk(candles, timeframe, now);
  if (!w) return 0;
  for (let i = w.start; i <= w.end; i += 1) {
    if (!w.inSession(i)) continue;
    if (hitsAt(i)) return w.stamp(i);
  }
  return 0;
}

/**
 * When the card on screen started — start of the current consecutive run today.
 * A 9:20 false start that died, then a 11:40 reprint, stamps 11:40 (not 9:20, not now).
 * Intraday skips the 9:15 opening print (prior-day 20-bar range).
 */
export function currentRunStartOfIstDay(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
): number {
  const windows = runWindowsOfIstDay(candles, timeframe, hitsAt, now);
  if (!windows.length) return 0;
  const w = istSessionWalk(candles, timeframe, now);
  if (!w || !w.inSession(w.end) || !hitsAt(w.end)) return 0;
  return windows[windows.length - 1]?.startMs || 0;
}

export type IstRunWindow = { startMs: number; startIndex: number; endIndex: number };

/**
 * Every qualifying run today — start clock + last bar of that episode.
 * A 10:20 signal that died, then a 14:05 reprint, returns both.
 * A run still on at the close keeps the start of that run, not 3:30.
 */
export function runWindowsOfIstDay(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
): IstRunWindow[] {
  const w = istSessionWalk(candles, timeframe, now);
  if (!w) return [];
  const floor =
    timeframe === '1D' || timeframe === '4h' ? w.start : Math.min(w.end, w.start + 1);
  const out: IstRunWindow[] = [];
  let i = floor;
  while (i <= w.end) {
    if (!w.inSession(i) || !hitsAt(i)) {
      i += 1;
      continue;
    }
    const startIndex = i;
    const startMs = w.stamp(i);
    let endIndex = i;
    i += 1;
    while (i <= w.end && w.inSession(i) && hitsAt(i)) {
      endIndex = i;
      i += 1;
    }
    if (startMs > 0) out.push({ startMs, startIndex, endIndex });
  }
  return out;
}

export function runStartsOfIstDay(
  candles: { timestamp?: number; time?: number; ts?: number }[],
  timeframe: string,
  hitsAt: (endIndex: number) => boolean,
  now = Date.now(),
): number[] {
  return runWindowsOfIstDay(candles, timeframe, hitsAt, now).map((r) => r.startMs);
}

function onTradingDay(ms: number, now: number): number {
  const t = candleTimeMs(Number(ms)) || 0;
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

/**
 * Display stamp when the print is a weekday session time in the last 10 days.
 * Weekend / scan-clock values stay blank — never invent a Saturday 3pm.
 */
export function keepDisplaySetupTime(ms: number, now = Date.now()): number {
  const t = candleTimeMs(Number(ms)) || 0;
  if (t <= 0 || t > now + 2_000) return 0;
  if (now - t > 10 * 86_400_000) return 0;
  const p = getIstParts(new Date(t));
  if (p.day === 0 || p.day === 6) return 0;
  const day = istCalendarDay(new Date(t));
  const open = Date.parse(`${day}T09:15:00+05:30`);
  const close = Date.parse(`${day}T15:30:00+05:30`);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return 0;
  if (t > close) return close;
  if (t < open) return open;
  return t;
}
