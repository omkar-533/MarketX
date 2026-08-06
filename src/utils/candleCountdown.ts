/**
 * Candle close countdown helpers (TradingView-style bar timer).
 */

import type { TvInterval } from './tradingViewSymbols';

const INTERVAL_MS: Record<string, number> = {
  '1': 60_000,
  '3': 180_000,
  '5': 300_000,
  '15': 900_000,
  '30': 1_800_000,
  '60': 3_600_000,
  '120': 7_200_000,
  '240': 14_400_000,
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
};

/** Duration of one bar for a TV / native interval id. Null for D/W/M. */
export function barDurationMs(interval: string | null | undefined): number | null {
  if (!interval) return null;
  if (interval === 'D' || interval === 'W' || interval === 'M') return null;
  if (INTERVAL_MS[interval] != null) return INTERVAL_MS[interval];
  const m = String(interval).match(/^(\d+)(m|h)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2]?.toLowerCase() === 'h') return n * 3_600_000;
  if (n >= 60 && !m[2]) return n * 60_000; // '60' style minutes
  return n * 60_000;
}

/**
 * Seconds remaining until the forming candle closes.
 * `barOpenSec` is the open time (unix seconds) of the latest bar.
 */
export function secondsUntilBarClose(barOpenSec: number, durationMs: number, nowMs = Date.now()): number {
  if (!(barOpenSec > 0) || !(durationMs > 0)) return 0;
  const openMs = barOpenSec * 1000;
  // Align to interval grid from this open (handles gaps / late ticks).
  const elapsed = nowMs - openMs;
  if (elapsed < 0) return Math.ceil(-elapsed / 1000);
  const into = elapsed % durationMs;
  const leftMs = durationMs - into;
  return Math.max(0, Math.ceil(leftMs / 1000));
}

export function formatBarCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function countdownForInterval(
  interval: TvInterval | string,
  lastBarOpenSec: number | null | undefined,
  nowMs = Date.now(),
): { text: string; seconds: number; urgent: boolean } | null {
  const dur = barDurationMs(interval);
  if (!dur || !lastBarOpenSec) return null;
  const seconds = secondsUntilBarClose(lastBarOpenSec, dur, nowMs);
  return {
    text: formatBarCountdown(seconds),
    seconds,
    urgent: seconds <= 10,
  };
}
