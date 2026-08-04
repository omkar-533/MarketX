import type { ChartBar } from '../../types/chart';

/** API interval string → bucket size in ms. */
export function intervalToMs(apiInterval: string): number {
  switch (String(apiInterval || '').toLowerCase()) {
    case '1m':
      return 60_000;
    case '3m':
      return 3 * 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
    case '60m':
      return 60 * 60_000;
    case '2h':
      return 2 * 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1d':
      return 24 * 60 * 60_000;
    case '1w':
      return 7 * 24 * 60 * 60_000;
    default:
      return 60_000;
  }
}

export function barTimeSec(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
}

/**
 * Merge a live LTP into the forming candle for the active timeframe.
 * Returns a new bars array + the bar that should be pushed via series.update.
 */
export function applyLivePriceToBars(
  bars: ChartBar[],
  price: number,
  apiInterval: string,
  opts?: { nowMs?: number; volume?: number },
): { bars: ChartBar[]; updated: ChartBar } | null {
  if (!Array.isArray(bars) || !bars.length || !(price > 0)) return null;

  const nowMs = opts?.nowMs ?? Date.now();
  const vol = Number(opts?.volume);
  const next = bars.slice();
  const last = { ...next[next.length - 1], time: barTimeSec(next[next.length - 1].time) };

  // Daily / weekly: always amend the latest bar (session bucket varies by exchange).
  const tf = String(apiInterval || '').toLowerCase();
  if (tf === '1d' || tf === '1w') {
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
    if (Number.isFinite(vol) && vol > 0) last.volume = Math.max(last.volume || 0, vol);
    next[next.length - 1] = last;
    return { bars: next, updated: last };
  }

  const intervalMs = intervalToMs(apiInterval);
  const bucketSec = Math.floor(nowMs / intervalMs) * (intervalMs / 1000);

  if (last.time === bucketSec) {
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
    if (Number.isFinite(vol) && vol > 0) last.volume = Math.max(last.volume || 0, vol);
    next[next.length - 1] = last;
    return { bars: next, updated: last };
  }

  if (bucketSec > last.time) {
    const forming: ChartBar = {
      time: bucketSec,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: Number.isFinite(vol) && vol > 0 ? vol : 0,
    };
    next.push(forming);
    return { bars: next, updated: forming };
  }

  // Clock behind last bar time — still paint LTP on the tip.
  last.high = Math.max(last.high, price);
  last.low = Math.min(last.low, price);
  last.close = price;
  next[next.length - 1] = last;
  return { bars: next, updated: last };
}

/** Match quote symbol against chart API symbol (NIFTY / NSE:NIFTY / etc.). */
export function quoteMatchesSymbol(quoteSymbol: string, apiSymbol: string): boolean {
  const q = String(quoteSymbol || '')
    .toUpperCase()
    .replace(/^NSE:|^BSE:|^MCX:/, '');
  const a = String(apiSymbol || '')
    .toUpperCase()
    .replace(/^NSE:|^BSE:|^MCX:/, '');
  return Boolean(q && a && (q === a || q.endsWith(a) || a.endsWith(q)));
}
