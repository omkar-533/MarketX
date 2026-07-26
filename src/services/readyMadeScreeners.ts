import type { ScreenerMarketRow } from './screenerDataService';

export type ReadyMadeBias = 'bullish' | 'bearish' | 'neutral';

export type ReadyMadeCategoryId =
  | 'momentum'
  | 'breakout'
  | 'swing'
  | 'intraday'
  | 'options'
  | 'delivery'
  | 'volume'
  | 'fundamental'
  | 'fno'
  | 'candlestick'
  | 'sector'
  | 'positional'
  | 'news'
  | 'liquidity'
  | 'smart-money';

export interface ReadyMadeScreenerDef {
  id: string;
  category: ReadyMadeCategoryId;
  categoryLabel: string;
  title: string;
  description: string;
  bias: ReadyMadeBias;
  match: (row: ScreenerMarketRow) => boolean;
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
  'momentum',
  'breakout',
  'swing',
  'intraday',
  'options',
  'delivery',
  'volume',
  'fundamental',
  'fno',
  'candlestick',
  'sector',
  'positional',
  'news',
  'liquidity',
  'smart-money',
];

const CATEGORY_LABELS: Record<ReadyMadeCategoryId, string> = {
  momentum: 'Momentum Screeners',
  breakout: 'Breakout Screeners',
  swing: 'Swing Trading Screeners',
  intraday: 'Intraday Screeners',
  options: 'Options Traders Screeners',
  delivery: 'Delivery Based Screeners',
  volume: 'Volume Screeners',
  fundamental: 'Fundamental Screeners',
  fno: 'F&O Screeners',
  candlestick: 'Candlestick Pattern Screeners',
  sector: 'Sector Screeners',
  positional: 'Positional Trading Screeners',
  news: 'News Based Screeners',
  liquidity: 'Liquidity Screeners',
  'smart-money': 'Advanced Smart Money Screeners',
};

type Row = ScreenerMarketRow;

/** Indicator scans need real OHLC-derived EMAs / RSI / highs */
function tech(r: Row) {
  return Boolean(r.hasRealTechnicals);
}

/** Delivery % is not in live quotes — use accumulation tape proxy */
function accumulation(r: Row) {
  return r.changePercent > 0 && r.volumeRatio >= 1.15 && r.close >= r.vwap && r.dayRangePercent < 4;
}

function sectorHas(r: Row, needle: string) {
  return `${r.sector} ${r.industry}`.toLowerCase().includes(needle.toLowerCase());
}

function nearHigh(r: Row, high: number, tol = 0.01) {
  return high > 0 && r.close >= high * (1 - tol);
}

function rangeTight(r: Row) {
  return r.dayRangePercent > 0 && r.dayRangePercent < 1.4 && r.atr > 0;
}

function bodyPct(r: Row) {
  return (Math.abs(r.close - r.open) / Math.max(r.price, 1)) * 100;
}

function upperWick(r: Row) {
  return r.high - Math.max(r.open, r.close);
}

function lowerWick(r: Row) {
  return Math.min(r.open, r.close) - r.low;
}

function candleRange(r: Row) {
  return Math.max(r.high - r.low, 0.0001);
}

function s(
  id: string,
  category: ReadyMadeCategoryId,
  title: string,
  description: string,
  bias: ReadyMadeBias,
  match: (row: Row) => boolean,
  score: (row: Row) => number,
): ReadyMadeScreenerDef {
  return {
    id,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    title,
    description,
    bias,
    match,
    score,
  };
}

/**
 * Full ready-made catalog. Filters use live ScreenerMarketRow fields.
 * Where exact fundamentals / news / SMC / IV feeds are not in the row,
 * proxies from price, volume, OI, delivery, PE, patterns and structure are used.
 */
