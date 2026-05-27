import { fetchFiiDii, fetchMarketOhlc } from './marketApiService';
import { buildOptionChain } from './optionChainEngine';
import { getMarketConnectionState } from './marketConnection';
import type { FiiDiiRow, HistoricalPCRPoint, IntradayPoint } from './liveMarketSections';

const intradayBySymbol = new Map<string, IntradayPoint[]>();
const sparklineBySymbol = new Map<string, number[]>();
const pcrBySymbol = new Map<string, HistoricalPCRPoint[]>();
let fiiRows: FiiDiiRow[] = [];
let lastRefresh = 0;
const REFRESH_MS = 45_000;

const INTRADAY_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
const PCR_SYMBOLS = ['NIFTY', 'BANKNIFTY'];

function round(n: number, d = 2) {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function barsToIntraday(
  bars: { time: number; close: number; volume: number }[],
  symbol: string,
): IntradayPoint[] {
  const chain = buildOptionChain(symbol, undefined, undefined, 15);
  const ceOI = chain.reduce((s, r) => s + r.ceOi, 0);
  const peOI = chain.reduce((s, r) => s + r.peOi, 0);

  return bars
    .filter((b) => b.close > 0)
    .map((b) => {
      const dt = new Date(b.time * 1000);
      const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      return {
        time,
        price: round(b.close),
        volume: b.volume,
        ceOI,
        peOI,
      };
    });
}

function appendPcrSnapshot(symbol: string) {
  const chain = buildOptionChain(symbol, undefined, undefined, 21);
  const ceOI = chain.reduce((s, r) => s + r.ceOi, 0);
  const peOI = chain.reduce((s, r) => s + r.peOi, 0);
  if (ceOI + peOI < 1000) return;

  const today = new Date().toISOString().split('T')[0];
  const pcr = round(peOI / Math.max(ceOI, 1));
  const hist = [...(pcrBySymbol.get(symbol) ?? [])];
  const last = hist[hist.length - 1];
  const point: HistoricalPCRPoint = { date: today, pcr, ceOI, peOI };
  if (last?.date === today) hist[hist.length - 1] = point;
  else hist.push(point);
  if (hist.length > 30) hist.splice(0, hist.length - 30);
  pcrBySymbol.set(symbol, hist);
}

/** Background refresh for Dashboard / Global / News FII blocks */
export async function refreshLiveSectionsCache(): Promise<void> {
  if (!getMarketConnectionState().serverOk) return;
  if (Date.now() - lastRefresh < REFRESH_MS) return;
  lastRefresh = Date.now();

  await Promise.all(
    INTRADAY_SYMBOLS.map(async (sym) => {
      try {
        const ohlc = await fetchMarketOhlc(sym, '5m', '1d');
        if (!ohlc?.bars?.length) return;
        intradayBySymbol.set(sym, barsToIntraday(ohlc.bars, sym));
        sparklineBySymbol.set(
          sym,
          ohlc.bars.slice(-24).map((b) => round(b.close)),
        );
      } catch {
        /* skip */
      }
    }),
  );

  for (const sym of PCR_SYMBOLS) {
    try {
      appendPcrSnapshot(sym);
    } catch {
      /* skip */
    }
  }

  try {
    const fii = await fetchFiiDii(30);
    if (fii?.rows?.length) fiiRows = fii.rows;
  } catch {
    /* skip */
  }
}

export function getCachedIntraday(symbol: string): IntradayPoint[] {
  return intradayBySymbol.get(symbol.trim().toUpperCase()) ?? [];
}

export function getCachedSparkline(symbol: string, points = 20): number[] {
  const arr = sparklineBySymbol.get(symbol.trim().toUpperCase()) ?? [];
  if (!arr.length) return [];
  if (arr.length <= points) return arr;
  return arr.slice(-points);
}

export function getCachedPcrHistory(symbol: string, days = 30): HistoricalPCRPoint[] {
  const hist = pcrBySymbol.get(symbol.trim().toUpperCase()) ?? [];
  return hist.slice(-days);
}

export function getCachedFiiDii(): FiiDiiRow[] {
  return fiiRows;
}
