import type { ScreenerMarketRow } from './screenerDataService';

export type ReadyMadeBias = 'bullish' | 'bearish' | 'neutral';

export type ReadyMadeCategoryId =
  | 'intraday'
  | 'momentum'
  | 'breakout'
  | 'volume'
  | 'gap'
  | 'mean-reversion'
  | 'fno'
  | 'sector'
  | 'trend';

export interface ReadyMadeScreenerDef {
  id: string;
  category: ReadyMadeCategoryId;
  categoryLabel: string;
  title: string;
  description: string;
  bias: ReadyMadeBias;
  match: (row: ScreenerMarketRow) => boolean;
  /** Higher = better fit for this screener */
  score: (row: ScreenerMarketRow) => number;
}

export interface ReadyMadeHit {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  volumeRatio: number;
  rsi14: number;
  aiScore: number;
  signal: ScreenerMarketRow['signal'];
  matchScore: number;
}

export interface ReadyMadeScreenerResult {
  def: ReadyMadeScreenerDef;
  stocks: ReadyMadeHit[];
}

const CATEGORY_ORDER: ReadyMadeCategoryId[] = [
  'intraday',
  'momentum',
  'breakout',
  'volume',
  'gap',
  'mean-reversion',
  'fno',
  'sector',
  'trend',
];

function sectorHas(row: ScreenerMarketRow, needle: string) {
  return `${row.sector} ${row.industry}`.toLowerCase().includes(needle.toLowerCase());
}