export const READY_MADE_SCREENERS: ReadyMadeScreenerDef[] = [
  // ═══════════════════════════════════════════
  // 1. Momentum
  // ═══════════════════════════════════════════
  s('mom-price-ema20', 'momentum', 'Price > 20 EMA', 'Close holding above 20 EMA — short-term momentum.', 'bullish',
    (r) => tech(r) && r.close > r.ema20, (r) => ((r.close - r.ema20) / r.price) * 400 + r.changePercent * 5),
  s('mom-price-ema50', 'momentum', 'Price > 50 EMA', 'Close above 50 EMA — intermediate trend support.', 'bullish',
    (r) => tech(r) && r.close > r.ema50, (r) => ((r.close - r.ema50) / r.price) * 400 + r.changePercent * 5),
  s('mom-price-ema200', 'momentum', 'Price > 200 EMA', 'Close above 200 SMA/EMA proxy — long-term bullish structure.', 'bullish',
    (r) => tech(r) && r.close > r.sma200, (r) => ((r.close - r.sma200) / r.price) * 400 + r.changePercent * 4),
  s('mom-52w-high', 'momentum', '52 Week High Breakout', 'Near multi-week highs (50D high proxy) with volume.', 'bullish',
    (r) => tech(r) && nearHigh(r, r.maxHigh50, 0.012) && r.changePercent > 0.3 && r.volumeRatio > 1.05,
    (r) => (r.close / Math.max(r.maxHigh50, 1)) * 100 + r.volumeRatio * 10 + r.changePercent * 6),
  s('mom-ath', 'momentum', 'All Time High Breakout', 'Pressing rolling highs with strong session tape.', 'bullish',
    (r) => tech(r) && nearHigh(r, r.rollingHigh, 0.008) && r.changePercent > 0.5 && r.volumeRatio > 1.1 && r.aiScore > 60,
    (r) => r.aiScore + r.volumeRatio * 12 + r.changePercent * 8),
  s('mom-vol-bo', 'momentum', 'Volume Breakout', 'Price up with volume ≥ 1.5× average.', 'bullish',
    (r) => r.changePercent > 0.8 && r.volumeRatio >= 1.5,
    (r) => r.volumeRatio * 20 + r.changePercent * 10),
  s('mom-high-del', 'momentum', 'High Delivery Stocks', 'Accumulation tape — price up, above VWAP, elevated volume.', 'bullish',
    (r) => accumulation(r),
    (r) => r.changePercent * 6 + r.volumeRatio * 10 + r.aiScore * 0.3),
  s('mom-rs', 'momentum', 'Strong Relative Strength (RS)', 'Outperforming on change + AI score vs universe.', 'bullish',
    (r) => r.changePercent >= 1.5 && r.aiScore >= 70 && (!tech(r) || r.rsi14 >= 55),
    (r) => r.changePercent * 10 + r.aiScore * 0.8 + (r.rsi14 - 50)),

  // ═══════════════════════════════════════════
  // 2. Breakout
  // ═══════════════════════════════════════════
  s('bo-consol', 'breakout', 'Consolidation Breakout', 'Tight range expanding with volume — coiled breakout.', 'bullish',
    (r) => r.breakout && r.volumeRatio > 1.2 && r.dayRangePercent > 1.5,
    (r) => r.aiScore + r.volumeRatio * 12 + r.dayRangePercent * 4),
  s('bo-cpr', 'breakout', 'CPR Breakout', 'Close above Pivot R1 (CPR resistance proxy) with volume.', 'bullish',
    (r) => r.close > r.pivotR1 && r.changePercent > 0.4 && r.volumeRatio > 1.1,
    (r) => ((r.close - r.pivotR1) / r.price) * 500 + r.volumeRatio * 10),
  s('bo-inside', 'breakout', 'Inside Candle Breakout', 'Narrow range day breaking with momentum.', 'bullish',
    (r) => rangeTight(r) === false && r.dayRangePercent > 1.8 && r.changePercent > 0.6 && r.volumeRatio > 1.15,
    (r) => r.dayRangePercent * 8 + r.changePercent * 8 + r.volumeRatio * 8),
  s('bo-nr7', 'breakout', 'NR7 Breakout', 'Compressed ATR/range then directional burst (NR7 proxy).', 'bullish',
    (r) => r.atr > 0 && r.dayRangePercent > 2 && r.volumeRatio > 1.2 && Math.abs(r.changePercent) > 0.8,
    (r) => r.dayRangePercent * 10 + r.volumeRatio * 12 + Math.abs(r.changePercent) * 6),
  s('bo-orb', 'breakout', 'Opening Range Breakout (ORB)', 'Session extending beyond open with volume confirmation.', 'bullish',
    (r) => r.high > r.open * 1.008 && r.close > r.open && r.changePercent > 0.7 && r.volumeRatio > 1.15,
    (r) => r.changePercent * 10 + r.volumeRatio * 12 + ((r.high - r.open) / r.price) * 300),
  s('bo-triangle', 'breakout', 'Triangle Breakout', 'ADX rising from coil + breakout flag — triangle proxy.', 'bullish',
    (r) => r.breakout && r.adx >= 18 && r.adx <= 35 && r.volumeRatio > 1.15 && r.changePercent > 0.5,
    (r) => r.adx + r.volumeRatio * 10 + r.changePercent * 8),
  s('bo-cup', 'breakout', 'Cup & Handle Breakout', 'Near 20D high after constructive base + volume.', 'bullish',
    (r) => tech(r) && nearHigh(r, r.maxHigh20, 0.015) && r.rsi14 > 50 && r.rsi14 < 70 && r.volumeRatio > 1.1 && r.changePercent > 0.4,
    (r) => (r.close / Math.max(r.maxHigh20, 1)) * 80 + r.volumeRatio * 10),
  s('bo-flag', 'breakout', 'Flag & Pole Breakout', 'Strong prior thrust continuing with volume.', 'bullish',
    (r) => r.changePercent > 1.5 && r.volumeRatio > 1.25 && (!tech(r) || (r.close > r.ema20 && r.rsi14 > 55)),
    (r) => r.changePercent * 12 + r.volumeRatio * 12),

  // ═══════════════════════════════════════════
  // 3. Swing
  // ═══════════════════════════════════════════
  s('sw-supertrend', 'swing', 'Supertrend Buy', 'Price above Supertrend — swing long bias.', 'bullish',
    (r) => tech(r) && r.close > r.supertrend && r.changePercent > 0,
    (r) => ((r.close - r.supertrend) / r.price) * 400 + r.changePercent * 6),
  s('sw-ema-x', 'swing', 'EMA Crossover (20 EMA > 50 EMA)', 'Bullish EMA stack 20 > 50 with price confirmation.', 'bullish',
    (r) => tech(r) && r.ema20 > r.ema50 && r.close > r.ema20,
    (r) => ((r.ema20 - r.ema50) / r.price) * 600 + r.changePercent * 5),
  s('sw-macd', 'swing', 'MACD Bullish Crossover', 'MACD above signal with positive histogram.', 'bullish',
    (r) => tech(r) && r.macd > r.macdSignal && r.macdHist > 0,
    (r) => r.macdHist * 50 + r.changePercent * 5),
  s('sw-rsi60', 'swing', 'RSI Crossing 60', 'RSI pushing through 60 — momentum swing entry zone.', 'bullish',
    (r) => tech(r) && r.rsi14 >= 58 && r.rsi14 <= 68 && r.changePercent > 0.3,
    (r) => r.rsi14 + r.changePercent * 8 + r.volumeRatio * 5),
  s('sw-adx25', 'swing', 'ADX Above 25', 'Trending market (ADX > 25) with DI+ leadership.', 'bullish',
    (r) => r.adx >= 25 && r.adxDiPlus > r.adxDiMinus && r.changePercent > 0.3,
    (r) => r.adx + (r.adxDiPlus - r.adxDiMinus) + r.changePercent * 4),
  s('sw-vwap', 'swing', 'VWAP Breakout', 'Close reclaiming VWAP with volume.', 'bullish',
    (r) => r.close > r.vwap && r.priceVsVwap > 0.2 && r.volumeRatio > 1.1,
    (r) => r.priceVsVwap * 25 + r.volumeRatio * 10),
  s('sw-bb-sq', 'swing', 'Bollinger Band Squeeze', 'Tight BB (%B mid) then expansion — squeeze release.', 'neutral',
    (r) => tech(r) && r.bbPercentB > 0.35 && r.bbPercentB < 0.65 && r.dayRangePercent < 1.8 && r.volumeRatio > 1.05,
    (r) => (1 - Math.abs(r.bbPercentB - 0.5)) * 40 + r.volumeRatio * 8),

  // ═══════════════════════════════════════════
  // 4. Intraday
  // ═══════════════════════════════════════════
  s('id-gap-up', 'intraday', 'Gap Up Stocks', 'Opened meaningfully above prior close.', 'bullish',
    (r) => r.gapPercent >= 0.8, (r) => r.gapPercent * 20 + r.volumeRatio * 8),
  s('id-gap-down', 'intraday', 'Gap Down Stocks', 'Opened meaningfully below prior close.', 'bearish',
    (r) => r.gapPercent <= -0.8, (r) => Math.abs(r.gapPercent) * 20 + r.volumeRatio * 8),
  s('id-high-vol', 'intraday', 'High Volume Stocks', 'Session volume well above average.', 'neutral',
    (r) => r.volumeRatio >= 1.4, (r) => r.volumeRatio * 25 + Math.abs(r.changePercent) * 4),
  s('id-rvol', 'intraday', 'High Relative Volume (RVOL)', 'RVOL ≥ 2× — unusual participation.', 'neutral',
    (r) => r.volumeRatio >= 2, (r) => r.volumeRatio * 30 + Math.abs(r.changePercent) * 5),
  s('id-orb-high', 'intraday', 'Opening High Break', 'Trading above open toward day high — ORB long.', 'bullish',
    (r) => r.close > r.open && r.high > r.open * 1.01 && r.changePercent > 0.5,
    (r) => ((r.close - r.open) / r.price) * 400 + r.volumeRatio * 8),
  s('id-orb-low', 'intraday', 'Opening Low Break', 'Breaking below open — ORB short bias.', 'bearish',
    (r) => r.close < r.open && r.low < r.open * 0.99 && r.changePercent < -0.5,
    (r) => ((r.open - r.close) / r.price) * 400 + r.volumeRatio * 8),
  s('id-gainers', 'intraday', 'Top Gainers', 'Strongest % gainers on the live tape.', 'bullish',
    (r) => r.changePercent >= 1.5, (r) => r.changePercent * 15 + r.volumeRatio * 5),
  s('id-losers', 'intraday', 'Top Losers', 'Sharpest % losers on the live tape.', 'bearish',
    (r) => r.changePercent <= -1.5, (r) => Math.abs(r.changePercent) * 15 + r.volumeRatio * 5),
  s('id-active', 'intraday', 'Most Active Stocks', 'Highest traded activity (volume × RVOL).', 'neutral',
    (r) => r.volume > 0 && r.volumeRatio >= 1.2,
    (r) => Math.log10(Math.max(r.volume, 1)) * 10 + r.volumeRatio * 15),

  // ═══════════════════════════════════════════
  // 5. Options
  // ═══════════════════════════════════════════
  s('opt-oi-build', 'options', 'High OI Build-up', 'Meaningful OI % rise on F&O names.', 'neutral',
    (r) => r.isFno && r.oiChange >= 4, (r) => r.oiChange * 5 + r.volumeRatio * 8),
  s('opt-long-build', 'options', 'Long Build-up', 'OI up + price up — long buildup proxy.', 'bullish',
    (r) => r.isFno && r.oiChange >= 3 && r.changePercent > 0.4,
    (r) => r.oiChange * 4 + r.changePercent * 10),
  s('opt-short-build', 'options', 'Short Build-up', 'OI up + price down — short buildup proxy.', 'bearish',
    (r) => r.isFno && r.oiChange >= 3 && r.changePercent < -0.4,
    (r) => r.oiChange * 4 + Math.abs(r.changePercent) * 10),
  s('opt-short-cover', 'options', 'Short Covering', 'OI down + price up — covering proxy.', 'bullish',
    (r) => r.isFno && r.oiChange <= -2 && r.changePercent > 0.4,
    (r) => Math.abs(r.oiChange) * 4 + r.changePercent * 10),
  s('opt-long-unwind', 'options', 'Long Unwinding', 'OI down + price down — long unwind proxy.', 'bearish',
    (r) => r.isFno && r.oiChange <= -2 && r.changePercent < -0.4,
    (r) => Math.abs(r.oiChange) * 4 + Math.abs(r.changePercent) * 10),
  s('opt-pcr', 'options', 'Highest PCR Change', 'OI flow skew proxy via OI Δ + PE/CE pressure (volume).', 'neutral',
    (r) => r.isFno && Math.abs(r.oiChange) >= 3 && r.volumeRatio > 1.1,
    (r) => Math.abs(r.oiChange) * 6 + r.volumeRatio * 8),
  s('opt-iv-chg', 'options', 'Highest IV Change', 'Volatility expansion proxy — wide range + volume.', 'neutral',
    (r) => r.isFno && r.dayRangePercent >= 2.5 && r.volumeRatio >= 1.25,
    (r) => r.dayRangePercent * 10 + r.volumeRatio * 12),
  s('opt-maxpain', 'options', 'Max Pain Shift', 'Large OI repositioning near ATM zone (OI shock).', 'neutral',
    (r) => r.isFno && Math.abs(r.oiChange) >= 5 && Math.abs(r.changePercent) < 1.2,
    (r) => Math.abs(r.oiChange) * 8 + r.volumeRatio * 5),
  s('opt-atm-iv', 'options', 'ATM IV Rise', 'Near-money volatility interest — range + OI rising.', 'neutral',
    (r) => r.isFno && r.oiChange > 2 && r.dayRangePercent > 1.8,
    (r) => r.oiChange * 5 + r.dayRangePercent * 8),

  // ═══════════════════════════════════════════
  // 6. Delivery
  // ═══════════════════════════════════════════
  s('del-high', 'delivery', 'High Delivery %', 'Accumulation tape proxy — steady buying above VWAP.', 'bullish',
    (r) => accumulation(r) && r.changePercent >= 0.4,
    (r) => r.changePercent * 8 + r.volumeRatio * 12),
  s('del-spike', 'delivery', 'Delivery Spike', 'Elevated volume with constructive price — spike-day proxy.', 'bullish',
    (r) => r.volumeRatio >= 1.4 && r.changePercent > 0.3 && r.close >= r.vwap,
    (r) => r.volumeRatio * 15 + r.changePercent * 8),
  s('del-smart', 'delivery', 'Smart Money Buying', 'Price + volume + VWAP aligned bullish.', 'bullish',
    (r) => r.changePercent > 0.5 && r.volumeRatio > 1.15 && r.close > r.vwap,
    (r) => r.changePercent * 8 + r.volumeRatio * 10 + r.aiScore * 0.3),
  s('del-inst', 'delivery', 'Institutional Buying', 'Large-cap accumulation with volume confirmation.', 'bullish',
    (r) => (r.marketCapName === 'Large Cap' || r.inNifty50) && r.changePercent > 0.3 && r.volumeRatio >= 1.2,
    (r) => r.changePercent * 6 + r.volumeRatio * 10 + r.aiScore * 0.3),
  s('del-bulk', 'delivery', 'Bulk Deal Stocks', 'Unusual volume with contained range — bulk-deal style tape.', 'neutral',
    (r) => r.volumeRatio >= 2 && Math.abs(r.changePercent) < 2.5,
    (r) => r.volumeRatio * 20 + Math.abs(r.changePercent) * 2),
  s('del-block', 'delivery', 'Block Deal Stocks', 'Very high RVOL with stable price — block-deal proxy.', 'neutral',
    (r) => r.volumeRatio >= 2.2 && Math.abs(r.changePercent) < 1.5,
    (r) => r.volumeRatio * 22),

  // ═══════════════════════════════════════════
  // 7. Volume
  // ═══════════════════════════════════════════
  s('vol-2x', 'volume', '2x Average Volume', 'Volume ≥ 2× average.', 'neutral',
    (r) => r.volumeRatio >= 2, (r) => r.volumeRatio * 25),
  s('vol-5x', 'volume', '5x Average Volume', 'Volume ≥ 5× average — extreme participation.', 'neutral',
    (r) => r.volumeRatio >= 5, (r) => r.volumeRatio * 20),
  s('vol-shock', 'volume', 'Volume Shockers', 'RVOL ≥ 3× with meaningful price move.', 'neutral',
    (r) => r.volumeRatio >= 3 && Math.abs(r.changePercent) >= 1,
    (r) => r.volumeRatio * 18 + Math.abs(r.changePercent) * 8),
  s('vol-unusual', 'volume', 'Unusual Volume', 'Volume ≥ 1.6× without needing huge price move.', 'neutral',
    (r) => r.volumeRatio >= 1.6, (r) => r.volumeRatio * 22 + Math.abs(r.changePercent) * 3),
  s('vol-price-bo', 'volume', 'Volume with Price Breakout', 'Breakout candle confirmed by volume.', 'bullish',
    (r) => r.breakout && r.volumeRatio >= 1.4 && r.changePercent > 0.6,
    (r) => r.volumeRatio * 15 + r.changePercent * 10 + r.aiScore * 0.4),

  // ═══════════════════════════════════════════
  // 8. Fundamental (proxies from PE / PB / cap / tape)
  // ═══════════════════════════════════════════
  s('fun-roe', 'fundamental', 'ROE > 20%', 'Quality tape proxy — large/mid names with constructive strength.', 'bullish',
    (r) => (r.marketCapName === 'Large Cap' || r.marketCapName === 'Mid Cap' || r.inNifty50) && r.changePercent > 0.2 && r.aiScore > 55,
    (r) => r.aiScore * 0.5 + r.changePercent * 4),
  s('fun-roce', 'fundamental', 'ROCE > 20%', 'Capital efficiency proxy — stable names holding above VWAP.', 'bullish',
    (r) => r.close > r.vwap && r.changePercent > 0 && r.volumeRatio >= 1.05 && (r.inNifty50 || r.marketCapName !== 'Small Cap'),
    (r) => r.aiScore * 0.4 + r.changePercent * 5),
  s('fun-debtfree', 'fundamental', 'Debt Free Companies', 'Conservative large-cap stability proxy.', 'bullish',
    (r) => (r.marketCapName === 'Large Cap' || r.inNifty50) && Math.abs(r.changePercent) < 2.5 && r.volumeRatio < 2.5,
    (r) => r.aiScore * 0.5 + (3 - Math.abs(r.changePercent)) * 4),
  s('fun-peg', 'fundamental', 'PEG < 1', 'Growth-at-reasonable-price proxy via momentum quality.', 'bullish',
    (r) => r.changePercent > 0.5 && r.aiScore > 55 && r.volumeRatio >= 1.1,
    (r) => r.aiScore * 0.4 + r.changePercent * 5),
  s('fun-pe-ind', 'fundamental', 'PE Below Industry PE', 'Relative value proxy — constructive but not extended names.', 'bullish',
    (r) => r.changePercent > -1 && r.changePercent < 3 && r.aiScore >= 50 && r.close <= r.vwap * 1.02,
    (r) => r.aiScore * 0.4 + (2 - Math.abs(r.changePercent)) * 3),
  s('fun-sales', 'fundamental', 'Sales Growth > 20%', 'Scale + strength proxy — rising names with volume.', 'bullish',
    (r) => r.changePercent > 0.8 && r.volumeRatio > 1.1 && r.aiScore > 60,
    (r) => r.changePercent * 8 + r.aiScore * 0.5),
  s('fun-profit', 'fundamental', 'Profit Growth > 20%', 'Earnings momentum proxy — price strength with RSI support.', 'bullish',
    (r) => r.changePercent > 1 && (!tech(r) || r.rsi14 > 52) && r.volumeRatio >= 1.1,
    (r) => r.changePercent * 8 + (r.rsi14 - 50)),
  s('fun-promoter', 'fundamental', 'Promoter Holding Increase', 'Accumulation proxy for insider-style interest.', 'bullish',
    (r) => accumulation(r) && r.volumeRatio > 1.1 && r.changePercent >= 0,
    (r) => r.volumeRatio * 10 + r.changePercent * 6 + r.aiScore * 0.3),
  s('fun-fii', 'fundamental', 'FII Buying', 'Large-cap strength with volume — FII-style flow proxy.', 'bullish',
    (r) => (r.inNifty50 || r.marketCapName === 'Large Cap') && r.changePercent > 0.6 && r.volumeRatio >= 1.15,
    (r) => r.changePercent * 10 + r.volumeRatio * 8),
  s('fun-dii', 'fundamental', 'DII Buying', 'Domestic institutional proxy — banks/PSU/large accumulation.', 'bullish',
    (r) => (sectorHas(r, 'bank') || sectorHas(r, 'psu') || r.marketCapName === 'Large Cap') && accumulation(r),
    (r) => r.volumeRatio * 8 + r.changePercent * 8),

  // ═══════════════════════════════════════════
  // 9. F&O
  // ═══════════════════════════════════════════
  s('fno-list', 'fno', 'Stocks in F&O', 'All F&O-eligible names currently in the live universe.', 'neutral',
    (r) => r.isFno, (r) => r.volumeRatio * 10 + Math.abs(r.changePercent) * 5 + r.aiScore * 0.2),
  s('fno-oi-add', 'fno', 'Highest OI Addition', 'Largest positive OI change % today.', 'neutral',
    (r) => r.isFno && r.oiChange > 2, (r) => r.oiChange * 8 + r.volumeRatio * 5),
  s('fno-high-vol', 'fno', 'Highest Volume', 'Most actively traded F&O stocks.', 'neutral',
    (r) => r.isFno && r.volumeRatio >= 1.2,
    (r) => Math.log10(Math.max(r.volume, 1)) * 12 + r.volumeRatio * 10),
  s('fno-ban', 'fno', 'Ban List', 'Extreme OI + volume stress — ban-watch proxy (not exchange ban feed).', 'bearish',
    (r) => r.isFno && r.oiChange >= 8 && r.volumeRatio >= 1.8,
    (r) => r.oiChange * 6 + r.volumeRatio * 10),
  s('fno-prem', 'fno', 'High Futures Premium', 'Price stretched above VWAP — premium-style rich valuation tape.', 'bullish',
    (r) => r.isFno && r.priceVsVwap > 0.6 && (!tech(r) || r.close > r.ema20),
    (r) => r.priceVsVwap * 30 + r.changePercent * 5),
  s('fno-fut-long', 'fno', 'Futures Long Build-up', 'F&O long buildup: OI↑ price↑ volume↑.', 'bullish',
    (r) => r.isFno && r.oiChange >= 3 && r.changePercent > 0.5 && r.volumeRatio > 1.1,
    (r) => r.oiChange * 5 + r.changePercent * 10 + r.volumeRatio * 6),

  // ═══════════════════════════════════════════
  // 10. Candlestick
  // ═══════════════════════════════════════════
  s('cd-bull-eng', 'candlestick', 'Bullish Engulfing', 'Strong green body after weakness — engulfing proxy.', 'bullish',
    (r) => r.pattern.toLowerCase().includes('bullish') || (r.close > r.open && bodyPct(r) > 1.2 && r.changePercent > 0.8 && r.volumeRatio > 1.1),
    (r) => bodyPct(r) * 8 + r.changePercent * 6),
  s('cd-bear-eng', 'candlestick', 'Bearish Engulfing', 'Strong red body after strength — engulfing proxy.', 'bearish',
    (r) => r.pattern.toLowerCase().includes('bearish') || (r.close < r.open && bodyPct(r) > 1.2 && r.changePercent < -0.8 && r.volumeRatio > 1.1),
    (r) => bodyPct(r) * 8 + Math.abs(r.changePercent) * 6),
  s('cd-hammer', 'candlestick', 'Hammer', 'Long lower wick rejection — hammer / demand.', 'bullish',
    (r) => r.pattern.toLowerCase().includes('hammer') || (lowerWick(r) > candleRange(r) * 0.5 && lowerWick(r) > upperWick(r) * 2 && r.rsi14 < 45),
    (r) => (lowerWick(r) / candleRange(r)) * 50 + (45 - Math.min(r.rsi14, 45))),
  s('cd-shoot', 'candlestick', 'Shooting Star', 'Long upper wick rejection — supply at highs.', 'bearish',
    (r) => upperWick(r) > candleRange(r) * 0.5 && upperWick(r) > lowerWick(r) * 2 && r.rsi14 > 55,
    (r) => (upperWick(r) / candleRange(r)) * 50 + (r.rsi14 - 55)),
  s('cd-morning', 'candlestick', 'Morning Star', 'Reversal from lows — morning star / bottoming proxy.', 'bullish',
    (r) => r.pattern.toLowerCase().includes('morning') || (r.rsi14 < 40 && r.changePercent > 0.6 && r.close > r.open),
    (r) => (40 - Math.min(r.rsi14, 40)) + r.changePercent * 8),
  s('cd-evening', 'candlestick', 'Evening Star', 'Reversal from highs — evening star proxy.', 'bearish',
    (r) => r.rsi14 > 65 && r.changePercent < -0.4 && upperWick(r) > lowerWick(r),
    (r) => (r.rsi14 - 60) + Math.abs(r.changePercent) * 8),
  s('cd-doji', 'candlestick', 'Doji', 'Indecision candle — small body vs range.', 'neutral',
    (r) => r.pattern.toLowerCase().includes('doji') || bodyPct(r) < 0.25 && r.dayRangePercent > 0.8,
    (r) => r.dayRangePercent * 8 + (1 - bodyPct(r)) * 10),
  s('cd-maru', 'candlestick', 'Marubozu', 'Full-body directional candle with tiny wicks.', 'neutral',
    (r) => bodyPct(r) > 1.5 && upperWick(r) / candleRange(r) < 0.1 && lowerWick(r) / candleRange(r) < 0.1,
    (r) => bodyPct(r) * 10 + r.volumeRatio * 8),

  // ═══════════════════════════════════════════
  // 11. Sector (row-level; strongest/weakest via relative move)
  // ═══════════════════════════════════════════
  s('sec-strong', 'sector', 'Strongest Sector Today', 'Leaders from strong sectors — top relative movers.', 'bullish',
    (r) => r.changePercent >= 1.2 && r.volumeRatio >= 1.1,
    (r) => r.changePercent * 12 + r.volumeRatio * 6),
  s('sec-weak', 'sector', 'Weakest Sector Today', 'Laggards — weakest session performers.', 'bearish',
    (r) => r.changePercent <= -1.2 && r.volumeRatio >= 1.05,
    (r) => Math.abs(r.changePercent) * 12 + r.volumeRatio * 6),
  s('sec-rot', 'sector', 'Sector Rotation', 'Money rotating into relative strength vs broad tape.', 'bullish',
    (r) => r.changePercent > 1 && r.volumeRatio > 1.1 && (!tech(r) || (r.rsi14 > 55 && r.close > r.ema20)),
    (r) => r.changePercent * 8 + (r.rsi14 - 50) + r.volumeRatio * 6),
  s('sec-bo', 'sector', 'Sector Breakout', 'Sector names breaking out with volume.', 'bullish',
    (r) => r.breakout && r.changePercent > 0.7,
    (r) => r.aiScore + r.changePercent * 8 + r.volumeRatio * 8),
  s('sec-rs', 'sector', 'Relative Strength by Sector', 'Best RS inside each theme — high AI + change.', 'bullish',
    (r) => r.aiScore >= 68 && r.changePercent > 0.5,
    (r) => r.aiScore + r.changePercent * 10),

  // ═══════════════════════════════════════════
  // 12. Positional
  // ═══════════════════════════════════════════
  s('pos-golden', 'positional', 'Golden Cross (50 EMA > 200 EMA)', 'EMA50 above SMA200 — classic golden cross structure.', 'bullish',
    (r) => tech(r) && r.ema50 > r.sma200 && r.close > r.ema50,
    (r) => ((r.ema50 - r.sma200) / r.price) * 500 + r.changePercent * 4),
  s('pos-death', 'positional', 'Death Cross', 'EMA50 below SMA200 — bearish long-term structure.', 'bearish',
    (r) => tech(r) && r.ema50 < r.sma200 && r.close < r.ema50,
    (r) => ((r.sma200 - r.ema50) / r.price) * 500 + Math.abs(Math.min(r.changePercent, 0)) * 4),
  s('pos-weekly', 'positional', 'Weekly Breakout', 'Near 50D high with trend — weekly breakout proxy.', 'bullish',
    (r) => tech(r) && nearHigh(r, r.maxHigh50, 0.02) && r.close > r.ema50 && r.volumeRatio > 1.1,
    (r) => (r.close / Math.max(r.maxHigh50, 1)) * 90 + r.volumeRatio * 8),
  s('pos-monthly', 'positional', 'Monthly Breakout', 'Major high break with strong AI score.', 'bullish',
    (r) => tech(r) && nearHigh(r, r.rollingHigh, 0.015) && r.aiScore > 65 && r.volumeRatio > 1.15,
    (r) => r.aiScore + r.volumeRatio * 10),
  s('pos-rev', 'positional', 'Trend Reversal', 'RSI reclaim from oversold with MACD turning up.', 'bullish',
    (r) => tech(r) && r.rsi14 > 40 && r.rsi14 < 55 && r.macdHist > 0 && r.changePercent > 0.4,
    (r) => r.macdHist * 40 + r.changePercent * 8),
  s('pos-hhhl', 'positional', 'Higher High Higher Low', 'Uptrend structure — price > EMAs and rising lows proxy.', 'bullish',
    (r) => tech(r) && r.close > r.ema20 && r.ema20 > r.ema50 && r.minLow20 > r.minLow50 * 0.98 && r.changePercent > 0,
    (r) => ((r.ema20 - r.ema50) / r.price) * 400 + r.changePercent * 5),
  s('pos-lhll', 'positional', 'Lower High Lower Low', 'Downtrend structure — price below EMAs.', 'bearish',
    (r) => tech(r) && r.close < r.ema20 && r.ema20 < r.ema50 && r.changePercent < 0,
    (r) => ((r.ema50 - r.ema20) / r.price) * 400 + Math.abs(r.changePercent) * 5),

  // ═══════════════════════════════════════════
  // 13. News (event-style proxies from tape)
  // ═══════════════════════════════════════════
  s('news-results', 'news', 'Upcoming Results', 'Pre-result volatility proxy — elevated RVOL + range.', 'neutral',
    (r) => r.volumeRatio >= 1.8 && r.dayRangePercent >= 2,
    (r) => r.volumeRatio * 15 + r.dayRangePercent * 8),
  s('news-div', 'news', 'Dividend Stocks', 'Stable large-cap quality — dividend-style names proxy.', 'bullish',
    (r) => (r.marketCapName === 'Large Cap' || r.inNifty50) && Math.abs(r.changePercent) < 1.5 && r.volumeRatio < 2,
    (r) => r.aiScore * 0.4 + (2 - Math.abs(r.changePercent)) * 5),
  s('news-bonus', 'news', 'Bonus Announcement', 'Sudden volume spike with contained move — corporate action proxy.', 'neutral',
    (r) => r.volumeRatio >= 2 && Math.abs(r.changePercent) < 2,
    (r) => r.volumeRatio * 18),
  s('news-split', 'news', 'Stock Split', 'Liquidity event proxy — unusual volume, moderate price.', 'neutral',
    (r) => r.volumeRatio >= 2.2 && Math.abs(r.changePercent) < 3,
    (r) => r.volumeRatio * 16),
  s('news-rights', 'news', 'Rights Issue', 'Dilution-event style tape — volume up, price soft.', 'bearish',
    (r) => r.volumeRatio >= 1.6 && r.changePercent < -0.5,
    (r) => r.volumeRatio * 12 + Math.abs(r.changePercent) * 6),
  s('news-insider', 'news', 'Insider Buying', 'Accumulation + price up — insider/smart-money proxy.', 'bullish',
    (r) => accumulation(r) && r.changePercent > 0.3 && r.volumeRatio > 1.1,
    (r) => r.volumeRatio * 10 + r.changePercent * 8),
  s('news-bulk', 'news', 'Bulk Deals', 'Bulk-deal style unusual volume prints.', 'neutral',
    (r) => r.volumeRatio >= 2.5, (r) => r.volumeRatio * 20 + Math.abs(r.changePercent) * 4),

  // ═══════════════════════════════════════════
  // 14. Liquidity
  // ═══════════════════════════════════════════
  s('liq-atv', 'liquidity', 'High Average Traded Value', 'High price × volume participation.', 'neutral',
    (r) => r.price * r.volume > 50_000_000 || r.volumeRatio > 1.3,
    (r) => Math.log10(Math.max(r.price * r.volume, 1)) * 8 + r.volumeRatio * 5),
  s('liq-spread', 'liquidity', 'Low Spread Stocks', 'Liquid names — high volume, tight day range vs price.', 'neutral',
    (r) => r.volumeRatio >= 1.1 && r.dayRangePercent < 2.5 && r.volume > 500_000,
    (r) => r.volumeRatio * 10 + (3 - Math.min(r.dayRangePercent, 3)) * 8),
  s('liq-mcap', 'liquidity', 'High Market Cap', 'Large-cap universe filter.', 'neutral',
    (r) => r.marketCapName === 'Large Cap' || r.inNifty50,
    (r) => Math.log10(Math.max(r.marketCap, 1)) * 10 + r.aiScore * 0.2),
  s('liq-fno', 'liquidity', 'F&O Eligible Stocks', 'Derivatives-eligible liquid names.', 'neutral',
    (r) => r.isFno, (r) => r.volumeRatio * 8 + Math.log10(Math.max(r.volume, 1)) * 6),
  s('liq-float', 'liquidity', 'High Float Stocks', 'Freely traded proxy — high volume large/mid caps.', 'neutral',
    (r) => (r.marketCapName === 'Large Cap' || r.marketCapName === 'Mid Cap') && r.volumeRatio >= 1.05,
    (r) => Math.log10(Math.max(r.marketCap, 1)) * 8 + r.volumeRatio * 8),

  // ═══════════════════════════════════════════
  // 15. Advanced Smart Money (structure proxies)
  // ═══════════════════════════════════════════
  s('smc-sweep', 'smart-money', 'Liquidity Sweep', 'Took out session extreme then reversed — sweep proxy.', 'neutral',
    (r) => (r.high > r.open * 1.015 && r.close < (r.high + r.low) / 2 && r.volumeRatio > 1.2) ||
      (r.low < r.open * 0.985 && r.close > (r.high + r.low) / 2 && r.volumeRatio > 1.2),
    (r) => r.volumeRatio * 12 + r.dayRangePercent * 6),
  s('smc-ob', 'smart-money', 'Order Block', 'Strong impulse candle with follow-through volume.', 'bullish',
    (r) => bodyPct(r) > 1.3 && r.volumeRatio > 1.25 && r.changePercent > 0.6,
    (r) => bodyPct(r) * 8 + r.volumeRatio * 12),
  s('smc-fvg', 'smart-money', 'Fair Value Gap (FVG)', 'Wide range imbalance day — FVG / inefficiency proxy.', 'neutral',
    (r) => r.dayRangePercent >= 2.8 && bodyPct(r) > 1.2,
    (r) => r.dayRangePercent * 10 + bodyPct(r) * 5),
  s('smc-bos', 'smart-money', 'Break of Structure (BOS)', 'Break of recent high/low structure with volume.', 'bullish',
    (r) => tech(r) && nearHigh(r, r.maxHigh20, 0.01) && r.volumeRatio > 1.2 && r.changePercent > 0.5,
    (r) => r.volumeRatio * 12 + r.changePercent * 8),
  s('smc-choch', 'smart-money', 'Change of Character (CHOCH)', 'Trend shift — RSI/MACD flip against prior move.', 'neutral',
    (r) => tech(r) && ((r.rsi14 > 55 && r.macdHist > 0 && r.minLow20 < r.sma20 * 0.97) ||
      (r.rsi14 < 45 && r.macdHist < 0 && r.maxHigh20 > r.sma20 * 1.03)),
    (r) => Math.abs(r.macdHist) * 40 + Math.abs(r.changePercent) * 6),
  s('smc-mitigation', 'smart-money', 'Mitigation Block', 'Return into prior impulse zone — hold above VWAP/EMA.', 'bullish',
    (r) => r.close > r.vwap && (!tech(r) || (r.close > r.ema20 && r.rsi14 > 48 && r.rsi14 < 62)) && r.volumeRatio > 1.05,
    (r) => r.priceVsVwap * 15 + r.volumeRatio * 8),
  s('smc-prem-disc', 'smart-money', 'Premium & Discount Zone', 'Discount = below VWAP/mid; Premium = extended above.', 'neutral',
    (r) => r.priceVsVwap <= -0.4 || r.priceVsVwap >= 0.7,
    (r) => Math.abs(r.priceVsVwap) * 30 + r.volumeRatio * 5),
];

