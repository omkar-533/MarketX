/**
 * Shared quantitative features for Opportunity scanners.
 * Deterministic — no fabricated prices when candles missing.
 */
import type { Candle } from '../radar/radarTypes';
import {
  BAR_MS,
  istSessionEndMs,
  istSessionStartMs,
  nseTradingDay,
  readCandleTimeMs,
  setupCreatedAtFromCandles,
} from '../radar/barTime';
import {
  analyzeTechnical,
  atr,
  closes,
  ema,
  findSwings,
  rsi,
  sma,
  volumeAverage,
  type TechnicalSnapshot,
} from '../radar/TechnicalEngine';
import { detectVolume, type VolumeEvent } from '../radar/VolumeEngine';
import { detectStructure, type StructureEvent } from '../radar/StructureEngine';
import { detectLiquidity, type LiquidityEvent } from '../radar/LiquidityEngine';

export type FeatureSnapshot = {
  symbol: string;
  exchange: string;
  timeframe: string;
  candles: Candle[];
  tech: TechnicalSnapshot;
  volume: VolumeEvent;
  structure: StructureEvent;
  liquidity: LiquidityEvent;
  changePercent: number;
  /** IST session open → last close. Null when today's session bars are missing. */
  sessionChangePct: number | null;
  sessionRangePct: number | null;
  sessionVolRatio: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  sessionOpen: number | null;
  /** First-15-min session range — opening drive levels. Null until those bars closed. */
  openingHigh: number | null;
  openingLow: number | null;
  prevClose: number | null;
  gapPct: number | null;
  sessionMinsFromOpen: number | null;
  rangePct: number;
  atrPct: number;
  atrCompression: number | null;
  /** ATR ratio on bars excluding the last candle — coil before the break bar. */
  priorAtrCompression: number | null;
  roc5: number | null;
  rsiPrev: number | null;
  dayHigh: number;
  dayLow: number;
  swingHigh: number | null;
  swingLow: number | null;
  high10: number | null;
  high20: number | null;
  low10: number | null;
  low20: number | null;
  /** Last bar close time — when this setup could be traded, not scan clock. */
  setupAt: number;
};

function pctChange(from: number, to: number): number {
  if (!(from > 0)) return 0;
  return ((to - from) / from) * 100;
}

function sessionCandles(candles: Candle[], timeframe: string): Candle[] {
  if (!candles.length) return [];
  const lastT = readCandleTimeMs(candles[candles.length - 1]);
  if (!(lastT > 0)) return [];
  if (timeframe === '1D' || timeframe === '4h') {
    const day = nseTradingDay(lastT);
    return candles.filter((c) => {
      const t = readCandleTimeMs(c);
      return t > 0 && nseTradingDay(t) === day;
    });
  }
  const start = istSessionStartMs(lastT);
  const end = istSessionEndMs(lastT);
  if (!(start > 0) || !(end > 0)) return [];
  return candles.filter((c) => {
    const t = readCandleTimeMs(c);
    return t >= start && t < end;
  });
}

