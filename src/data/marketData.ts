import { FNO_INDICES, getFnoInstrument, getStrikeIntervalForSpot } from './fnoUniverse';
import { buildOptionChain, buildOptionExpiries } from '../services/optionChainEngine';
import { getFnoLiveQuotes, getLiveQuote } from '../services/symbolLiveService';
import { isMarketLiveEnabled } from '../services/marketApiService';
import { getMarketConnectionState } from '../services/marketConnection';
import {
  getLiveFiiDiiData,
  getLiveHistoricalPCR,
  getLiveIntradayData,
  getLiveMarketBreadth,
  getLiveSparkline,
  isLiveSectionsActive,
} from '../services/liveMarketSections';
import { getMarketLiveState } from '../services/marketLiveStore';
import { isNseFnoMarketOpen } from '../utils/marketHours';

// ============================================================
// COMPREHENSIVE MARKET DATA ENGINE
// ============================================================

export interface IndexData {
  symbol: string; name: string; price: number; change: number; changePercent: number;
  open: number; high: number; low: number; prevClose: number; volume: number; value: number;
}

export interface StockData {
  symbol: string; name: string; price: number; change: number; changePercent: number;
  volume: number; marketCap: number; sector: string; pe: number; high: number; low: number;
  open: number; prevClose: number; delivery: number; vwap: number; rsi: number;
}

export interface OptionData {
  strike: number; ceLtp: number; ceOi: number; ceOiChg: number; ceVolume: number; ceIv: number;
  ceBid: number; ceAsk: number; peLtp: number; peOi: number; peOiChg: number; peVolume: number;
  peIv: number; peBid: number; peAsk: number; pcr: number;
  ceDelta: number; ceGamma: number; ceTheta: number; ceVega: number; ceRho: number;
  peDelta: number; peGamma: number; peTheta: number; peVega: number; peRho: number;
}

export interface CandleData { time: number; open: number; high: number; low: number; close: number; volume: number; }

export interface SignalData {
  symbol: string; name: string; signal: 'BUY' | 'SELL' | 'HOLD'; strength: number;
  entry: number; target: number; stopLoss: number; timeframe: string; reason: string; type: string;
}

export interface HeatmapData { symbol: string; name: string; sector: string; changePercent: number; marketCap: number; }

export interface StockHeatmapItem extends HeatmapData {
  price: number;
  change: number;
  volume: number;
}

export interface SectorHeatmapItem {
  sector: string;
  changePercent: number;
  marketCap: number;
  stockCount: number;
  advancers: number;
  decliners: number;
  topGainer: string;
  topLoser: string;
}

export interface OIHeatmapStrike {
  strike: number;
  ceOi: number;
  peOi: number;
  totalOi: number;
  ceOiChg: number;
  peOiChg: number;
  ceOiChgPct: number;
  peOiChgPct: number;
  isAtm: boolean;
}

export interface OIHeatmapSnapshot {
  symbol: string;
  spotPrice: number;
  atmStrike: number;
  totalCeOi: number;
  totalPeOi: number;
  pcr: number;
  strikes: OIHeatmapStrike[];
}

export interface NewsItem { id: string; title: string; source: string; time: string; category: string; impact: 'High' | 'Medium' | 'Low'; }

export interface AlertItem { id: string; symbol: string; type: string; condition: string; triggered: boolean; time: string; }

export interface WatchlistItem { symbol: string; name: string; price: number; change: number; changePercent: number; chart: number[]; }

export interface PortfolioItem { symbol: string; name: string; qty: number; avgPrice: number; ltp: number; invested: number; current: number; pnl: number; pnlPercent: number; }

export interface ScannerResult { symbol: string; name: string; sector: string; triggerPrice: number; currentPrice: number; triggerType: string; strength: number; volume: number; oi: number; }

export interface StrategyLeg { id: number; type: 'CE' | 'PE'; action: 'BUY' | 'SELL'; strike: number; premium: number; qty: number; }

export interface BuildupData { symbol: string; ceOiChg: number; peOiChg: number; priceChg: number; signal: string; }

export interface FiiDiiData { date: string; fiiCash: number; fiiFutures: number; fiiOptions: number; diiCash: number; }

export interface EarningsData { symbol: string; name: string; date: string; time: string; expectedEPS: number; prevEPS: number; }

export interface IpoData { name: string; priceRange: string; lotSize: number; openDate: string; closeDate: string; status: string; }

export interface SubscriptionPlan { id: string; name: string; price: number; period: string; features: string[]; popular: boolean; }

function isLiveFeedActive(): boolean {
  return isMarketLiveEnabled() && getMarketConnectionState().serverOk;
}

function indexFromQuote(idx: IndexData, q: NonNullable<ReturnType<typeof getLiveQuote>>): IndexData {
  return {
    ...idx,
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
    open: q.open,
    high: q.high,
    low: q.low,
    prevClose: q.prevClose,
    volume: q.volume,
  };
}

export function getIndices(): IndexData[] {
  const live = getMarketLiveState();
  if (live.indices.length) return live.indices.map((i) => ({ ...i }));

  return FNO_INDICES.map((inst) => {
    const q = getLiveQuote(inst.symbol);
    const base: IndexData = {
      symbol: inst.symbol,
      name: inst.name,
      price: inst.basePrice,
      change: 0,
      changePercent: 0,
      open: inst.basePrice,
      high: inst.basePrice,
      low: inst.basePrice,
      prevClose: inst.basePrice,
      volume: 0,
      value: 0,
    };
    return q?.price ? indexFromQuote(base, q) : base;
  });
}

