/** Candle timestamp → setup/trade time from the last CLOSED bar — never the scan clock. */

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
  let i = candles.length - 1;
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
  if (!dur) return open > now ? 0 : open;
  const close = open + dur;
  if (close > now + 2_000) return open <= now ? open : 0;
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
