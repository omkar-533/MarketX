import type { ChartBar } from '../../types/chart';

/** API interval string → bucket size in ms. */
export function intervalToMs(apiInterval: string): number {
  const raw = String(apiInterval || '');
  // TradingView monthly stays '1M' — do not lowercase (collides with 1m).
  if (raw === '1M') return 30 * 24 * 60_000;
  switch (raw.toLowerCase()) {
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
      return 7 * 24 * 60_000;
    case '1mo':
    case '1mth':
      return 30 * 24 * 60_000;
    default:
      return 60_000;
  }
}

export function barTimeSec(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
}

function isSessionAmendOnly(apiInterval: string): boolean {
  const tf = String(apiInterval || '');
  const lower = tf.toLowerCase();
  // Daily / weekly / monthly: session buckets vary by exchange — never invent UTC opens.
  return lower === '1d' || lower === '1w' || tf === '1M' || lower === '1mo' || lower === '1mth';
}

function amendTip(last: ChartBar, price: number, vol?: number): ChartBar {
  const next = { ...last };
  next.high = Math.max(next.high, price);
  next.low = Math.min(next.low, price);
  next.close = price;
  if (Number.isFinite(vol) && (vol as number) > 0) {
    next.volume = Math.max(next.volume || 0, vol as number);
  }
  return next;
}

/**
 * Merge a live LTP into the forming candle for the active timeframe.
 * Rollover aligns from the last bar's open (TradingView-style), not UTC epoch floors —
 * so NSE :15 hourly bars and similar session grids stay correct.
 */
export function applyLivePriceToBars(
  bars: ChartBar[],
  price: number,
  apiInterval: string,
  opts?: { nowMs?: number; volume?: number },
): { bars: ChartBar[]; updated: ChartBar; isNewBar: boolean } | null {
  if (!Array.isArray(bars) || !bars.length || !(price > 0)) return null;

  const nowMs = opts?.nowMs ?? Date.now();
  const vol = Number(opts?.volume);
  const next = bars.slice();
  const last = { ...next[next.length - 1], time: barTimeSec(next[next.length - 1].time) };

  if (isSessionAmendOnly(apiInterval)) {
    const tip = amendTip(last, price, vol);
    next[next.length - 1] = tip;
    return { bars: next, updated: tip, isNewBar: false };
  }

  const intervalMs = intervalToMs(apiInterval);
  if (!(intervalMs > 0)) {
    const tip = amendTip(last, price, vol);
    next[next.length - 1] = tip;
    return { bars: next, updated: tip, isNewBar: false };
  }

  const openMs = last.time * 1000;
  const elapsed = nowMs - openMs;

  // Clock behind / same bar: amend tip (preserves wick extremes).
  if (elapsed < intervalMs) {
    const tip = amendTip(last, price, vol);
    next[next.length - 1] = tip;
    return { bars: next, updated: tip, isNewBar: false };
  }

  // Advance whole intervals from the last open (handles gaps / late ticks).
  const steps = Math.max(1, Math.floor(elapsed / intervalMs));
  const formingTime = last.time + steps * (intervalMs / 1000);
  const forming: ChartBar = {
    time: formingTime,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: Number.isFinite(vol) && vol > 0 ? vol : 0,
  };
  next.push(forming);
  return { bars: next, updated: forming, isNewBar: true };
}

/**
 * After an OHLC history resync, keep the live-forming tip so the candle does not snap back.
 * - Same open time → history open + live high/low/close
 * - Live already rolled a newer bar → append live tip(s) after history
 */
export function mergeLiveTipIntoHistory(history: ChartBar[], liveBars: ChartBar[]): ChartBar[] {
  if (!history.length) return liveBars.length ? liveBars.map((b) => ({ ...b, time: barTimeSec(b.time) })) : history;
  if (!liveBars.length) return history.map((b) => ({ ...b, time: barTimeSec(b.time) }));

  const hist = history.map((b) => ({ ...b, time: barTimeSec(b.time) }));
  const liveLast = { ...liveBars[liveBars.length - 1], time: barTimeSec(liveBars[liveBars.length - 1].time) };
  const histLast = hist[hist.length - 1];
  const hTime = histLast.time;
  const lTime = liveLast.time;

  if (lTime > hTime) {
    const extras = liveBars
      .map((b) => ({ ...b, time: barTimeSec(b.time) }))
      .filter((b) => b.time > hTime);
    // De-dupe by time if live somehow repeats.
    const byTime = new Map<number, ChartBar>();
    for (const b of hist) byTime.set(b.time, b);
    for (const b of extras) byTime.set(b.time, b);
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }

  if (lTime === hTime) {
    const merged: ChartBar = {
      time: hTime,
      open: histLast.open,
      high: Math.max(histLast.high, liveLast.high, liveLast.close),
      low: Math.min(histLast.low, liveLast.low, liveLast.close),
      close: liveLast.close,
      volume: Math.max(histLast.volume || 0, liveLast.volume || 0),
    };
    return [...hist.slice(0, -1), merged];
  }

  return hist;
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