export function getStocks(): StockData[] {
  const live = getMarketLiveState();
  if (live.stocks.length) return live.stocks.map((s) => ({ ...s }));

  return getFnoLiveQuotes()
    .filter((q) => q.type === 'stock')
    .map(
      (q): StockData => ({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
        marketCap: q.marketCap ?? 0,
        sector: q.sector,
        pe: q.pe ?? 0,
        high: q.high,
        low: q.low,
        open: q.open,
        prevClose: q.prevClose,
        delivery: 0,
        vwap: q.vwap ?? q.price,
        rsi: q.rsi ?? 50,
      }),
    );
}

export function getOptionChain(symbol: string = 'NIFTY', spot?: number, expiry?: string): OptionData[] {
  return buildOptionChain(symbol, spot, expiry, 21);
}

export function generateCandles(_count: number = 100): CandleData[] {
  return [];
}

export function getSignals(): SignalData[] {
  return getStocks()
    .filter((s) => Math.abs(s.changePercent) >= 0.5)
    .slice(0, 10)
    .map((stock) => {
      const isBuy = stock.changePercent > 0;
      const strength = Math.min(95, Math.floor(55 + Math.abs(stock.changePercent) * 12));
      const entry = stock.price;
      const type = stock.changePercent > 1.5 ? 'Breakout' : stock.volume > 5_000_000 ? 'Volume Spike' : 'Momentum';
      return {
        symbol: stock.symbol,
        name: stock.name,
        signal: isBuy ? 'BUY' : 'SELL',
        strength,
        entry: Math.round(entry * 100) / 100,
        target: Math.round((isBuy ? entry * 1.02 : entry * 0.98) * 100) / 100,
        stopLoss: Math.round((isBuy ? entry * 0.99 : entry * 1.01) * 100) / 100,
        timeframe: '15m',
        reason: `${type} from live quote (${stock.changePercent.toFixed(2)}%)`,
        type,
      };
    });
}

export function getHeatmapData(): HeatmapData[] {
  return getStockHeatmapData();
}

export function getStockHeatmapData(): StockHeatmapItem[] {
  return getStocks().map((s) => ({
    symbol: s.symbol,
    name: s.name,
    sector: s.sector,
    changePercent: s.changePercent,
    marketCap: s.marketCap,
    price: s.price,
    change: s.change,
    volume: s.volume,
  }));
}

export function getSectorHeatmapData(): SectorHeatmapItem[] {
  const stocks = getStocks();
  const bySector = new Map<string, StockData[]>();

  stocks.forEach((s) => {
    const list = bySector.get(s.sector) ?? [];
    list.push(s);
    bySector.set(s.sector, list);
  });

  return Array.from(bySector.entries())
    .map(([sector, list]) => {
      const totalCap = list.reduce((sum, s) => sum + s.marketCap, 0);
      const weightedChange =
        totalCap > 0
          ? list.reduce((sum, s) => sum + s.changePercent * s.marketCap, 0) / totalCap
          : 0;
      const sorted = [...list].sort((a, b) => b.changePercent - a.changePercent);
      return {
        sector,
        changePercent: Math.round(weightedChange * 100) / 100,
        marketCap: totalCap,
        stockCount: list.length,
        advancers: list.filter((s) => s.changePercent > 0).length,
        decliners: list.filter((s) => s.changePercent < 0).length,
        topGainer: sorted[0]?.symbol ?? '—',
        topLoser: sorted[sorted.length - 1]?.symbol ?? '—',
      };
    })
    .sort((a, b) => b.marketCap - a.marketCap);
}

export function getOIHeatmapData(symbol: string = 'NIFTY'): OIHeatmapSnapshot {
  const index = getIndices().find((i) => i.symbol === symbol) ?? getIndices()[0];
  const chain = getOptionChain(symbol, index.price);
  const interval = symbol === 'BANKNIFTY' ? 100 : 50;
  const atmStrike = Math.round(index.price / interval) * interval;

  const strikes: OIHeatmapStrike[] = chain.map((row) => {
    const ceOiChgPct = row.ceOi > 0 ? Math.round((row.ceOiChg / row.ceOi) * 10000) / 100 : 0;
    const peOiChgPct = row.peOi > 0 ? Math.round((row.peOiChg / row.peOi) * 10000) / 100 : 0;
    return {
      strike: row.strike,
      ceOi: row.ceOi,
      peOi: row.peOi,
      totalOi: row.ceOi + row.peOi,
      ceOiChg: row.ceOiChg,
      peOiChg: row.peOiChg,
      ceOiChgPct,
      peOiChgPct,
      isAtm: row.strike === atmStrike,
    };
  });

  const totalCeOi = strikes.reduce((sum, s) => sum + s.ceOi, 0);
  const totalPeOi = strikes.reduce((sum, s) => sum + s.peOi, 0);

  return {
    symbol,
    spotPrice: index.price,
    atmStrike,
    totalCeOi,
    totalPeOi,
    pcr: Math.round((totalPeOi / Math.max(totalCeOi, 1)) * 100) / 100,
    strikes,
  };
}

export function getGainers(count: number = 10): StockData[] { return [...getStocks()].sort((a, b) => b.changePercent - a.changePercent).slice(0, count); }
export function getLosers(count: number = 10): StockData[] { return [...getStocks()].sort((a, b) => a.changePercent - b.changePercent).slice(0, count); }
export function getMostActive(count: number = 10): StockData[] { return [...getStocks()].sort((a, b) => b.volume - a.volume).slice(0, count); }

