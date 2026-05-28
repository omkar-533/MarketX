import {
  getOIIntelligence as getStaticOIIntelligence,
  getOIIntradayScanner as getStaticOIIntradayScanner,
  type BuildupSignal,
  type FuturesOIData,
  type OIAlert,
  type OIIntelligenceData,
  type OIScannerRow,
} from '../data/marketData';
import { FNO_INDICES, FNO_STOCKS_ALL } from '../data/fnoUniverse';
import { buildOptionChain } from './optionChainEngine';
import { fetchFnoHistory, fetchFnoOiBatch } from './marketApiService';
import { getMarketConnectionState } from './marketConnection';
import { isNseFnoMarketOpen, marketSessionLabel } from '../utils/marketHours';
import { subscribeLiveSymbols } from './marketTickStream';
import { getFnoLiveQuotes, getLiveQuote } from './symbolLiveService';

export type OiIntelFeedStatus = {
  mode: 'live' | 'mixed' | 'offline';
  message: string;
  fyersHistorySymbols: number;
};

let futuresCache: FuturesOIData[] = [];
let feedStatus: OiIntelFeedStatus = { mode: 'offline', message: 'Start npm run dev', fyersHistorySymbols: 0 };
let refreshInFlight: Promise<void> | null = null;

function getBuildupSignal(priceChange: number, oiChange: number): BuildupSignal {
  if (priceChange > 0.15 && oiChange > 0) return 'Long Buildup';
  if (priceChange < -0.15 && oiChange > 0) return 'Short Buildup';
  if (priceChange > 0.15 && oiChange < 0) return 'Short Covering';
  if (priceChange < -0.15 && oiChange < 0) return 'Long Unwinding';
  return 'Neutral';
}

function quoteFor(symbol: string) {
  const live = getLiveQuote(symbol);
  if (live?.price) {
    return {
      price: live.price,
      change: live.change,
      changePercent: live.changePercent,
      volume: live.volume,
      open: live.open,
      high: live.high,
      low: live.low,
      vwap: live.vwap ?? live.price,
    };
  }
  return null;
}

function buildFuturesRow(symbol: string, histRows?: { totalOi: number; volume?: number; futClose?: number }[]): FuturesOIData {
  const sym = symbol.trim().toUpperCase();
  const q = quoteFor(sym);
  const spotPrice = q?.price ?? 0;
  const priceChange = q?.changePercent ?? 0;

  let futuresOi = 0;
  let futuresOiChange = 0;
  let futuresVolume = q?.volume ?? 0;
  let futuresPrice = spotPrice;

  if (histRows && histRows.length >= 1) {
    const latest = histRows[histRows.length - 1] as {
      totalOi: number;
      volume?: number;
      futClose?: number;
      oiChange?: number;
    };
    const prev = histRows.length >= 2 ? histRows[histRows.length - 2] : latest;
    futuresOi = latest.totalOi || futuresOi;
    futuresOiChange =
      latest.oiChange ??
      (latest.totalOi || 0) - ((prev as { totalOi?: number }).totalOi || 0);
    futuresVolume = latest.volume ?? futuresVolume;
    if (latest.futClose) futuresPrice = latest.futClose;
    if (!isNseFnoMarketOpen()) futuresOiChange = 0;
  } else if (q) {
    futuresOiChange = 0;
  }

  const premBump = spotPrice > 40000 ? 80 : spotPrice > 15000 ? 35 : spotPrice > 3000 ? 12 : 4;
  if (!futuresPrice && spotPrice) futuresPrice = spotPrice + premBump * 0.12;

  const signal = getBuildupSignal(priceChange, futuresOiChange);
  const absOi = Math.abs(futuresOiChange / Math.max(futuresOi, 1)) * 100;

  return {
    symbol: sym,
    spotPrice: Math.round(spotPrice * 100) / 100,
    futuresPrice: Math.round(futuresPrice * 100) / 100,
    premiumDiscount: Math.round((futuresPrice - spotPrice) * 100) / 100,
    futuresOi,
    futuresOiChange,
    futuresVolume,
    rolloverPercent: 48,
    expiryShift: futuresOiChange > 200_000 ? 'Current month dominance' : 'Far month accumulation',
    priceChange,
    signal,
    trendStrength: absOi > 9 ? 'Strong' : absOi > 4 ? 'Moderate' : 'Weak',
  };
}

type ScannerInput = {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  vwap: number;
};