export function buildFeatureSnapshot(
  symbol: string,
  exchange: string,
  timeframe: string,
  candles: Candle[],
): FeatureSnapshot | null {
  if (!candles || candles.length < 25) return null;
  const tech = analyzeTechnical(candles);
  if (!(tech.last > 0)) return null;

  const c = closes(candles);
  const last = c[c.length - 1];
  const prev = c[c.length - 2] ?? last;
  const lookback = Math.min(20, c.length - 1);
  const base = c[c.length - 1 - lookback] ?? prev;
  const changePercent = pctChange(base, last);

  const window = candles.slice(-20);
  const dayHigh = Math.max(...window.map((b) => b.high));
  const dayLow = Math.min(...window.map((b) => b.low));
  const rangePct = dayLow > 0 ? ((dayHigh - dayLow) / dayLow) * 100 : 0;
  const atr14 = atr(candles, 14);
  const atrPct = atr14 && last > 0 ? (atr14 / last) * 100 : 0;

  const atrNow = atr(candles, 14);
  const atrPrev = atr(candles.slice(0, -5), 14);
  const atrCompression =
    atrNow && atrPrev && atrPrev > 0 ? atrNow / atrPrev : null;
  const priorBars = candles.slice(0, -1);
  const priorAtrNow = atr(priorBars, 14);
  const priorAtrPrev = atr(priorBars.slice(0, -5), 14);
  const priorAtrCompression =
    priorAtrNow && priorAtrPrev && priorAtrPrev > 0 ? priorAtrNow / priorAtrPrev : null;

  const roc5 =
    c.length >= 6 && c[c.length - 6] > 0
      ? pctChange(c[c.length - 6], last)
      : null;
  const rsiPrev = c.length > 20 ? rsi(c.slice(0, -3), 14) : null;

  const swings = findSwings(candles, 2);
  const lastHigh = [...swings].reverse().find((s) => s.kind === 'high');
  const lastLow = [...swings].reverse().find((s) => s.kind === 'low');

  // Prior-bar extremes (exclude last candle) so breakouts can actually trigger
  const prior10 = candles.length >= 11 ? candles.slice(-11, -1) : null;
  const prior20 = candles.length >= 21 ? candles.slice(-21, -1) : null;
  const high10 = prior10 ? Math.max(...prior10.map((b) => b.high)) : null;
  const high20 = prior20 ? Math.max(...prior20.map((b) => b.high)) : null;
  const low10 = prior10 ? Math.min(...prior10.map((b) => b.low)) : null;
  const low20 = prior20 ? Math.min(...prior20.map((b) => b.low)) : null;

  const sess = sessionCandles(candles, timeframe);
  const sessionOpen = sess[0] && sess[0].open > 0 ? sess[0].open : null;
  const sessionLast = sess.length ? sess[sess.length - 1].close : null;
  const sessionHigh = sess.length ? Math.max(...sess.map((b) => b.high)) : null;
  const sessionLow = sess.length ? Math.min(...sess.map((b) => b.low)) : null;
  const sessionChangePct =
    sessionOpen != null && sessionLast != null ? pctChange(sessionOpen, sessionLast) : null;
  const sessionRangePct =
    sessionOpen != null && sessionHigh != null && sessionLow != null && sessionOpen > 0
      ? ((sessionHigh - sessionLow) / sessionOpen) * 100
      : null;
  const sessAvgVol = sess.length
    ? sess.reduce((a, b) => a + (Number(b.volume) || 0), 0) / sess.length
    : 0;
  const recentAvgVol = volumeAverage(candles, 20);
  const sessionVolRatio =
    sessAvgVol > 0 && recentAvgVol != null && recentAvgVol > 0 ? sessAvgVol / recentAvgVol : null;

  const barMin = BAR_MS[timeframe] ? BAR_MS[timeframe] / 60_000 : 1440;
  const orBars = Math.max(1, Math.round(15 / barMin));
  const sessionMinsFromOpen = sess.length ? (sess.length - 1) * barMin : null;
  const orSlice = sess.length > orBars ? sess.slice(0, orBars) : null;
  const openingHigh = orSlice ? Math.max(...orSlice.map((b) => b.high)) : null;
  const openingLow = orSlice ? Math.min(...orSlice.map((b) => b.low)) : null;
  let prevClose: number | null = null;
  if (sess.length) {
    const firstSessT = readCandleTimeMs(sess[0]);
    for (let i = candles.length - 1; i >= 0; i -= 1) {
      const t = readCandleTimeMs(candles[i]);
      if (t > 0 && t < firstSessT) {
        prevClose = candles[i].close;
        break;
      }
    }
  }
  const gapPct =
    sessionOpen != null && prevClose != null && prevClose > 0
      ? pctChange(prevClose, sessionOpen)
      : null;

  return {
    symbol,
    exchange,
    timeframe,
    candles,
    tech,
    volume: detectVolume(candles),
    structure: detectStructure(candles, timeframe as never),
    liquidity: detectLiquidity(candles, timeframe as never),
    changePercent,
    sessionChangePct,
    sessionRangePct,
    sessionVolRatio,
    sessionHigh,
    sessionLow,
    sessionOpen,
    openingHigh,
    openingLow,
    prevClose,
    gapPct,
    sessionMinsFromOpen,
    rangePct,
    atrPct,
    atrCompression,
    priorAtrCompression,
    roc5,
    rsiPrev,
    dayHigh,
    dayLow,
    swingHigh: lastHigh?.price ?? null,
    swingLow: lastLow?.price ?? null,
    high10,
    high20,
    low10,
    low20,
    setupAt: setupCreatedAtFromCandles(candles, timeframe),
  };
}

export function emaAlignment(tech: TechnicalSnapshot): 'bullish' | 'bearish' | 'mixed' {
  if (tech.ema21 == null || tech.ema50 == null) return 'mixed';
  if (tech.last > tech.ema21 && tech.ema21 > tech.ema50) return 'bullish';
  if (tech.last < tech.ema21 && tech.ema21 < tech.ema50) return 'bearish';
  return 'mixed';
}

export function clampScore(n: number, max = 100): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function sessionSma(candles: Candle[], period: number): number | null {
  return sma(closes(candles), period);
}

export function sessionEma(candles: Candle[], period: number): number | null {
  return ema(closes(candles), period);
}