export function getNews(): NewsItem[] {
  if (!isLiveFeedActive()) return [];

  type Mover = { symbol: string; name: string; price: number; changePercent: number };
  const movers: Mover[] = [...getStocks(), ...getIndices()]
    .filter((s) => s.price > 0)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 8);

  return movers.map((s, i) => {
    const name = s.name;
    const dir = s.changePercent >= 0 ? '▲' : '▼';
    const impact: NewsItem['impact'] =
      Math.abs(s.changePercent) > 1.5 ? 'High' : Math.abs(s.changePercent) > 0.5 ? 'Medium' : 'Low';
    return {
      id: String(i + 1),
      title: `${name} ${dir} ${Math.abs(s.changePercent).toFixed(2)}% · ₹${s.price.toLocaleString('en-IN')}`,
      source: 'TradeX Live',
      time: 'Live',
      category: 'Markets',
      impact,
    };
  });
}

export function getAlerts(): AlertItem[] {
  if (!isLiveFeedActive()) return [];
  return getStocks()
    .filter((s) => Math.abs(s.changePercent) > 1 || s.volume > 8_000_000)
    .slice(0, 6)
    .map((s, i) => ({
      id: String(i + 1),
      symbol: s.symbol,
      type: s.volume > 8_000_000 ? 'Volume Alert' : s.changePercent > 0 ? 'Breakout' : 'Price Alert',
      condition: `${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}% · vol ${(s.volume / 1_000_000).toFixed(1)}M`,
      triggered: Math.abs(s.changePercent) > 1.5,
      time: 'Live',
    }));
}

export function getWatchlist(): WatchlistItem[] {
  return getStocks().slice(0, 8).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    change: s.change,
    changePercent: s.changePercent,
    chart: isLiveSectionsActive() ? getLiveSparkline(s.symbol) : Array.from({ length: 20 }, () => s.price),
  }));
}

export function getPortfolio(): PortfolioItem[] {
  const holdings = [
    { symbol: 'RELIANCE', name: 'Reliance Industries', qty: 50, avgPrice: 2850 },
    { symbol: 'HDFCBANK', name: 'HDFC Bank', qty: 100, avgPrice: 1620 },
    { symbol: 'INFY', name: 'Infosys', qty: 75, avgPrice: 1780 },
    { symbol: 'TCS', name: 'Tata Consultancy', qty: 20, avgPrice: 4350 },
    { symbol: 'SBIN', name: 'State Bank', qty: 200, avgPrice: 780 },
  ];
  return holdings.map((h) => {
    const live = getStocks().find((s) => s.symbol === h.symbol) ?? getLiveQuote(h.symbol);
    const ltp = live && 'price' in live ? live.price : h.avgPrice;
    const invested = h.qty * h.avgPrice;
    const current = h.qty * ltp;
    const pnl = current - invested;
    return {
      symbol: h.symbol,
      name: h.name,
      qty: h.qty,
      avgPrice: h.avgPrice,
      ltp: Math.round(ltp * 100) / 100,
      invested: Math.round(invested),
      current: Math.round(current),
      pnl: Math.round(pnl),
      pnlPercent: Math.round((pnl / invested) * 10000) / 100,
    };
  });
}

function scannerStrength(s: StockData): number {
  return Math.min(95, Math.floor(55 + Math.abs(s.changePercent) * 10 + Math.log10(Math.max(s.volume, 1)) * 2));
}

function chainOiTotal(symbol: string): number {
  const chain = buildOptionChain(symbol, undefined, undefined, 11);
  return chain.reduce((sum, r) => sum + r.ceOi + r.peOi, 0);
}

export function getScannerResults(type: string): ScannerResult[] {
  const stocks = getStocks();
  const mapRow = (
    s: StockData,
    triggerType: string,
    triggerPrice: number,
  ): ScannerResult => ({
    symbol: s.symbol,
    name: s.name,
    sector: s.sector,
    triggerPrice,
    currentPrice: s.price,
    triggerType,
    strength: scannerStrength(s),
    volume: s.volume,
    oi: chainOiTotal(s.symbol),
  });

  switch (type) {
    case 'volume':
      return stocks.filter((s) => s.volume > 5_000_000).map((s) => mapRow(s, 'Volume Breakout', s.price * 0.98)).slice(0, 10);
    case 'oi':
      return stocks.filter((s) => chainOiTotal(s.symbol) > 1_000_000).map((s) => mapRow(s, 'OI Buildup', s.price * 0.99)).slice(0, 10);
    case 'gapup':
      return stocks.filter((s) => s.changePercent > 1).map((s) => mapRow(s, 'Gap Up', s.open)).slice(0, 10);
    case 'gapdown':
      return stocks.filter((s) => s.changePercent < -1).map((s) => mapRow(s, 'Gap Down', s.open)).slice(0, 10);
    case 'momentum':
      return stocks.filter((s) => Math.abs(s.changePercent) > 1.5).map((s) => mapRow(s, 'Momentum', s.prevClose)).slice(0, 10);
    case 'vwap':
      return stocks.map((s) => mapRow(s, s.price > s.vwap ? 'Above VWAP' : 'Below VWAP', s.vwap)).slice(0, 10);
    case 'delivery':
      return stocks.filter((s) => s.delivery > 0).map((s) => mapRow(s, 'High Delivery', s.price * 0.97)).slice(0, 10);
    case 'intraday':
      return stocks.filter((s) => Math.abs(s.changePercent) > 0.5).map((s) => mapRow(s, 'Intraday Move', s.open)).slice(0, 10);
    case 'priceaction':
      return stocks.filter((s) => s.high - s.low > s.price * 0.02).map((s) => mapRow(s, 'Range Break', s.low)).slice(0, 10);
    case 'gamma':
      return stocks.filter((s) => s.volume > 8_000_000).map((s) => mapRow(s, 'Gamma Spike', s.price * 1.02)).slice(0, 10);
    default:
      return [];
  }
}