export function getReadyMadeCategoryOrder(): ReadyMadeCategoryId[] {
  return CATEGORY_ORDER;
}

export function getReadyMadeCategoryLabel(id: ReadyMadeCategoryId): string {
  return CATEGORY_LABELS[id];
}

/** When OHLC avg-volume is missing, rank volume vs median of live universe */
function withSessionVolumeRatio(rows: ScreenerMarketRow[]): ScreenerMarketRow[] {
  const vols = rows.map((r) => r.volume).filter((v) => v > 0).sort((a, b) => a - b);
  const median = vols[Math.floor(vols.length / 2)] || 1;
  return rows.map((r) => {
    if (r.hasRealTechnicals && r.volumeRatio > 0) return r;
    const ratio = Number((r.volume / Math.max(median, 1)).toFixed(2));
    return { ...r, volumeRatio: Math.max(ratio, 0.01) };
  });
}

export function runReadyMadeScreener(rows: ScreenerMarketRow[], def: ReadyMadeScreenerDef, limit = 5): ReadyMadeHit[] {
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

export function runAllReadyMadeScreeners(rows: ScreenerMarketRow[], limit = 8): ReadyMadeScreenerResult[] {
  const enriched = withSessionVolumeRatio(rows);
  return READY_MADE_SCREENERS.map((def) => ({
    def,
    stocks: runReadyMadeScreener(enriched, def, limit),
  }));
}

export function groupReadyMadeByCategory(
  results: ReadyMadeScreenerResult[],
): { category: ReadyMadeCategoryId; categoryLabel: string; screeners: ReadyMadeScreenerResult[] }[] {
  return CATEGORY_ORDER.map((category) => {
    const screeners = results.filter((r) => r.def.category === category);
    return {
      category,
      categoryLabel: CATEGORY_LABELS[category],
      screeners,
    };
  }).filter((g) => g.screeners.length > 0);
}
