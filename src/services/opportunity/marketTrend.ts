/**
 * Opportunity header market trend — NIFTY-led, confirmed by BANKNIFTY / SENSEX
 * plus NIFTY 15m and daily structure. Never invents prices.
 */
import type { MarketDataProvider } from '../radar/MarketDataProvider';
import type { Candle } from '../radar/radarTypes';
import { analyzeTechnical } from '../radar/TechnicalEngine';
import { detectStructure } from '../radar/StructureEngine';
import { emaAlignment } from './featureSnapshot';

export type MarketTrendBias = 'bullish' | 'bearish' | 'neutral';

export type MarketTrendQuote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
};

export type MarketTrendState = {
  bias: MarketTrendBias;
  available: boolean;
  label: string;
  reason: string;
};

export type MarketTrendInput = {
  quotes: MarketTrendQuote[];
  niftyIntraday: Candle[] | null;
  niftyDaily: Candle[] | null;
};

const INDEX_WEIGHT: Record<string, number> = {
  NIFTY: 2,
  BANKNIFTY: 1,
  SENSEX: 1,
};

const DAY_NOISE_PCT = 0.2;
const DAY_CONFLICT_PCT = 0.35;
const VWAP_EDGE_PCT = 0.08;
const MIN_EVIDENCE = 3;
const MIN_MARGIN = 2;

const EMPTY: MarketTrendState = {
  bias: 'neutral',
  available: false,
  label: '—',
  reason: 'Connect live data to read market trend.',
};

function quoteOf(quotes: MarketTrendQuote[], symbol: string): MarketTrendQuote | undefined {
  return quotes.find((q) => q.symbol === symbol);
}

function liveChange(q: MarketTrendQuote | undefined): number | null {
  if (!q || !(Number(q.price) > 0)) return null;
  const chg = Number(q.changePercent);
  return Number.isFinite(chg) ? chg : null;
}

function daySide(chg: number | null, floor = DAY_NOISE_PCT): -1 | 0 | 1 {
  if (chg == null) return 0;
  if (chg >= floor) return 1;
  if (chg <= -floor) return -1;
  return 0;
}

function fmtChg(chg: number | null): string {
  if (chg == null) return 'n/a';
  const sign = chg > 0 ? '+' : '';
  return `${sign}${chg.toFixed(2)}%`;
}

function addVote(
  scores: { bull: number; bear: number },
  side: MarketTrendBias | 'mixed',
  weight: number,
  notes: string[],
  note: string,
) {
  if (weight <= 0 || side === 'mixed' || side === 'neutral') return;
  if (side === 'bullish') scores.bull += weight;
  else scores.bear += weight;
  notes.push(note);
}

function candleVotes(candles: Candle[] | null, label: string, useVwap: boolean): {
  bull: number;
  bear: number;
  notes: string[];
} {
  const scores = { bull: 0, bear: 0 };
  const notes: string[] = [];
  if (!candles || candles.length < 50) return { ...scores, notes };

  const tech = analyzeTechnical(candles);
  if (!(tech.last > 0)) return { ...scores, notes };

  const structure = detectStructure(candles, label === 'daily' ? '1D' : '15m');
  if (structure.direction === 'bullish' || structure.direction === 'bearish') {
    addVote(scores, structure.direction, 2, notes, `${label} ${structure.note.toLowerCase()}`);
  }

  const ema = emaAlignment(tech);
  if (ema === 'bullish' || ema === 'bearish') {
    addVote(scores, ema, 1, notes, `${label} EMA 21/50 ${ema}`);
  }

  if (tech.trend === 'up') addVote(scores, 'bullish', 1, notes, `${label} price above EMA stack`);
  else if (tech.trend === 'down') addVote(scores, 'bearish', 1, notes, `${label} price below EMA stack`);

  if (useVwap && tech.vwap && tech.vwap > 0) {
    const dist = ((tech.last - tech.vwap) / tech.vwap) * 100;
    if (dist >= VWAP_EDGE_PCT) addVote(scores, 'bullish', 1, notes, `${label} above VWAP`);
    else if (dist <= -VWAP_EDGE_PCT) addVote(scores, 'bearish', 1, notes, `${label} below VWAP`);
  }

  if (tech.rsi14 != null) {
    if (tech.rsi14 >= 58) addVote(scores, 'bullish', 1, notes, `${label} RSI ${tech.rsi14.toFixed(0)}`);
    else if (tech.rsi14 <= 42) addVote(scores, 'bearish', 1, notes, `${label} RSI ${tech.rsi14.toFixed(0)}`);
  }

  return { ...scores, notes };
}

