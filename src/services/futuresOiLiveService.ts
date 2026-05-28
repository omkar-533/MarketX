import { buildOptionChain } from './optionChainEngine';
import { fetchFnoHistory, fetchMarketOhlc, isMarketLiveEnabled } from './marketApiService';
import { priceSourceFromMarket } from '../utils/marketProviderLabel';
import type { FuturesChartBar } from './futuresOiChart';
import { enrichBarsWithBuildup } from './futuresOiChart';
import type { OiBar, OiTimeframeId } from './optionOiTimeframe';
import { prepareOiSeries } from './optionOiTimeframe';

export type FuturesPeriod = 'daily' | 'weekly';

export type FuturesDataMeta = {
  priceSource: 'fyers' | 'none';
  oiSource: 'fyers' | 'chain' | 'none';
  volumeSource: 'fyers' | 'none';
  live: boolean;
  message: string;
};

function unixToDateKey(ts: number): string {
  return new Date(ts * 1000).toISOString().split('T')[0];
}

function fyersRangeForPeriod(period: FuturesPeriod, startDate?: string, endDate?: string): string {
  if (!startDate || !endDate) return period === 'weekly' ? '1y' : '6mo';
  const days = Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
  );
  if (days > 365 * 2) return '1y';
  if (days > 180) return '6mo';
  return '3mo';
}

function aggregateWeekly(daily: OiBar[]): OiBar[] {
  const groups = new Map<string, OiBar[]>();
  daily.forEach((b) => {
    const dt = new Date(b.date);
    const onejan = new Date(dt.getFullYear(), 0, 1);
    const week = Math.ceil(((dt.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
    const key = `${dt.getFullYear()}-W${String(week).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  });

  return [...groups.entries()].map(([key, g]) => {
    const first = g[0];
    const last = g[g.length - 1];
    return {
      date: last.date,
      time: '15:30',
      label: key,
      symbol: first.symbol,
      spotPrice: last.close,
      open: first.open,
      high: Math.max(...g.map((x) => x.high)),
      low: Math.min(...g.map((x) => x.low)),
      close: last.close,
      pcr: last.pcr,
      maxPain: last.maxPain,
      totalCE_OI: Math.floor(g.reduce((s, x) => s + x.totalCE_OI, 0) / g.length),
      totalPE_OI: Math.floor(g.reduce((s, x) => s + x.totalPE_OI, 0) / g.length),
      volume: g.reduce((s, x) => s + x.volume, 0),
    };
  });
}

function chainOiForDate(symbol: string, close: number): { ce: number; pe: number; pcr: number } {
  const chain = buildOptionChain(symbol, close, undefined, 21);
  const ce = chain.reduce((s, r) => s + r.ceOi, 0);
  const pe = chain.reduce((s, r) => s + r.peOi, 0);
  return { ce, pe: pe, pcr: pe / Math.max(ce, 1) };
}

function filterByDates<T extends { date: string }>(rows: T[], start?: string, end?: string): T[] {
  let out = rows;
  if (start) out = out.filter((r) => r.date >= start);
  if (end) out = out.filter((r) => r.date <= end);
  return out;
}

export async function loadFuturesAnalyticsSeries(
  symbol: string,
  period: FuturesPeriod,
  startDate?: string,
  endDate?: string,
): Promise<{ bars: FuturesChartBar[]; meta: FuturesDataMeta }> {
  const sym = symbol.trim().toUpperCase();
  const end = endDate || new Date().toISOString().split('T')[0];
  const start = startDate || '';

  if (!isMarketLiveEnabled()) {
    return {
      bars: [],
      meta: {
        priceSource: 'none',
        oiSource: 'none',
        volumeSource: 'none',
        live: false,
        message: 'Connect TradeX Live — npm run dev',
      },
    };
  }

  const interval = period === 'weekly' ? '1w' : '1d';
  const range = fyersRangeForPeriod(period, start || undefined, end);

  const [ohlcRes, fnoHist] = await Promise.all([
    fetchMarketOhlc(sym, interval, range),
    fetchFnoHistory(sym, start || '2020-01-01', end),
  ]);

  const oiByDate = new Map<string, { totalOi: number; volume?: number }>();
  let oiSource: FuturesDataMeta['oiSource'] = 'none';

  if (fnoHist?.rows?.length) {
    fnoHist.rows.forEach((r) => {
      if (r.totalOi > 0) oiByDate.set(r.date, { totalOi: r.totalOi, volume: r.volume });
    });
    if (oiByDate.size) oiSource = 'fyers';
  }

  if (!ohlcRes?.bars?.length) {
    const tf: OiTimeframeId = period === 'weekly' ? '1W' : '1D';
    const fallback = prepareOiSeries(sym, tf, start || undefined, end || undefined);
    if (fallback.bars.length) {
      return {
        bars: enrichBarsWithBuildup(fallback.bars),
        meta: {
          priceSource: 'none',
          oiSource: 'chain',
          volumeSource: 'none',
          live: false,
          message: 'Offline OI model — connect TradeX Live for live candles',
        },
      };
    }
    return {
      bars: [],
      meta: {
        priceSource: 'none',
        oiSource,
        volumeSource: 'none',
        live: false,
        message: 'No data — connect TradeX Live in Profile',
      },
    };
  }

  let dailyBars: OiBar[] = ohlcRes.bars.map((b) => {
    const date = unixToDateKey(b.time);
    const hist = oiByDate.get(date);
    let totalCE_OI = 0;
    let totalPE_OI = 0;
    let pcr = 1;

    if (hist && hist.totalOi > 0) {
      const est = chainOiForDate(sym, b.close);
      const peRatio = est.pe / Math.max(est.ce + est.pe, 1);
      totalPE_OI = Math.floor(hist.totalOi * peRatio);
      totalCE_OI = Math.max(0, hist.totalOi - totalPE_OI);
      pcr = totalPE_OI / Math.max(totalCE_OI, 1);
    } else {
      const est = chainOiForDate(sym, b.close);
      totalCE_OI = est.ce;
      totalPE_OI = est.pe;
      pcr = est.pcr;
      if (oiSource === 'none') oiSource = 'chain';
    }

    const vol = hist?.volume && hist.volume > 0 ? hist.volume : b.volume;

    return {
      date,
      time: '15:30',
      label: date,
      symbol: sym,
      spotPrice: b.close,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      pcr: Math.round(pcr * 100) / 100,
      maxPain: Math.round(b.close / 50) * 50,
      totalCE_OI,
      totalPE_OI,
      volume: vol,
    };
  });

  dailyBars = filterByDates(dailyBars, start || undefined, end);
  if (period === 'weekly') dailyBars = aggregateWeekly(dailyBars);

  const enriched = enrichBarsWithBuildup(dailyBars);
  const priceSource = priceSourceFromMarket(ohlcRes.source);
  const live = priceSource === 'fyers';

  const msg =
    oiSource === 'fyers'
      ? `TradeX ${period} candles + OI snapshot`
      : `TradeX ${period} candles · OI from option chain model`;

  return {
    bars: enriched,
    meta: {
      priceSource,
      oiSource,
      volumeSource: priceSource,
      live,
      message: msg,
    },
  };
}
