import type { ChartBar } from '../../types/chart';
import { toGlobalLiveSymbol } from '../../data/coreGlobalLiveSymbols';

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

function amendTip(
  last: ChartBar,
  price: number,
  vol?: number,
  extremes?: { high?: number; low?: number },
): ChartBar {
  const next = { ...last };
  const hi = Number(extremes?.high);
  const lo = Number(extremes?.low);
  // Only apply wick extremes that look like the same instrument (reject BANKNIFTY→NIFTY etc.).
  const useHi = Number.isFinite(hi) && hi > 0 && isPlausibleLivePrice(last.close || price, hi);
  const useLo = Number.isFinite(lo) && lo > 0 && isPlausibleLivePrice(last.close || price, lo);
  next.high = Math.max(next.high, price, useHi ? hi : price);
  next.low = Math.min(next.low, price, useLo ? lo : price);
  next.close = price;
  if (Number.isFinite(vol) && (vol as number) > 0) {
    next.volume = Math.max(next.volume || 0, vol as number);
  }
  return next;
}

/**
 * Reject live prints that are wildly off the last close (wrong-symbol / bad tick).
 * Indices like NIFTY vs BANKNIFTY (~2x) must not stretch the scale.
 */
export function isPlausibleLivePrice(ref: number, price: number, maxMovePct = 0.08): boolean {
  if (!(price > 0) || !(ref > 0)) return price > 0 && !(ref > 0);
  const move = Math.abs(price - ref) / ref;
  return move <= maxMovePct;
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
  opts?: {
    nowMs?: number;
    volume?: number;
    high?: number;
    low?: number;
    /** When false (session closed), only amend the last real bar — never invent after-hours candles. */
    allowNewBar?: boolean;
  },
): { bars: ChartBar[]; updated: ChartBar; isNewBar: boolean } | null {
  if (!Array.isArray(bars) || !bars.length || !(price > 0)) return null;

  const lastClose = bars[bars.length - 1]?.close;
  if (Number.isFinite(lastClose) && lastClose > 0 && !isPlausibleLivePrice(lastClose, price)) {
    return null;
  }

  const nowMs = opts?.nowMs ?? Date.now();
  const vol = Number(opts?.volume);
  const extremes = { high: opts?.high, low: opts?.low };
  const next = bars.slice();
  const last = { ...next[next.length - 1], time: barTimeSec(next[next.length - 1].time) };

  if (isSessionAmendOnly(apiInterval)) {
    const tip = amendTip(last, price, vol, extremes);
    next[next.length - 1] = tip;
    return { bars: next, updated: tip, isNewBar: false };
  }

  const intervalMs = intervalToMs(apiInterval);
  if (!(intervalMs > 0) || opts?.allowNewBar === false) {
    const tip = amendTip(last, price, vol, extremes);
    next[next.length - 1] = tip;
    return { bars: next, updated: tip, isNewBar: false };
  }

  const openMs = last.time * 1000;
  const elapsed = nowMs - openMs;

  // Clock behind / same bar: amend tip (preserves wick extremes).
  if (elapsed < intervalMs) {
    const tip = amendTip(last, price, vol, extremes);
    next[next.length - 1] = tip;
    return { bars: next, updated: tip, isNewBar: false };
  }

  // Advance whole intervals from the last open (handles gaps / late ticks).
  const steps = Math.max(1, Math.floor(elapsed / intervalMs));
  const formingTime = last.time + steps * (intervalMs / 1000);
  const hi = Number(opts?.high);
  const lo = Number(opts?.low);
  const useHi = Number.isFinite(hi) && hi > 0 && isPlausibleLivePrice(price, hi);
  const useLo = Number.isFinite(lo) && lo > 0 && isPlausibleLivePrice(price, lo);
  const forming: ChartBar = {
    time: formingTime,
    open: price,
    high: Math.max(price, useHi ? hi : price),
    low: Math.min(price, useLo ? lo : price),
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
    const ref = histLast.close || liveLast.close;
    const liveHiOk = isPlausibleLivePrice(ref, liveLast.high);
    const liveLoOk = isPlausibleLivePrice(ref, liveLast.low);
    const merged: ChartBar = {
      time: hTime,
      open: histLast.open,
      high: Math.max(
        histLast.high,
        liveHiOk ? liveLast.high : histLast.high,
        isPlausibleLivePrice(ref, liveLast.close) ? liveLast.close : histLast.close,
      ),
      low: Math.min(
        histLast.low,
        liveLoOk ? liveLast.low : histLast.low,
        isPlausibleLivePrice(ref, liveLast.close) ? liveLast.close : histLast.close,
      ),
      close: isPlausibleLivePrice(ref, liveLast.close) ? liveLast.close : histLast.close,
      volume: Math.max(histLast.volume || 0, liveLast.volume || 0),
    };
    return [...hist.slice(0, -1), merged];
  }

  return hist;
}

/** Normalize quote/API symbols for exact compare (strips NSE:/BSE:/MCX:). */
export function normalizeMarketSymbol(symbol: string): string {
  return String(symbol || '')
    .toUpperCase()
    .trim()
    .replace(/^NSE:|^BSE:|^MCX:|^BINANCE:|^FX_IDC:|^OANDA:|^TVC:/, '');
}

/**
 * Match quote symbol against chart API symbol.
 * Exact after exchange strip + global aliases (BTCUSDT ↔ BTC). Never endsWith
 * (BANKNIFTY must not match NIFTY).
 */
export function quoteMatchesSymbol(quoteSymbol: string, apiSymbol: string): boolean {
  const qRaw = normalizeMarketSymbol(quoteSymbol);
  const aRaw = normalizeMarketSymbol(apiSymbol);
  const q = toGlobalLiveSymbol(qRaw) || qRaw;
  const a = toGlobalLiveSymbol(aRaw) || aRaw;
  return Boolean(q && a && q === a);
}