export function emptyMarketTrend(reason = EMPTY.reason): MarketTrendState {
  return { ...EMPTY, reason };
}

export function decideMarketTrend(input: MarketTrendInput): MarketTrendState {
  const niftyChg = liveChange(quoteOf(input.quotes, 'NIFTY'));
  const bnChg = liveChange(quoteOf(input.quotes, 'BANKNIFTY'));
  const sxChg = liveChange(quoteOf(input.quotes, 'SENSEX'));
  const hasQuote = niftyChg != null || bnChg != null || sxChg != null;
  const hasBars =
    (input.niftyIntraday?.length ?? 0) >= 50 || (input.niftyDaily?.length ?? 0) >= 50;

  if (!hasQuote && !hasBars) return emptyMarketTrend();

  const scores = { bull: 0, bear: 0 };
  const notes: string[] = [];

  const niftySide = daySide(niftyChg);
  const bnSide = daySide(bnChg);
  const conflict =
    niftySide !== 0 &&
    bnSide !== 0 &&
    niftySide !== bnSide &&
    Math.abs(niftyChg ?? 0) >= DAY_CONFLICT_PCT &&
    Math.abs(bnChg ?? 0) >= DAY_CONFLICT_PCT;

  notes.push(`NIFTY ${fmtChg(niftyChg)} · BN ${fmtChg(bnChg)} · SENSEX ${fmtChg(sxChg)}`);

  if (conflict) {
    notes.push('NIFTY and BANKNIFTY day moves disagree — quotes not used as a vote');
  } else {
    for (const [symbol, chg] of [
      ['NIFTY', niftyChg],
      ['BANKNIFTY', bnChg],
      ['SENSEX', sxChg],
    ] as const) {
      const side = daySide(chg);
      if (side === 0) continue;
      const weight = INDEX_WEIGHT[symbol] ?? 1;
      addVote(
        scores,
        side > 0 ? 'bullish' : 'bearish',
        weight,
        notes,
        `${symbol} day ${fmtChg(chg)}`,
      );
    }
  }

  const intra = candleVotes(input.niftyIntraday, '15m', true);
  scores.bull += intra.bull;
  scores.bear += intra.bear;
  notes.push(...intra.notes);

  const daily = candleVotes(input.niftyDaily, 'daily', false);
  scores.bull += daily.bull;
  scores.bear += daily.bear;
  notes.push(...daily.notes);

  const evidence = Math.max(scores.bull, scores.bear);
  const margin = Math.abs(scores.bull - scores.bear);
  let bias: MarketTrendBias = 'neutral';
  if (evidence >= MIN_EVIDENCE && margin >= MIN_MARGIN) {
    bias = scores.bull > scores.bear ? 'bullish' : 'bearish';
  }

  const label = bias === 'bullish' ? 'Bullish' : bias === 'bearish' ? 'Bearish' : 'Neutral';
  const why =
    bias === 'neutral'
      ? evidence < MIN_EVIDENCE
        ? 'Not enough aligned evidence — treating as Neutral'
        : 'Bull and bear votes are too close — treating as Neutral'
      : `${label} on NIFTY with confirmation votes`;

  return {
    bias,
    available: true,
    label,
    reason: `${why}. ${notes.join('. ')}.`,
  };
}

async function readQuote(provider: MarketDataProvider, symbol: string): Promise<MarketTrendQuote> {
  try {
    const q = await provider.getQuote(symbol);
    const price = Number(q.price) || Number((q as { lastPrice?: number }).lastPrice) || 0;
    return {
      symbol,
      price: price > 0 ? price : null,
      changePercent: Number.isFinite(q.changePercent) ? q.changePercent : null,
    };
  } catch {
    return { symbol, price: null, changePercent: null };
  }
}

async function readBars(
  provider: MarketDataProvider,
  symbol: string,
  timeframe: '15m' | '1D',
): Promise<Candle[] | null> {
  try {
    const rows = await provider.getCandles(symbol, timeframe, 80);
    return Array.isArray(rows) && rows.length ? rows : null;
  } catch {
    return null;
  }
}

export async function loadMarketTrend(provider: MarketDataProvider): Promise<MarketTrendState> {
  const [nifty, banknifty, sensex, niftyIntraday, niftyDaily] = await Promise.all([
    readQuote(provider, 'NIFTY'),
    readQuote(provider, 'BANKNIFTY'),
    readQuote(provider, 'SENSEX'),
    readBars(provider, 'NIFTY', '15m'),
    readBars(provider, 'NIFTY', '1D'),
  ]);
  return decideMarketTrend({
    quotes: [nifty, banknifty, sensex],
    niftyIntraday,
    niftyDaily,
  });
}