/** Research-based ready-made NSE F&O stock screeners — live rows scored client-side */
export const READY_MADE_SCREENERS: ReadyMadeScreenerDef[] = [
  // ─── Intraday ───
  {
    id: 'id-momentum',
    category: 'intraday',
    categoryLabel: 'Intraday',
    title: 'Intraday Momentum',
    description: 'Strong session move with volume confirmation — classic day-trade candidates.',
    bias: 'bullish',
    match: (r) => r.changePercent >= 1.2 && r.volumeRatio >= 1.25 && r.rsi14 >= 52,
    score: (r) => r.changePercent * 8 + r.volumeRatio * 12 + (r.rsi14 - 50),
  },
  {
    id: 'id-vwap-long',
    category: 'intraday',
    categoryLabel: 'Intraday',
    title: 'VWAP Long Bias',
    description: 'Price holding above VWAP with positive change — institutional long bias.',
    bias: 'bullish',
    match: (r) => r.price > r.vwap && r.priceVsVwap > 0.15 && r.changePercent > 0.4 && r.volumeRatio > 1.05,
    score: (r) => r.priceVsVwap * 20 + r.changePercent * 6 + r.volumeRatio * 8,
  },
  {
    id: 'id-vwap-short',
    category: 'intraday',
    categoryLabel: 'Intraday',
    title: 'VWAP Short Bias',
    description: 'Trading below VWAP with selling pressure — intraday short setups.',
    bias: 'bearish',
    match: (r) => r.price < r.vwap && r.priceVsVwap < -0.15 && r.changePercent < -0.4 && r.volumeRatio > 1.05,
    score: (r) => Math.abs(r.priceVsVwap) * 20 + Math.abs(r.changePercent) * 6 + r.volumeRatio * 8,
  },
  {
    id: 'id-range-expand',
    category: 'intraday',
    categoryLabel: 'Intraday',
    title: 'Range Expansion',
    description: 'Wide day range with active volume — volatility day-trade names.',
    bias: 'neutral',
    match: (r) => r.dayRangePercent >= 2.2 && r.volumeRatio >= 1.2,
    score: (r) => r.dayRangePercent * 10 + r.volumeRatio * 10 + Math.abs(r.changePercent) * 4,
  },
  {
    id: 'id-orb',
    category: 'intraday',
    categoryLabel: 'Intraday',
    title: 'Opening Drive',
    description: 'Gap + continuation in same direction — opening-drive style movers.',
    bias: 'bullish',
    match: (r) => r.gapPercent >= 0.6 && r.changePercent >= 0.8 && r.volumeRatio >= 1.15,
    score: (r) => r.gapPercent * 15 + r.changePercent * 8 + r.volumeRatio * 6,
  },
  {
    id: 'id-aggressive-short',
    category: 'intraday',
    categoryLabel: 'Intraday',
    title: 'Intraday Weakness',
    description: 'Sharp downside with volume — short / put bias for the session.',
    bias: 'bearish',
    match: (r) => r.changePercent <= -1.2 && r.volumeRatio >= 1.2 && r.rsi14 <= 48,
    score: (r) => Math.abs(r.changePercent) * 8 + r.volumeRatio * 12 + (50 - r.rsi14),
  },

  // ─── Momentum ───
  {
    id: 'mom-rsi-burst',
    category: 'momentum',
    categoryLabel: 'Momentum',
    title: 'RSI Momentum Burst',
    description: 'RSI > 60 with rising price and volume — momentum continuation.',
    bias: 'bullish',
    match: (r) => r.rsi14 >= 60 && r.changePercent >= 0.8 && r.volumeRatio >= 1.1,
    score: (r) => (r.rsi14 - 50) * 2 + r.changePercent * 10 + r.volumeRatio * 8,
  },
  {
    id: 'mom-ai-leaders',
    category: 'momentum',
    categoryLabel: 'Momentum',
    title: 'AI Score Leaders',
    description: 'Highest composite AI score with bullish signal from live tape.',
    bias: 'bullish',
    match: (r) => r.aiScore >= 68 && r.signal !== 'SELL' && r.changePercent > 0,
    score: (r) => r.aiScore * 1.5 + r.changePercent * 5,
  },
  {
    id: 'mom-ema-stack',
    category: 'momentum',
    categoryLabel: 'Momentum',
    title: 'EMA Stack Bullish',
    description: 'Close above EMA9 > EMA20 — short-term trend alignment.',
    bias: 'bullish',
    match: (r) => r.close > r.ema9 && r.ema9 > r.ema20 && r.changePercent > 0.3,
    score: (r) => (r.ema9 - r.ema20) / Math.max(r.price, 1) * 1000 + r.changePercent * 8,
  },
  {
    id: 'mom-macd',
    category: 'momentum',
    categoryLabel: 'Momentum',
    title: 'MACD Positive Cross',
    description: 'MACD above signal with positive histogram — momentum turn.',
    bias: 'bullish',
    match: (r) => r.macd > r.macdSignal && r.macdHist > 0 && r.changePercent > 0,
    score: (r) => r.macdHist * 40 + r.changePercent * 6 + r.volumeRatio * 5,
  },

  // ─── Breakout ───
  {
    id: 'bo-fresh',
    category: 'breakout',
    categoryLabel: 'Breakout',
    title: 'Fresh Breakouts',
    description: 'Price above VWAP & EMA20 with volume — confirmed breakout print.',
    bias: 'bullish',
    match: (r) => r.breakout === true && r.volumeRatio >= 1.15,
    score: (r) => r.aiScore + r.volumeRatio * 15 + r.changePercent * 6,
  },
  {
    id: 'bo-20d-high',
    category: 'breakout',
    categoryLabel: 'Breakout',
    title: 'Near 20D High',
    description: 'Trading near recent 20-day high — breakout extension risk/reward.',
    bias: 'bullish',
    match: (r) => r.maxHigh20 > 0 && r.close >= r.maxHigh20 * 0.985 && r.changePercent > 0.2,
    score: (r) => (r.close / Math.max(r.maxHigh20, 1)) * 100 + r.volumeRatio * 10,
  },
  {
    id: 'bo-bb-upper',
    category: 'breakout',
    categoryLabel: 'Breakout',
    title: 'Bollinger Upper Band',
    description: 'Price pressing upper BB with volume — volatility breakout.',
    bias: 'bullish',
    match: (r) => r.bbPercentB >= 0.85 && r.volumeRatio >= 1.1 && r.changePercent > 0.5,
    score: (r) => r.bbPercentB * 40 + r.volumeRatio * 12 + r.changePercent * 5,
  },

  // ─── Volume ───
  {
    id: 'vol-unusual',
    category: 'volume',
    categoryLabel: 'Volume',
    title: 'Unusual Volume',
    description: 'Volume ≥ 1.4× average — smart-money interest today.',
    bias: 'neutral',
    match: (r) => r.volumeRatio >= 1.4,
    score: (r) => r.volumeRatio * 25 + Math.abs(r.changePercent) * 5,
  },
  {
    id: 'vol-delivery',
    category: 'volume',
    categoryLabel: 'Volume',
    title: 'High Delivery + Volume',
    description: 'Delivery-heavy with rising volume — positional accumulation cue.',
    bias: 'bullish',
    match: (r) => r.delivery >= 40 && r.volumeRatio >= 1.15 && r.changePercent > 0,
    score: (r) => r.delivery * 0.8 + r.volumeRatio * 15 + r.changePercent * 6,
  },
  {
    id: 'vol-spike-up',
    category: 'volume',
    categoryLabel: 'Volume',
    title: 'Volume Spike Up',
    description: 'Big volume on green candle — demand-driven spike.',
    bias: 'bullish',
    match: (r) => r.volumeRatio >= 1.5 && r.changePercent >= 1,
    score: (r) => r.volumeRatio * 20 + r.changePercent * 10,
  },
  {
    id: 'vol-spike-down',
    category: 'volume',
    categoryLabel: 'Volume',
    title: 'Volume Spike Down',
    description: 'Big volume on red candle — distribution / panic selling.',
    bias: 'bearish',
    match: (r) => r.volumeRatio >= 1.5 && r.changePercent <= -1,
    score: (r) => r.volumeRatio * 20 + Math.abs(r.changePercent) * 10,
  },

  // ─── Gap ───
  {
    id: 'gap-up-go',
    category: 'gap',
    categoryLabel: 'Gap',
    title: 'Gap Up & Go',
    description: 'Gap up holding gains — continuation longs.',
    bias: 'bullish',
    match: (r) => r.gapPercent >= 0.8 && r.changePercent >= 0.5,
    score: (r) => r.gapPercent * 18 + r.changePercent * 8 + r.volumeRatio * 6,
  },
  {
    id: 'gap-down-fade',
    category: 'gap',
    categoryLabel: 'Gap',
    title: 'Gap Down Pressure',
    description: 'Gap down with further weakness — avoid longs / short bias.',
    bias: 'bearish',
    match: (r) => r.gapPercent <= -0.8 && r.changePercent <= -0.4,
    score: (r) => Math.abs(r.gapPercent) * 18 + Math.abs(r.changePercent) * 8 + r.volumeRatio * 6,
  },
  {
    id: 'gap-fill-watch',
    category: 'gap',
    categoryLabel: 'Gap',
    title: 'Gap Fill Watch',
    description: 'Opened with a gap but session move is fading — classic gap-fill candidates.',
    bias: 'neutral',
    match: (r) =>
      Math.abs(r.gapPercent) >= 0.7 && Math.abs(r.changePercent) < Math.abs(r.gapPercent) * 0.55,
    score: (r) => Math.abs(r.gapPercent) * 12 + r.volumeRatio * 8,
  },

  // ─── Mean reversion ───
  {
    id: 'mr-oversold',
    category: 'mean-reversion',
    categoryLabel: 'Mean Reversion',
    title: 'Oversold Bounce',
    description: 'RSI oversold with stabilizing tape — bounce candidates.',
    bias: 'bullish',
    match: (r) => r.rsi14 <= 32 && r.changePercent > -3 && r.volumeRatio >= 1,
    score: (r) => (35 - r.rsi14) * 3 + r.volumeRatio * 8 - Math.min(0, r.changePercent),
  },
  {
    id: 'mr-overbought',
    category: 'mean-reversion',
    categoryLabel: 'Mean Reversion',
    title: 'Overbought Cool-off',
    description: 'RSI stretched — pullback / profit-booking risk names.',
    bias: 'bearish',
    match: (r) => r.rsi14 >= 72 && r.changePercent > 0.5,
    score: (r) => (r.rsi14 - 65) * 3 + r.changePercent * 5,
  },
  {
    id: 'mr-bb-lower',
    category: 'mean-reversion',
    categoryLabel: 'Mean Reversion',
    title: 'Lower Band Support',
    description: 'Near lower Bollinger band — potential mean-reversion long.',
    bias: 'bullish',
    match: (r) => r.bbPercentB <= 0.2 && r.rsi14 < 40,
    score: (r) => (0.25 - r.bbPercentB) * 50 + (40 - r.rsi14),
  },

  // ─── F&O / OI ───
  {
    id: 'fno-oi-long',
    category: 'fno',
    categoryLabel: 'F&O / OI',
    title: 'OI Build-up Long',
    description: 'Rising OI with price up — long buildup proxy on F&O names.',
    bias: 'bullish',
    match: (r) => r.isFno && r.oiChange >= 3 && r.changePercent > 0.4 && r.volumeRatio > 1.05,
    score: (r) => r.oiChange * 4 + r.changePercent * 8 + r.volumeRatio * 6,
  },
  {
    id: 'fno-oi-short',
    category: 'fno',
    categoryLabel: 'F&O / OI',
    title: 'OI Build-up Short',
    description: 'Rising OI with price down — short buildup proxy.',
    bias: 'bearish',
    match: (r) => r.isFno && r.oiChange >= 3 && r.changePercent < -0.4 && r.volumeRatio > 1.05,
    score: (r) => r.oiChange * 4 + Math.abs(r.changePercent) * 8 + r.volumeRatio * 6,
  },
  {
    id: 'fno-active',
    category: 'fno',
    categoryLabel: 'F&O / OI',
    title: 'Most Active F&O',
    description: 'F&O stocks with heavy volume vs average — gamma / vol interest.',
    bias: 'neutral',
    match: (r) => r.isFno && r.volumeRatio >= 1.3,
    score: (r) => r.volumeRatio * 20 + Math.abs(r.changePercent) * 6 + Math.abs(r.oiChange) * 2,
  },
  {
    id: 'fno-nifty50',
    category: 'fno',
    categoryLabel: 'F&O / OI',
    title: 'Nifty 50 Movers',
    description: 'Index heavyweights with meaningful session move.',
    bias: 'neutral',
    match: (r) => r.inNifty50 && Math.abs(r.changePercent) >= 0.8 && r.volumeRatio >= 1.05,
    score: (r) => Math.abs(r.changePercent) * 12 + r.volumeRatio * 8 + r.aiScore * 0.3,
  },

  // ─── Sector ───
  {
    id: 'sec-banking',
    category: 'sector',
    categoryLabel: 'Sector',
    title: 'Banking Strength',
    description: 'Bank / financial names with bullish session tape.',
    bias: 'bullish',
    match: (r) =>
      (sectorHas(r, 'bank') || sectorHas(r, 'financ') || r.inBankNifty) &&
      r.changePercent >= 0.6 &&
      r.volumeRatio >= 1.05,
    score: (r) => r.changePercent * 10 + r.volumeRatio * 8 + r.aiScore * 0.4,
  },
  {
    id: 'sec-it',
    category: 'sector',
    categoryLabel: 'Sector',
    title: 'IT Momentum',
    description: 'IT / software names leading on price + volume.',
    bias: 'bullish',
    match: (r) =>
      (sectorHas(r, 'it') || sectorHas(r, 'tech') || sectorHas(r, 'software')) &&
      r.changePercent >= 0.7 &&
      r.volumeRatio >= 1.05,
    score: (r) => r.changePercent * 10 + r.volumeRatio * 8 + r.aiScore * 0.4,
  },
  {
    id: 'sec-auto',
    category: 'sector',
    categoryLabel: 'Sector',
    title: 'Auto Movers',
    description: 'Auto / auto-ancillary strength today.',
    bias: 'bullish',
    match: (r) => sectorHas(r, 'auto') && r.changePercent >= 0.7 && r.volumeRatio >= 1.05,
    score: (r) => r.changePercent * 10 + r.volumeRatio * 8,
  },
  {
    id: 'sec-pharma',
    category: 'sector',
    categoryLabel: 'Sector',
    title: 'Pharma / Healthcare',
    description: 'Pharma & healthcare relative strength.',
    bias: 'bullish',
    match: (r) =>
      (sectorHas(r, 'pharma') || sectorHas(r, 'health') || sectorHas(r, 'drug')) &&
      r.changePercent >= 0.6 &&
      r.volumeRatio >= 1.05,
    score: (r) => r.changePercent * 10 + r.volumeRatio * 8,
  },
  {
    id: 'sec-metal',
    category: 'sector',
    categoryLabel: 'Sector',
    title: 'Metal Strength',
    description: 'Metals / mining with bullish tape.',
    bias: 'bullish',
    match: (r) =>
      (sectorHas(r, 'metal') || sectorHas(r, 'steel') || sectorHas(r, 'mining')) &&
      r.changePercent >= 0.8 &&
      r.volumeRatio >= 1.1,
    score: (r) => r.changePercent * 10 + r.volumeRatio * 8,
  },

  // ─── Trend ───
  {
    id: 'tr-adx',
    category: 'trend',
    categoryLabel: 'Trend',
    title: 'ADX Strong Trend',
    description: 'ADX > 22 with price above EMA20 — trending names.',
    bias: 'bullish',
    match: (r) => r.adx >= 22 && r.close > r.ema20 && r.changePercent > 0,
    score: (r) => r.adx + r.changePercent * 6 + r.volumeRatio * 5,
  },
  {
    id: 'tr-sma-stack',
    category: 'trend',
    categoryLabel: 'Trend',
    title: 'SMA20 / SMA50 Uptrend',
    description: 'Close above SMA20 and SMA50 — intermediate uptrend filter.',
    bias: 'bullish',
    match: (r) => r.close > r.sma20 && r.close > r.sma50 && r.sma20 > r.sma50 && r.changePercent > 0,
    score: (r) => r.changePercent * 8 + (r.sma20 - r.sma50) / Math.max(r.price, 1) * 800 + r.aiScore * 0.3,
  },
  {
    id: 'tr-supertrend',
    category: 'trend',
    categoryLabel: 'Trend',
    title: 'Above Supertrend',
    description: 'Price holding above Supertrend with volume support.',
    bias: 'bullish',
    match: (r) => r.close > r.supertrend && r.volumeRatio >= 1.05 && r.changePercent > 0.2,
    score: (r) => ((r.close - r.supertrend) / Math.max(r.price, 1)) * 500 + r.changePercent * 8,
  },
];