export function getBuildupData(): BuildupData[] {
  return getStocks().slice(0, 15).map(s => {
    const chain = buildOptionChain(s.symbol, s.price, undefined, 11);
    const ceOiChg = chain.reduce((sum, r) => sum + r.ceOiChg, 0);
    const peOiChg = chain.reduce((sum, r) => sum + r.peOiChg, 0);
    let signal = 'Neutral';
    if (ceOiChg > 100000 && s.changePercent > 0) signal = 'Short Buildup';
    else if (ceOiChg > 100000 && s.changePercent < 0) signal = 'Long Unwinding';
    else if (peOiChg > 100000 && s.changePercent < 0) signal = 'Short Covering';
    else if (peOiChg > 100000 && s.changePercent > 0) signal = 'Long Buildup';
    return { symbol: s.symbol, ceOiChg, peOiChg, priceChg: s.changePercent, signal };
  });
}

export function getMarketBreadth() {
  if (isLiveSectionsActive()) {
    const b = getLiveMarketBreadth();
    return b;
  }
  const stocks = getStocks();
  if (!stocks.length) {
    return {
      advances: 0,
      declines: 0,
      unchanged: 0,
      advanceDeclineRatio: 0,
      newHighs: 0,
      newLows: 0,
      above20DMA: 0,
      above50DMA: 0,
      above200DMA: 0,
    };
  }
  return getLiveMarketBreadth();
}

export function getIntradayData(symbol = 'NIFTY') {
  if (isLiveSectionsActive()) {
    const live = getLiveIntradayData(symbol);
    if (live.length) return live;
  }
  return [];
}

export function getHistoricalPCR(symbol = 'NIFTY', days = 30) {
  if (isLiveSectionsActive()) return getLiveHistoricalPCR(symbol, days);
  return [];
}

export type FiiDiiFlowRow = FiiDiiData & {
  fiiCashNet: number;
  fiiCashBuy: number;
  fiiCashSell: number;
  fiiFuturesNet: number;
  fiiOptionsNet: number;
  diiCashNet: number;
};

export function getFiiDiiData(days = 30): FiiDiiFlowRow[] {
  if (isLiveSectionsActive()) {
    return getLiveFiiDiiData(days).map((r) => ({
      date: r.date,
      fiiCash: r.fiiCashNet,
      fiiFutures: r.fiiFuturesNet,
      fiiOptions: r.fiiOptionsNet,
      diiCash: r.diiCashNet,
      fiiCashNet: r.fiiCashNet,
      fiiCashBuy: r.fiiCashBuy,
      fiiCashSell: r.fiiCashSell,
      fiiFuturesNet: r.fiiFuturesNet,
      fiiOptionsNet: r.fiiOptionsNet,
      diiCashNet: r.diiCashNet,
    }));
  }
  return [];
}

export function getEarnings(): EarningsData[] {
  return [
    { symbol: 'TCS', name: 'Tata Consultancy', date: '10 Jul 2025', time: 'After Market', expectedEPS: 32.5, prevEPS: 30.8 },
    { symbol: 'INFY', name: 'Infosys', date: '11 Jul 2025', time: 'After Market', expectedEPS: 18.2, prevEPS: 17.5 },
    { symbol: 'RELIANCE', name: 'Reliance Industries', date: '15 Jul 2025', time: 'After Market', expectedEPS: 28.5, prevEPS: 26.2 },
    { symbol: 'HDFCBANK', name: 'HDFC Bank', date: '16 Jul 2025', time: 'After Market', expectedEPS: 22.8, prevEPS: 21.5 },
    { symbol: 'ICICIBANK', name: 'ICICI Bank', date: '18 Jul 2025', time: 'After Market', expectedEPS: 15.2, prevEPS: 14.8 },
    { symbol: 'SBIN', name: 'State Bank', date: '22 Jul 2025', time: 'After Market', expectedEPS: 12.5, prevEPS: 11.8 },
  ];
}

export function getIpos(): IpoData[] {
  return [
    { name: 'XYZ Technologies', priceRange: '250-265', lotSize: 56, openDate: '01 Jul 2025', closeDate: '03 Jul 2025', status: 'Open' },
    { name: 'ABC Pharma', priceRange: '450-475', lotSize: 32, openDate: '05 Jul 2025', closeDate: '07 Jul 2025', status: 'Upcoming' },
    { name: 'PQR Infra', priceRange: '120-128', lotSize: 100, openDate: '10 Jul 2025', closeDate: '12 Jul 2025', status: 'Upcoming' },
    { name: 'LMN Retail', priceRange: '380-400', lotSize: 37, openDate: '15 Jul 2025', closeDate: '17 Jul 2025', status: 'Upcoming' },
  ];
}

export function calculateMaxPain(strikes: OptionData[]): { maxPainStrike: number; painValues: { strike: number; pain: number }[] } {
  if (!strikes.length) {
    return { maxPainStrike: 0, painValues: [] };
  }

  const painValues = strikes.map(s => {
    let pain = 0;
    strikes.forEach(s2 => {
      if (s2.strike <= s.strike) pain += s2.ceOi * (s.strike - s2.strike);
      if (s2.strike >= s.strike) pain += s2.peOi * (s2.strike - s.strike);
    });
    return { strike: s.strike, pain: Math.round(pain) };
  });
  const minPain = painValues.reduce((min, p) => p.pain < min.pain ? p : min, painValues[0]);
  return { maxPainStrike: minPain.strike, painValues };
}

