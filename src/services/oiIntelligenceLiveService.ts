import {
  calculateMaxPain,
  getOIIntelligence as getStaticOIIntelligence,
  getOIIntradayScanner as getStaticOIIntradayScanner,
  type BuildupSignal,
  type FuturesOIData,
  type OIAlert,
  type OIIntelligenceData,
  type OIScannerRow,
} from '../data/marketData';
import { FNO_INDICES, FNO_STOCKS_ALL, getFnoInstrument, getStrikeIntervalForSpot } from '../data/fnoUniverse';
import { buildOptionChain } from './optionChainEngine';
import {
  fetchOptionChainLive,
  getCachedOptionChain,
} from './optionChainLiveService';
import { fetchFnoHistory, fetchFnoOiBatch } from './marketApiService';
import { getMarketConnectionState } from './marketConnection';
import { isNseFnoMarketOpen, marketSessionLabel } from '../utils/marketHours';
import { subscribeLiveSymbols } from './marketTickStream';
import { serverOfflineMessage, serverUnreachableMessage } from '../constants/brandLabels';
import { getFnoLiveQuotes, getLiveQuote } from './symbolLiveService';

export type OiIntelFeedStatus = {
  mode: 'live' | 'mixed' | 'offline';
  message: string;
  fyersHistorySymbols: number;
};