function buildScannerRows(): OIScannerRow[] {
  const liveQuotes = getFnoLiveQuotes().filter((q) => q.type === 'stock');
  const list: ScannerInput[] = liveQuotes.length
    ? liveQuotes.slice(0, 24).map((q) => ({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        changePercent: q.changePercent,
        volume: q.volume,
        vwap: q.vwap ?? q.price,
      }))
    : FNO_STOCKS_ALL.slice(0, 18).flatMap((inst) => {
        const q = quoteFor(inst.symbol);
        if (!q?.price) return [];
        return [
          {
            symbol: inst.symbol,
            name: inst.name,
            price: q.price,
            changePercent: q.changePercent,
            volume: q.volume,
            vwap: q.vwap,
          },
        ];
      });

  return list
    .map((row) => {
      const chain = buildOptionChain(row.symbol, row.price, undefined, 15);
      const oiChange = chain.reduce((s, r) => s + r.ceOiChg + r.peOiChg, 0);
      const priceChange = row.changePercent;
      const signal = getBuildupSignal(priceChange, oiChange);
      const highVolume = row.volume > 5_000_000;
      const oiSpike = Math.abs(oiChange) > 400_000;
      const vwapHold = row.price > row.vwap && oiChange > 0;

      let scannerSignal: OIScannerRow['signal'] = signal;
      const closed = !isNseFnoMarketOpen();
      let reason = closed
        ? `Market closed — EOD OI snapshot (no live OI change)`
        : `${signal}: price ${priceChange >= 0 ? 'up' : 'down'} with OI ${oiChange >= 0 ? 'rising' : 'falling'}`;
      if (!closed && oiSpike && highVolume) {
        scannerSignal = 'Volume + OI Confirmation';
        reason = 'High volume with OI expansion (live LTP + chain model)';
      } else if (!closed && oiSpike) {
        scannerSignal = 'OI Spike';
        reason = 'Sharp OI change vs spot (chain model at live price)';
      } else if (!closed && vwapHold) {
        scannerSignal = 'Smart Money Activity';
        reason = 'Price above VWAP with OI buildup';
      } else if (closed) {
        scannerSignal = 'Neutral';
      }

      return {
        symbol: row.symbol,
        name: row.name,
        price: row.price,
        priceChange,
        oiChange,
        volume: row.volume,
        vwap: Math.round(row.vwap * 100) / 100,
        signal: scannerSignal,
        confidence: Math.round((60 + Math.min(35, Math.abs(priceChange) * 8 + (oiSpike ? 12 : 0))) * 10) / 10,
        reason,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

export function getOiIntelFeedStatus(): OiIntelFeedStatus {
  return feedStatus;
}

export function getLiveFuturesOIData(): FuturesOIData[] {
  if (futuresCache.length) return futuresCache;
  return FNO_INDICES.map((i) => buildFuturesRow(i.symbol));
}

export function getLiveFuturesOIForSymbol(symbol: string): FuturesOIData {
  const sym = symbol.trim().toUpperCase();
  return futuresCache.find((r) => r.symbol === sym) ?? buildFuturesRow(sym);
}

export function getLiveOIIntelligence(symbol: string): OIIntelligenceData {
  const sym = symbol.trim().toUpperCase();
  const q = quoteFor(sym);
  if (!q?.price) return getStaticOIIntelligence(sym);
  return getStaticOIIntelligence(sym);
}

export function getLiveOIIntradayScanner(): OIScannerRow[] {
  if (feedStatus.mode === 'live' || feedStatus.mode === 'mixed') {
    return buildScannerRows();
  }
  return getStaticOIIntradayScanner();
}

export function getLiveOIAlerts(): OIAlert[] {
  const scanner = getLiveOIIntradayScanner();
  return scanner.slice(0, 8).map((row, index) => {
    const alertType: OIAlert['alertType'] =
      row.signal === 'Trap Formation'
        ? 'Trap Formation'
        : row.signal === 'Smart Money Activity'
          ? 'Smart Money Activity'
          : row.oiChange > 500_000
            ? 'Sudden OI Increase'
            : row.oiChange < -300_000
              ? 'Heavy Unwinding'
              : row.confidence > 80
                ? 'Institutional Positioning'
                : 'Breakout Confirmation';
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

export async function refreshOiIntelligenceLive(): Promise<OiIntelFeedStatus> {
  if (refreshInFlight) {
    await refreshInFlight;
    return feedStatus;
  }

  refreshInFlight = (async () => {
    const conn = getMarketConnectionState();
    if (!conn.serverOk) {
      feedStatus = { mode: 'offline', message: 'Offline — npm run dev', fyersHistorySymbols: 0 };
      futuresCache = [];
      return;
    }

    const symbols = [...FNO_INDICES.map((i) => i.symbol)];
    subscribeLiveSymbols(symbols);

    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    let histCount = 0;
    const rows: FuturesOIData[] = [];

    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const hist = await fetchFnoHistory(sym, from, to);
          if (hist?.rows?.length) {
            const built = buildFuturesRow(sym, hist.rows);
            if (built.futuresOi > 500_000) histCount += 1;
            rows.push(built);
            return;
          }
        } catch {
          /* fallback */
        }
        try {
          const fno = await fetchFnoOiBatch([sym]);
          const snap = fno?.snapshots?.find((s) => s.symbol === sym);
          if (snap?.totalOi) {
            const built = buildFuturesRow(sym);
            built.futuresOi = snap.totalOi;
            built.futuresOiChange = isNseFnoMarketOpen() ? snap.oiChange : 0;
            if (built.spotPrice > 0) rows.push(built);
            return;
          }
        } catch {
          /* skip */
        }
        const built = buildFuturesRow(sym);
        if (built.spotPrice > 0) rows.push(built);
      }),
    );

    futuresCache = rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
    const liveQuotes = symbols.filter((s) => quoteFor(s)?.price).length;
    const histSource = histCount > 0;

    const session = marketSessionLabel();
    const closedNote = isNseFnoMarketOpen() ? '' : ' · OI frozen (EOD)';

    feedStatus = {
      mode: liveQuotes > 0 && histSource ? 'live' : liveQuotes > 0 ? 'mixed' : 'offline',
      message:
        liveQuotes > 0 && histSource
          ? `${session} · TradeX LTP + history (${histCount})${closedNote}`
          : liveQuotes > 0
            ? `${session} · TradeX Live (LTP + option chain OI)${closedNote}`
            : conn.serverOk
              ? `${session} — connect TradeX Live for LTP`
              : 'Start npm run dev',
      fyersHistorySymbols: histCount,
    };
  })().finally(() => {
    refreshInFlight = null;
  });

  await refreshInFlight;
  return feedStatus;
}