export function getReadyMadeCategoryOrder(): ReadyMadeCategoryId[] {
  return CATEGORY_ORDER;
}

export function runReadyMadeScreener(
  rows: ScreenerMarketRow[],
  def: ReadyMadeScreenerDef,
  limit = 5,
): ReadyMadeHit[] {
  return rows
    .filter((row) => {
      try {
        return def.match(row);
      } catch {
        return false;
      }
    })
    .map((row) => {
      let matchScore = 0;
      try {
        matchScore = def.score(row);
      } catch {
        matchScore = row.aiScore;
      }
      return {
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        price: row.price,
        changePercent: row.changePercent,
        volumeRatio: row.volumeRatio,
        rsi14: row.rsi14,
        aiScore: row.aiScore,
        signal: row.signal,
        matchScore,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

export function runAllReadyMadeScreeners(
  rows: ScreenerMarketRow[],
  limit = 5,
): ReadyMadeScreenerResult[] {
  return READY_MADE_SCREENERS.map((def) => ({
    def,
    stocks: runReadyMadeScreener(rows, def, limit),
  }));
}

export function groupReadyMadeByCategory(
  results: ReadyMadeScreenerResult[],
): { category: ReadyMadeCategoryId; categoryLabel: string; screeners: ReadyMadeScreenerResult[] }[] {
  return CATEGORY_ORDER.map((category) => {
    const screeners = results.filter((r) => r.def.category === category);
    return {
      category,
      categoryLabel: screeners[0]?.def.categoryLabel ?? category,
      screeners,
    };
  }).filter((g) => g.screeners.length > 0);
}
