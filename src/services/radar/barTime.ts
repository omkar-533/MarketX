/** Candle timestamp → setup/trade time (bar close), not scanner clock. */

const BAR_MS: Record<string, number> = {
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

/** When the bar that created the setup closed — the time a trade could be taken. */
export function setupCreatedAtMs(timestamp: number, timeframe: string): number {
  const open = candleTimeMs(timestamp);
  if (!open) return 0;
  return open + (BAR_MS[timeframe] || 0);
}
