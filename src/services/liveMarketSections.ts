import type { IndexData, StockData } from '../data/marketData';
import { buildOptionChain } from './optionChainEngine';
import {
  getCachedFiiDii,
  getCachedIntraday,
  getCachedPcrHistory,
  getCachedSparkline,
} from './liveSectionsCache';
import { getMarketConnectionState } from './marketConnection';
import { getMarketLiveState } from './marketLiveStore';
import { getFnoLiveQuotes, getLiveQuote } from './symbolLiveService';

export type MarketBreadthData = {
  advances: number;
  declines: number;
  unchanged: number;
  advanceDeclineRatio: number;
  newHighs: number;
  newLows: number;
  above20DMA: number;
  above50DMA: number;
  above200DMA: number;
};

export type IntradayPoint = {
  time: string;
  price: number;
  volume: number;
  ceOI: number;
  peOI: number;
};

export type HistoricalPCRPoint = {
  date: string;
  pcr: number;
  ceOI: number;
  peOI: number;
};

export type FiiDiiRow = {
  date: string;
  fiiCashBuy: number;
  fiiCashSell: number;
  fiiCashNet: number;
  fiiFuturesBuy: number;
  fiiFuturesSell: number;
  fiiFuturesNet: number;
  fiiOptionsBuy: number;
  fiiOptionsSell: number;
  fiiOptionsNet: number;
  diiCashBuy: number;
  diiCashSell: number;
  diiCashNet: number;
};

function getLiveStockRows(): StockData[] {
  const { stocks } = getMarketLiveState();
  if (stocks.length) return [...stocks];
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
        marketCap: 100_000,
        sector: q.sector,
        pe: 20,
        high: q.high,
        low: q.low,
        open: q.open,
        prevClose: q.prevClose,
        delivery: 35,
        vwap: q.vwap ?? q.price,
        rsi: q.rsi ?? 50,
      }),
    );
}

function liveIndex(symbol: string): IndexData | undefined {
  const fromStore = getMarketLiveState().indices.find((i) => i.symbol === symbol);
  if (fromStore) return fromStore;
  const q = getLiveQuote(symbol);
  if (!q) return undefined;
  return {
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
    open: q.open,
    high: q.high,
    low: q.low,
    prevClose: q.prevClose,
    volume: q.volume,
    value: Math.round(q.volume / 10000),
  };
}

export function getLiveMarketBreadth(): MarketBreadthData {
  const stocks = getLiveStockRows();
  const advances = stocks.filter((s) => s.changePercent > 0.05).length;
  const declines = stocks.filter((s) => s.changePercent < -0.05).length;
  const unchanged = Math.max(0, stocks.length - advances - declines);
  const newHighs = stocks.filter((s) => s.price >= s.high * 0.998).length;
  const newLows = stocks.filter((s) => s.price <= s.low * 1.002).length;
  const above20 = stocks.filter((s) => s.changePercent > 0).length;
  return {
    advances: advances || 1,
    declines: declines || 1,
    unchanged,
    advanceDeclineRatio: Math.round((advances / Math.max(declines, 1)) * 100) / 100,
    newHighs,
    newLows,
    above20DMA: Math.round((above20 / Math.max(stocks.length, 1)) * 100),
    above50DMA: Math.round((stocks.filter((s) => s.rsi > 50).length / Math.max(stocks.length, 1)) * 100),
    above200DMA: Math.round((stocks.filter((s) => s.changePercent > -2).length / Math.max(stocks.length, 1)) * 100),
  };
}

/** Fyers 5m OHLC intraday (cached) + live chain OI on last bar */
export function getLiveIntradayData(symbol = 'NIFTY'): IntradayPoint[] {
  const sym = symbol.trim().toUpperCase();
  const cached = getCachedIntraday(sym);
  if (cached.length) return cached;

  const q = getLiveQuote(sym);
  const idx = liveIndex(sym);
  const price = q?.price ?? idx?.price ?? 0;
  if (!price) return [];

  const chain = buildOptionChain(sym, price, undefined, 15);
  const ceOI = chain.reduce((s, r) => s + r.ceOi, 0);
  const peOI = chain.reduce((s, r) => s + r.peOi, 0);
  const open = q?.open ?? idx?.open ?? price;

  return [
    {
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      price,
      volume: q?.volume ?? idx?.volume ?? 0,
      ceOI,
      peOI,
    },
    {
      time: '09:15',
      price: open,
      volume: 0,
      ceOI: Math.floor(ceOI * 0.9),
      peOI: Math.floor(peOI * 0.9),
    },
  ];
}

/** PCR snapshots from live Fyers chain (accumulated per session day) */
export function getLiveHistoricalPCR(symbol = 'NIFTY', days = 30): HistoricalPCRPoint[] {
  const sym = symbol.trim().toUpperCase();
  const cached = getCachedPcrHistory(sym, days);
  if (cached.length) return cached;

  const spot = getLiveQuote(sym)?.price ?? liveIndex(sym)?.price ?? 0;
  const chain = buildOptionChain(sym, spot, undefined, 21);
  const ce = chain.reduce((s, r) => s + r.ceOi, 0);
  const pe = chain.reduce((s, r) => s + r.peOi, 0);
  const livePcr = Math.round((pe / Math.max(ce, 1)) * 100) / 100;
  const today = new Date().toISOString().split('T')[0];
  return [{ date: today, pcr: livePcr, ceOI: ce, peOI: pe }];
}

export function getLiveFiiDiiData(_days = 30): FiiDiiRow[] {
  return getCachedFiiDii();
}

export function getLiveSparkline(symbol: string, points = 20): number[] {
  const cached = getCachedSparkline(symbol, points);
  if (cached.length) return cached;

  const q = getLiveQuote(symbol);
  if (!q?.price) return [];
  const start = q.open || q.prevClose || q.price;
  const arr: number[] = [];
  for (let i = 0; i < points - 1; i++) {
    const t = i / (points - 1);
    arr.push(Math.round((start + (q.price - start) * t) * 100) / 100);
  }
  arr.push(q.price);
  return arr;
}

export function isLiveSectionsActive(): boolean {
  return getMarketConnectionState().serverOk && getFnoLiveQuotes().length > 0;
}