let futuresCache: FuturesOIData[] = [];
let feedStatus: OiIntelFeedStatus = { mode: 'offline', message: serverOfflineMessage(), fyersHistorySymbols: 0 };
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
  const spotPrice = q?.price ?? 0;
  const changePercent = q?.changePercent ?? 0;
  const inst = getFnoInstrument(sym);
  const chain = getCachedOptionChain(sym, undefined, 0);

  if (!chain.length) {
    // Cache empty — kick async fetch; show static structure only as last resort
    void fetchOptionChainLive(sym, undefined, { force: false, strikeWindow: 0 });
    return getStaticOIIntelligence(sym);
  }

  const interval = getStrikeIntervalForSpot(spotPrice || (inst?.basePrice ?? 24580), inst);
  const atmStrike = Math.round((spotPrice || chain[Math.floor(chain.length / 2)]?.strike || 0) / interval) * interval;
  const totalCeOi = chain.reduce((sum, s) => sum + s.ceOi, 0);
  const totalPeOi = chain.reduce((sum, s) => sum + s.peOi, 0);
  const totalCeOiChange = chain.reduce((sum, s) => sum + s.ceOiChg, 0);
  const totalPeOiChange = chain.reduce((sum, s) => sum + s.peOiChg, 0);
  const atm =
    chain.find((s) => s.strike === atmStrike) ??
    chain.reduce((best, r) =>
      Math.abs(r.strike - atmStrike) < Math.abs(best.strike - atmStrike) ? r : best,
    chain[Math.floor(chain.length / 2)]);
  const maxPain = calculateMaxPain(chain).maxPainStrike;
  const topCe = [...chain].sort((a, b) => b.ceOi - a.ceOi).slice(0, 5);
  const topPe = [...chain].sort((a, b) => b.peOi - a.peOi).slice(0, 5);
  const callWriting = chain
    .filter((s) => s.ceOiChg > 0)
    .sort((a, b) => b.ceOiChg - a.ceOiChg)
    .slice(0, 4)
    .map((s) => ({ strike: s.strike, oi: s.ceOi, change: s.ceOiChg }));
  const putWriting = chain
    .filter((s) => s.peOiChg > 0)
    .sort((a, b) => b.peOiChg - a.peOiChg)
    .slice(0, 4)
    .map((s) => ({ strike: s.strike, oi: s.peOi, change: s.peOiChg }));
  const callUnwinding = chain
    .filter((s) => s.ceOiChg < 0)
    .sort((a, b) => a.ceOiChg - b.ceOiChg)
    .slice(0, 4)
    .map((s) => ({ strike: s.strike, oi: s.ceOi, change: s.ceOiChg }));
  const putUnwinding = chain
    .filter((s) => s.peOiChg < 0)
    .sort((a, b) => a.peOiChg - b.peOiChg)
    .slice(0, 4)
    .map((s) => ({ strike: s.strike, oi: s.peOi, change: s.peOiChg }));
  const overallPcr = totalPeOi / Math.max(totalCeOi, 1);
  const atmPcr = (atm?.peOi ?? 0) / Math.max(atm?.ceOi ?? 1, 1);
  const callPressure = totalCeOiChange - totalPeOiChange;
  const marketBias: OIIntelligenceData['marketBias'] =
    overallPcr > 1.35 && totalPeOiChange > totalCeOiChange
      ? 'Highly Bullish'
      : overallPcr > 1.05
        ? 'Bullish'
        : overallPcr < 0.75 && callPressure > 0
          ? 'Highly Bearish'
          : overallPcr < 0.95
            ? 'Bearish'
            : 'Neutral';
  const oiSpike = Math.abs(totalCeOiChange + totalPeOiChange) / Math.max(totalCeOi + totalPeOi, 1) > 0.025;
  const sidewaysWithRisingOi = Math.abs(changePercent) < 0.25 && totalCeOiChange + totalPeOiChange > 250000;
  const marketOpen = isNseFnoMarketOpen();
  const smartMoneySignal = !marketOpen
    ? 'Market closed — OI from NSE last session'
    : oiSpike
      ? 'Institutional buildup detected (NSE OI)'
      : sidewaysWithRisingOi
        ? 'Hidden accumulation, possible directional expansion'
        : callPressure > 0
          ? 'Aggressive call writing pressure'
          : 'Balanced positioning (NSE live chain)';

  return {
    symbol: sym,
    spotPrice: spotPrice || atmStrike,
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
    reversalProbability:
      Math.round(Math.min(90, Math.abs(overallPcr - 1) * 85 + (sidewaysWithRisingOi ? 25 : 10)) * 10) / 10,
    fakeBreakoutRisk: Math.round((sidewaysWithRisingOi ? 72 : 25) * 10) / 10,
    oiTrapRisk: Math.round((callPressure > 250000 && changePercent > 0 ? 70 : 20) * 10) / 10,
    callWriting,
    putWriting,
    callUnwinding,
    putUnwinding,
    expiryZones: [
      {
        label: 'Support',
        strike: topPe[0]?.strike || atmStrike,
        strength: Math.round(((topPe[0]?.peOi || 1) / Math.max(totalPeOi, 1)) * 1000) / 10,
      },
      {
        label: 'Resistance',
        strike: topCe[0]?.strike || atmStrike,
        strength: Math.round(((topCe[0]?.ceOi || 1) / Math.max(totalCeOi, 1)) * 1000) / 10,
      },
      { label: 'Max Pain', strike: maxPain, strength: 78 },
    ],
  };
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
      feedStatus = { mode: 'offline', message: serverUnreachableMessage(), fyersHistorySymbols: 0 };
      futuresCache = [];
      return;
    }

    const symbols = [...FNO_INDICES.map((i) => i.symbol)];
    subscribeLiveSymbols(symbols);

    // Warm NSE option chains (broker-free) — feeds PCR / writing / scanner
    await Promise.all(
      symbols.map((sym) =>
        fetchOptionChainLive(sym, undefined, { force: false, strikeWindow: 0 }).catch(() => null),
      ),
    );

    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    let histCount = 0;
    let chainCount = 0;
    const rows: FuturesOIData[] = [];

    await Promise.all(
      symbols.map(async (sym) => {
        if (getCachedOptionChain(sym, undefined, 0).length) chainCount += 1;
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
    const chainSource = chainCount > 0;

    const session = marketSessionLabel();
    const closedNote = isNseFnoMarketOpen() ? '' : ' · OI frozen (EOD)';

    feedStatus = {
      mode:
        (liveQuotes > 0 || chainSource) && (histSource || chainSource)
          ? liveQuotes > 0 && (histSource || chainSource)
            ? 'live'
            : 'mixed'
          : liveQuotes > 0
            ? 'mixed'
            : 'offline',
      message:
        chainSource && liveQuotes > 0
          ? `${session} · NSE option chain + LTP${histSource ? ` + history (${histCount})` : ''}${closedNote}`
          : chainSource
            ? `${session} · NSE option chain OI (no LTP yet)${closedNote}`
            : liveQuotes > 0
              ? `${session} · Live LTP (option chain warming…)${closedNote}`
              : conn.serverOk
                ? `${session} — waiting for NSE / live quotes`
                : serverOfflineMessage(),
      fyersHistorySymbols: histCount,
    };
  })().finally(() => {
    refreshInFlight = null;
  });

  await refreshInFlight;
  return feedStatus;
}