export function getIvPercentile(): { current: number; percentile: number; rank: number; historical: { date: string; iv: number }[] } {
  const chain = buildOptionChain('NIFTY', undefined, undefined, 15);
  const ivs = chain.flatMap((r) => [r.ceIv, r.peIv]).filter((v) => v > 0);
  const current = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : 0;
  return { current: Math.round(current * 100) / 100, percentile: 0, rank: 0, historical: [] };
}

export function getVolatilitySkew(symbol = 'NIFTY'): { strike: number; ceIv: number; peIv: number; skew: number }[] {
  return buildOptionChain(symbol, undefined, undefined, 21).map((r) => ({
    strike: r.strike,
    ceIv: r.ceIv,
    peIv: r.peIv,
    skew: Math.round((r.peIv - r.ceIv) * 100) / 100,
  }));
}

export const EXPIRY_DATES = buildOptionExpiries(8);
export const SECTORS = ['All', 'Banking', 'IT', 'Auto', 'FMCG', 'Energy', 'Pharma', 'Infra', 'Power', 'Consumer', 'NBFC', 'Cement', 'Telecom', 'Conglomerate'];

export const STRATEGY_TEMPLATES = [
  { name: 'Long Call', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0 }] },
  { name: 'Long Put', legs: [{ type: 'PE' as const, action: 'BUY' as const, strikeOffset: 0 }] },
  { name: 'Bull Call Spread', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0 }, { type: 'CE' as const, action: 'SELL' as const, strikeOffset: 1 }] },
  { name: 'Bear Put Spread', legs: [{ type: 'PE' as const, action: 'BUY' as const, strikeOffset: 0 }, { type: 'PE' as const, action: 'SELL' as const, strikeOffset: -1 }] },
  { name: 'Long Straddle', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0 }, { type: 'PE' as const, action: 'BUY' as const, strikeOffset: 0 }] },
  { name: 'Short Straddle', legs: [{ type: 'CE' as const, action: 'SELL' as const, strikeOffset: 0 }, { type: 'PE' as const, action: 'SELL' as const, strikeOffset: 0 }] },
  { name: 'Long Strangle', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 1 }, { type: 'PE' as const, action: 'BUY' as const, strikeOffset: -1 }] },
  { name: 'Iron Condor', legs: [{ type: 'PE' as const, action: 'BUY' as const, strikeOffset: -2 }, { type: 'PE' as const, action: 'SELL' as const, strikeOffset: -1 }, { type: 'CE' as const, action: 'SELL' as const, strikeOffset: 1 }, { type: 'CE' as const, action: 'BUY' as const, strikeOffset: 2 }] },
  { name: 'Butterfly Spread', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: -1 }, { type: 'CE' as const, action: 'SELL' as const, strikeOffset: 0, qty: 2 }, { type: 'CE' as const, action: 'BUY' as const, strikeOffset: 1 }] },
  { name: 'Calendar Spread', legs: [{ type: 'CE' as const, action: 'SELL' as const, strikeOffset: 0 }, { type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0 }] },
  { name: 'Iron Fly', legs: [{ type: 'PE' as const, action: 'BUY' as const, strikeOffset: -1 }, { type: 'PE' as const, action: 'SELL' as const, strikeOffset: 0 }, { type: 'CE' as const, action: 'SELL' as const, strikeOffset: 0 }, { type: 'CE' as const, action: 'BUY' as const, strikeOffset: 1 }] },
  { name: 'Ratio Spread', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0 }, { type: 'CE' as const, action: 'SELL' as const, strikeOffset: 1, qty: 2 }] },
];

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'free', name: 'Free', price: 0, period: 'month', features: ['Basic Dashboard', '5 Watchlist Items', 'Limited Scanners', 'Basic Charts'], popular: false },
  { id: 'pro', name: 'Pro', price: 499, period: 'month', features: ['All Dashboard Features', 'Unlimited Watchlist', 'All Scanners', 'Advanced Charts', 'Option Chain', 'Strategy Builder', 'Alerts (10/day)', 'Priority Support'], popular: true },
  { id: 'premium', name: 'Premium', price: 1499, period: 'month', features: ['Everything in Pro', 'Unlimited Alerts', 'Data Access', 'Custom Indicators', 'Portfolio Analytics', 'News Feed', 'Earnings Calendar', 'FII/DII Data', 'Dedicated Support', 'Team Collaboration'], popular: false },
];

// ============================================================
// 5 YEARS HISTORICAL OI DATA
// ============================================================
export interface HistoricalOIData {
  date: string;
  year: number;
  month: number;
  symbol: string;
  totalCE_OI: number;
  totalPE_OI: number;
  pcr: number;
  maxPain: number;
  spotPrice: number;
  volume: number;
}

export function getFiveYearOIData(_symbol: string = 'NIFTY'): HistoricalOIData[] {
  return [];
}

// ============================================================
// PAPER TRADING & BACKTESTING
// ============================================================
export interface PaperTrade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  pnl?: number;
  pnlPercent?: number;
  status: 'OPEN' | 'CLOSED';
  strategy?: string;
}

export interface BacktestResult {
  id: string;
  strategyName: string;
  startDate: string;
  endDate: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  trades: PaperTrade[];
}

export function getPaperTrades(): PaperTrade[] {
  return [
    { id: '1', symbol: 'NIFTY24JUN24600CE', type: 'BUY', quantity: 50, entryPrice: 125.50, exitPrice: 148.20, entryTime: '2025-06-20T09:30:00', exitTime: '2025-06-20T14:15:00', pnl: 1135, pnlPercent: 18.09, status: 'CLOSED', strategy: 'Long Call' },
    { id: '2', symbol: 'BANKNIFTY24JUN52500PE', type: 'SELL', quantity: 25, entryPrice: 185.30, exitPrice: 142.50, entryTime: '2025-06-20T10:15:00', exitTime: '2025-06-20T15:20:00', pnl: 1070, pnlPercent: 23.10, status: 'CLOSED', strategy: 'Short Put' },
    { id: '3', symbol: 'RELIANCE', type: 'BUY', quantity: 100, entryPrice: 2950.00, entryTime: '2025-06-21T09:45:00', status: 'OPEN', strategy: 'Swing Trade' },
    { id: '4', symbol: 'NIFTY24JUN24500PE', type: 'BUY', quantity: 50, entryPrice: 98.40, entryTime: '2025-06-21T11:20:00', status: 'OPEN', strategy: 'Long Put' },
    { id: '5', symbol: 'TCS', type: 'SELL', quantity: 50, entryPrice: 4285.00, exitPrice: 4258.60, entryTime: '2025-06-19T14:30:00', exitTime: '2025-06-20T10:00:00', pnl: 1320, pnlPercent: 0.62, status: 'CLOSED', strategy: 'Intraday Short' },
  ];
}

export function getBacktestResults(): BacktestResult[] {
  return [
    {
      id: 'bt1',
      strategyName: 'Iron Condor NIFTY',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      totalTrades: 48,
      winningTrades: 36,
      losingTrades: 12,
      winRate: 75.0,
      totalPnl: 125000,
      maxDrawdown: -18500,
      sharpeRatio: 1.85,
      profitFactor: 2.4,
      avgWin: 4200,
      avgLoss: -2800,
      trades: [],
    },
    {
      id: 'bt2',
      strategyName: 'Bull Call Spread',
      startDate: '2024-06-01',
      endDate: '2024-12-31',
      totalTrades: 28,
      winningTrades: 19,
      losingTrades: 9,
      winRate: 67.9,
      totalPnl: 68500,
      maxDrawdown: -12300,
      sharpeRatio: 1.42,
      profitFactor: 1.9,
      avgWin: 3800,
      avgLoss: -2400,
      trades: [],
    },
  ];
}

// ============================================================
// OPTIONS SIMULATOR
// ============================================================
export interface SimulatorPosition {
  id: string;
  symbol: string;
  type: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  strike: number;
  premium: number;
  quantity: number;
  expiry: string;
}

export interface SimulatorResult {
  spotPrice: number;
  totalPnl: number;
  pnlPercent: number;
  breakevens: number[];
  maxProfit: number;
  maxLoss: number;
}

export function simulateOptionsStrategy(positions: SimulatorPosition[], spotPrice: number): SimulatorResult {
  let totalPnl = 0;
  let totalPremium = 0;
  
  positions.forEach(pos => {
    const intrinsic = pos.type === 'CE' 
      ? Math.max(0, spotPrice - pos.strike)
      : Math.max(0, pos.strike - spotPrice);
    const pnl = pos.action === 'BUY'
      ? (intrinsic - pos.premium) * pos.quantity
      : (pos.premium - intrinsic) * pos.quantity;
    totalPnl += pnl;
    totalPremium += pos.premium * pos.quantity * (pos.action === 'BUY' ? 1 : -1);
  });
  
  const pnlPercent = totalPremium !== 0 ? (totalPnl / Math.abs(totalPremium)) * 100 : 0;
  
  return {
    spotPrice,
    totalPnl: Math.round(totalPnl),
    pnlPercent: Math.round(pnlPercent * 100) / 100,
    breakevens: [],
    maxProfit: 0,
    maxLoss: 0,
  };
}

// ============================================================
// PROFESSIONAL OI INTELLIGENCE ENGINE
// ============================================================
export type BuildupSignal = 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding' | 'Neutral';

export interface FuturesOIData {
  symbol: string;
  spotPrice: number;
  futuresPrice: number;
  premiumDiscount: number;
  futuresOi: number;
  futuresOiChange: number;
  futuresVolume: number;
  rolloverPercent: number;
  expiryShift: string;
  priceChange: number;
  signal: BuildupSignal;
  trendStrength: 'Strong' | 'Moderate' | 'Weak';
}

export interface OIIntelligenceData {
  symbol: string;
  spotPrice: number;
  atmStrike: number;
  totalCeOi: number;
  totalPeOi: number;
  totalCeOiChange: number;
  totalPeOiChange: number;
  overallPcr: number;
  atmPcr: number;
  maxPain: number;
  strongestSupport: number;
  strongestResistance: number;
  marketBias: 'Bullish' | 'Bearish' | 'Neutral' | 'Highly Bullish' | 'Highly Bearish';
  smartMoneySignal: string;
  institutionalPositioning: string;
  reversalProbability: number;
  fakeBreakoutRisk: number;
  oiTrapRisk: number;
  callWriting: { strike: number; oi: number; change: number }[];
  putWriting: { strike: number; oi: number; change: number }[];
  callUnwinding: { strike: number; oi: number; change: number }[];
  putUnwinding: { strike: number; oi: number; change: number }[];
  expiryZones: { label: string; strike: number; strength: number }[];
}

export interface OIScannerRow {
  symbol: string;
  name: string;
  price: number;
  priceChange: number;
  oiChange: number;
  volume: number;
  vwap: number;
  signal: BuildupSignal | 'OI Breakout' | 'OI Spike' | 'Volume + OI Confirmation' | 'Smart Money Activity' | 'Trap Formation';
  confidence: number;
  reason: string;
}

export interface OIAlert {
  id: string;
  symbol: string;
  alertType: 'Sudden OI Increase' | 'Heavy Unwinding' | 'Smart Money Activity' | 'Breakout Confirmation' | 'OI Divergence' | 'Trap Formation' | 'Institutional Positioning';
  message: string;
  severity: 'High' | 'Medium' | 'Low';
  time: string;
}

function getBuildupSignal(priceChange: number, oiChange: number): BuildupSignal {
  if (priceChange > 0.15 && oiChange > 0) return 'Long Buildup';
  if (priceChange < -0.15 && oiChange > 0) return 'Short Buildup';
  if (priceChange > 0.15 && oiChange < 0) return 'Short Covering';
  if (priceChange < -0.15 && oiChange < 0) return 'Long Unwinding';
  return 'Neutral';
}

function resolveSpotForSymbol(symbol: string): { price: number; changePercent: number } {
  const sym = symbol.trim().toUpperCase();
  const quote = getLiveQuote(sym);
  if (quote?.price) {
    return { price: quote.price, changePercent: quote.changePercent };
  }
  const index = getIndices().find((i) => i.symbol === sym);
  if (index) return { price: index.price, changePercent: index.changePercent };
  const stock = getStocks().find((s) => s.symbol === sym);
  if (stock) return { price: stock.price, changePercent: stock.changePercent };
  if (isLiveFeedActive()) return { price: 0, changePercent: 0 };
  const inst = getFnoInstrument(sym);
  return { price: inst?.basePrice ?? 24580, changePercent: 0 };
}

function buildFuturesOIRow(symbol: string): FuturesOIData {
  const sym = symbol.trim().toUpperCase();
  const { price: spotPrice, changePercent: priceChange } = resolveSpotForSymbol(sym);
  const premBump = spotPrice > 40000 ? 80 : spotPrice > 15000 ? 35 : spotPrice > 3000 ? 12 : 4;
  const futuresPrice = spotPrice > 0 ? spotPrice + premBump * 0.15 : 0;
  return {
    symbol: sym,
    spotPrice,
    futuresPrice: Math.round(futuresPrice * 100) / 100,
    premiumDiscount: Math.round((futuresPrice - spotPrice) * 100) / 100,
    futuresOi: 0,
    futuresOiChange: 0,
    futuresVolume: getLiveQuote(sym)?.volume ?? 0,
    rolloverPercent: 0,
    expiryShift: 'Connect TradeX Live for NSE futures OI',
    priceChange,
    signal: 'Neutral',
    trendStrength: 'Weak',
  };
}

export function getFuturesOIForSymbol(symbol: string): FuturesOIData {
  return buildFuturesOIRow(symbol);
}

export function getFuturesOIData(): FuturesOIData[] {
  return FNO_INDICES.map((inst) => buildFuturesOIRow(inst.symbol));
}

export function getOIIntelligence(symbol: string = 'NIFTY'): OIIntelligenceData {
  const sym = symbol.trim().toUpperCase();
  const inst = getFnoInstrument(sym);
  const { price: spotPrice, changePercent } = resolveSpotForSymbol(sym);
  const chain = getOptionChain(sym, spotPrice);
  const interval = getStrikeIntervalForSpot(spotPrice, inst);
  const atmStrike = Math.round(spotPrice / interval) * interval;
  const totalCeOi = chain.reduce((sum, s) => sum + s.ceOi, 0);
  const totalPeOi = chain.reduce((sum, s) => sum + s.peOi, 0);
  const totalCeOiChange = chain.reduce((sum, s) => sum + s.ceOiChg, 0);
  const totalPeOiChange = chain.reduce((sum, s) => sum + s.peOiChg, 0);
  const emptyRow: OptionData = {
    strike: atmStrike,
    ceLtp: 0,
    ceOi: 0,
    ceOiChg: 0,
    ceVolume: 0,
    ceIv: 0,
    ceBid: 0,
    ceAsk: 0,
    peLtp: 0,
    peOi: 0,
    peOiChg: 0,
    peVolume: 0,
    peIv: 0,
    peBid: 0,
    peAsk: 0,
    pcr: 0,
    ceDelta: 0,
    ceGamma: 0,
    ceTheta: 0,
    ceVega: 0,
    ceRho: 0,
    peDelta: 0,
    peGamma: 0,
    peTheta: 0,
    peVega: 0,
    peRho: 0,
  };
  const atm = chain.find((s) => s.strike === atmStrike) ?? chain[Math.floor(chain.length / 2)] ?? emptyRow;
  const maxPain = calculateMaxPain(chain).maxPainStrike;
  const topCe = [...chain].sort((a, b) => b.ceOi - a.ceOi).slice(0, 5);
  const topPe = [...chain].sort((a, b) => b.peOi - a.peOi).slice(0, 5);
  const callWriting = chain.filter((s) => s.ceOiChg > 0).sort((a, b) => b.ceOiChg - a.ceOiChg).slice(0, 4).map((s) => ({ strike: s.strike, oi: s.ceOi, change: s.ceOiChg }));
  const putWriting = chain.filter((s) => s.peOiChg > 0).sort((a, b) => b.peOiChg - a.peOiChg).slice(0, 4).map((s) => ({ strike: s.strike, oi: s.peOi, change: s.peOiChg }));
  const callUnwinding = chain.filter((s) => s.ceOiChg < 0).sort((a, b) => a.ceOiChg - b.ceOiChg).slice(0, 4).map((s) => ({ strike: s.strike, oi: s.ceOi, change: s.ceOiChg }));
  const putUnwinding = chain.filter((s) => s.peOiChg < 0).sort((a, b) => a.peOiChg - b.peOiChg).slice(0, 4).map((s) => ({ strike: s.strike, oi: s.peOi, change: s.peOiChg }));
  const overallPcr = totalPeOi / Math.max(totalCeOi, 1);
  const atmPcr = atm.peOi / Math.max(atm.ceOi, 1);
  const callPressure = totalCeOiChange - totalPeOiChange;
  const marketBias = overallPcr > 1.35 && totalPeOiChange > totalCeOiChange ? 'Highly Bullish' : overallPcr > 1.05 ? 'Bullish' : overallPcr < 0.75 && callPressure > 0 ? 'Highly Bearish' : overallPcr < 0.95 ? 'Bearish' : 'Neutral';
  const oiSpike = Math.abs(totalCeOiChange + totalPeOiChange) / Math.max(totalCeOi + totalPeOi, 1) > 0.025;
  const sidewaysWithRisingOi = Math.abs(changePercent) < 0.25 && totalCeOiChange + totalPeOiChange > 250000;
  const marketOpen = isNseFnoMarketOpen();
  const smartMoneySignal = !chain.length
    ? 'Load option chain — npm run dev + connect TradeX Live'
    : !marketOpen
      ? 'Market closed — OI from last session (no intraday OI change)'
      : oiSpike
        ? 'Institutional buildup detected (NSE OI)'
        : sidewaysWithRisingOi
          ? 'Hidden accumulation, possible directional expansion'
          : callPressure > 0
            ? 'Aggressive call writing pressure'
            : 'Balanced positioning';

  return {
    symbol: sym,
    spotPrice,
    atmStrike,
    totalCeOi,
    totalPeOi,
    totalCeOiChange,
    totalPeOiChange,
    overallPcr: Math.round(overallPcr * 100) / 100,
    atmPcr: Math.round(atmPcr * 100) / 100,
    maxPain,
    strongestSupport: topPe[0]?.strike || atmStrike,
    strongestResistance: topCe[0]?.strike || atmStrike,
    marketBias,
    smartMoneySignal,
    institutionalPositioning: oiSpike ? 'Active' : 'Passive',
    reversalProbability: Math.round((Math.min(90, Math.abs(overallPcr - 1) * 85 + (sidewaysWithRisingOi ? 25 : 10))) * 10) / 10,
    fakeBreakoutRisk: Math.round((sidewaysWithRisingOi ? 72 : 25) * 10) / 10,
    oiTrapRisk: Math.round((callPressure > 250000 && changePercent > 0 ? 70 : 20) * 10) / 10,
    callWriting,
    putWriting,
    callUnwinding,
    putUnwinding,
    expiryZones: [
      { label: 'Support', strike: topPe[0]?.strike || atmStrike, strength: Math.round((topPe[0]?.peOi || 1) / Math.max(totalPeOi, 1) * 1000) / 10 },
      { label: 'Resistance', strike: topCe[0]?.strike || atmStrike, strength: Math.round((topCe[0]?.ceOi || 1) / Math.max(totalCeOi, 1) * 1000) / 10 },
      { label: 'Max Pain', strike: maxPain, strength: 78 },
    ],
  };
}

export function getOIIntradayScanner(): OIScannerRow[] {
  const marketOpen = isNseFnoMarketOpen();
  return getStocks().slice(0, 18).map((stock) => {
    const chain = buildOptionChain(stock.symbol, stock.price, undefined, 11);
    const oiChange = marketOpen
      ? chain.reduce((s, r) => s + r.ceOiChg + r.peOiChg, 0)
      : 0;
    const priceChange = stock.changePercent;
    const signal = getBuildupSignal(priceChange, oiChange);
    const highVolume = stock.volume > 9000000;
    const oiSpike = Math.abs(oiChange) > 650000;
    const vwapHold = stock.price > stock.vwap && oiChange > 0;
    let scannerSignal: OIScannerRow['signal'] = signal;
    let reason = marketOpen
      ? `${signal}: price ${priceChange >= 0 ? 'up' : 'down'} with OI ${oiChange >= 0 ? 'rising' : 'falling'}`
      : 'Market closed — EOD OI snapshot (no intraday OI change)';
    if (oiSpike && highVolume) {
      scannerSignal = 'Volume + OI Confirmation';
      reason = 'High volume plus sharp OI expansion confirms participation';
    } else if (oiSpike) {
      scannerSignal = 'OI Spike';
      reason = 'Sudden OI spike detected against normal range';
    } else if (vwapHold) {
      scannerSignal = 'Smart Money Activity';
      reason = 'VWAP hold with OI buildup suggests institutional activity';
    } else if (Math.abs(priceChange) < 0.2 && oiChange > 500000) {
      scannerSignal = 'Trap Formation';
      reason = 'Sideways price with rising OI can create trap formation';
    }
    return {
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      priceChange,
      oiChange,
      volume: stock.volume,
      vwap: Math.round(stock.vwap * 100) / 100,
      signal: scannerSignal,
      confidence: Math.round((60 + Math.min(35, Math.abs(priceChange) * 8 + (oiSpike ? 12 : 0))) * 10) / 10,
      reason,
    };
  }).sort((a, b) => b.confidence - a.confidence);
}

export function getOIAlerts(): OIAlert[] {
  const scanner = getOIIntradayScanner();
  return scanner.slice(0, 8).map((row, index) => {
    const alertType: OIAlert['alertType'] = row.signal === 'Trap Formation' ? 'Trap Formation' : row.signal === 'Smart Money Activity' ? 'Smart Money Activity' : row.oiChange > 700000 ? 'Sudden OI Increase' : row.oiChange < -500000 ? 'Heavy Unwinding' : row.confidence > 80 ? 'Institutional Positioning' : 'Breakout Confirmation';
    return {
      id: `oi-alert-${index}`,
      symbol: row.symbol,
      alertType,
      message: row.reason,
      severity: row.confidence > 82 ? 'High' : row.confidence > 68 ? 'Medium' : 'Low',
      time: `${index + 1} min ago`,
    };
  });
}

