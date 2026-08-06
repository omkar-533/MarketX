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
import { FNO_STOCKS_ALL, getFnoInstrument, getStrikeIntervalForSpot } from '../data/fnoUniverse';
import {
  fetchOptionChainLive,
  getCachedOptionChain,
} from './optionChainLiveService';
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

/** Only warm these on the critical path — keeps first paint fast. */
const FAST_INDEX_SET = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'] as const;

let futuresCache: FuturesOIData[] = [];
let feedStatus: OiIntelFeedStatus = { mode: 'offline', message: serverOfflineMessage(), fyersHistorySymbols: 0 };
let refreshInFlight: Promise<void> | null = null;
let refreshFocus = '';
let backgroundWarmInFlight = false;

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

/** Build futures row from live quote + optional NSE option-chain OI (no history round-trip). */
function buildFuturesRow(symbol: string): FuturesOIData {
  const sym = String(symbol || '').trim().toUpperCase();
  const q = quoteFor(sym);
  const spotPrice = q?.price ?? 0;
  const priceChange = q?.changePercent ?? 0;
  const chain = getCachedOptionChain(sym, undefined, 0);
  let futuresOi = 0;
  let futuresOiChange = 0;
  for (const row of chain) {
    futuresOi += (row.ceOi || 0) + (row.peOi || 0);
    futuresOiChange += (row.ceOiChg || 0) + (row.peOiChg || 0);
  }
  if (!isNseFnoMarketOpen()) futuresOiChange = 0;

  const futuresVolume = q?.volume ?? 0;
  const premBump = spotPrice > 40000 ? 80 : spotPrice > 15000 ? 35 : spotPrice > 3000 ? 12 : 4;
  const futuresPrice = spotPrice ? spotPrice + premBump * 0.12 : 0;
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
    ? liveQuotes.slice(0, 12).map((q) => ({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        changePercent: q.changePercent,
        volume: q.volume,
        vwap: q.vwap ?? q.price,
      }))
    : FNO_STOCKS_ALL.slice(0, 10).flatMap((inst) => {
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
      // Cache-only — never kick N parallel NSE option-chain fetches from the scanner
      const chain = getCachedOptionChain(row.symbol, undefined, 15);
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
        : chain.length
          ? `${signal}: price ${priceChange >= 0 ? 'up' : 'down'} with OI ${oiChange >= 0 ? 'rising' : 'falling'}`
          : `Price ${priceChange >= 0 ? 'up' : 'down'} ${Math.abs(priceChange).toFixed(2)}% (OI warming…)`;
      if (!closed && chain.length && oiSpike && highVolume) {
        scannerSignal = 'Volume + OI Confirmation';
        reason = 'High volume with OI expansion (live LTP + chain)';
      } else if (!closed && chain.length && oiSpike) {
        scannerSignal = 'OI Spike';
        reason = 'Sharp OI change vs spot';
      } else if (!closed && chain.length && vwapHold) {
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
  return FAST_INDEX_SET.map((s) => buildFuturesRow(s));
}

export function getLiveFuturesOIForSymbol(symbol: string): FuturesOIData {
  const sym = symbol.trim().toUpperCase();
  return futuresCache.find((r) => r.symbol === sym) ?? buildFuturesRow(sym);
}

export function hasOiIntelligenceCache(symbol: string): boolean {
  return getCachedOptionChain(symbol.trim().toUpperCase(), undefined, 0).length > 0;
}

function rebuildFuturesCache(symbols: string[]) {
  const rows = symbols
    .map((sym) => buildFuturesRow(sym))
    .filter((r) => r.spotPrice > 0 || r.futuresOi > 0);
  futuresCache = rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function updateFeedStatus(symbols: string[]) {
  const liveQuotes = symbols.filter((s) => quoteFor(s)?.price).length;
  const chainCount = symbols.filter((s) => getCachedOptionChain(s, undefined, 0).length > 0).length;
  const session = marketSessionLabel();
  const closedNote = isNseFnoMarketOpen() ? '' : ' · OI frozen (EOD)';
  const chainSource = chainCount > 0;

  feedStatus = {
    mode: chainSource || liveQuotes > 0 ? (chainSource && liveQuotes > 0 ? 'live' : 'mixed') : 'offline',
    message:
      chainSource && liveQuotes > 0
        ? `${session} · NSE chain + LTP${closedNote}`
        : chainSource
          ? `${session} · NSE option chain${closedNote}`
          : liveQuotes > 0
            ? `${session} · LTP ready (chain warming…)${closedNote}`
            : getMarketConnectionState().serverOk
              ? `${session} — fetching NSE…`
              : serverOfflineMessage(),
    fyersHistorySymbols: 0,
  };
}

/** Non-blocking: warm sister indices + a few stocks for scanner. */
function warmBackground(focus: string, peerSymbols: string[]) {
  if (backgroundWarmInFlight) return;
  backgroundWarmInFlight = true;
  void (async () => {
    try {
      for (const sym of peerSymbols) {
        if (sym === focus) continue;
        await fetchOptionChainLive(sym, undefined, { force: false, strikeWindow: 0 }).catch(() => null);
        rebuildFuturesCache([focus, ...peerSymbols]);
        updateFeedStatus([focus, ...peerSymbols]);
      }
      const stocks = getFnoLiveQuotes()
        .filter((q) => q.type === 'stock')
        .slice(0, 4)
        .map((q) => q.symbol);
      for (const sym of stocks) {
        await fetchOptionChainLive(sym, undefined, { force: false, strikeWindow: 15 }).catch(() => null);
      }
    } finally {
      backgroundWarmInFlight = false;
    }
  })();
}

/**
 * Fast refresh: only await the focused symbol's NSE option chain.
 * Sister indices warm in the background so first paint stays quick.
 */
export async function refreshOiIntelligenceLive(opts?: {
  symbol?: string;
  force?: boolean;
}): Promise<OiIntelFeedStatus> {
  const focus = String(opts?.symbol || 'NIFTY').trim().toUpperCase() || 'NIFTY';

  if (refreshInFlight && refreshFocus === focus) {
    await refreshInFlight;
    return feedStatus;
  }

  refreshFocus = focus;
  refreshInFlight = (async () => {
    const conn = getMarketConnectionState();
    if (!conn.serverOk) {
      feedStatus = { mode: 'offline', message: serverUnreachableMessage(), fyersHistorySymbols: 0 };
      return;
    }

    const peers = FAST_INDEX_SET.filter((s) => s !== focus).slice(0, 2);
    const matrix = [focus, ...peers];
    subscribeLiveSymbols(matrix);

    await fetchOptionChainLive(focus, undefined, {
      force: opts?.force === true,
      strikeWindow: 0,
    }).catch(() => null);

    rebuildFuturesCache(matrix);
    updateFeedStatus(matrix);
    warmBackground(focus, peers);
  })().finally(() => {
    refreshInFlight = null;
    refreshFocus = '';
  });

  await refreshInFlight;
  return feedStatus;
}

export function getLiveOIIntelligence(symbol: string): OIIntelligenceData {
  const sym = symbol.trim().toUpperCase();
  const q = quoteFor(sym);
  const spotPrice = q?.price ?? 0;
  const changePercent = q?.changePercent ?? 0;
  const inst = getFnoInstrument(sym);
  const chain = getCachedOptionChain(sym, undefined, 0);

  if (!chain.length) {
    void fetchOptionChainLive(sym, undefined, { force: false, strikeWindow: 0 });
    return getStaticOIIntelligence(sym);
  }

  const interval = getStrikeIntervalForSpot(spotPrice || (inst?.basePrice ?? 24580), inst);
  const atmStrike =
    Math.round((spotPrice || chain[Math.floor(chain.length / 2)]?.strike || 0) / interval) * interval;
  const totalCeOi = chain.reduce((sum, s) => sum + s.ceOi, 0);
  const totalPeOi = chain.reduce((sum, s) => sum + s.peOi, 0);
  const totalCeOiChange = chain.reduce((sum, s) => sum + s.ceOiChg, 0);
  const totalPeOiChange = chain.reduce((sum, s) => sum + s.peOiChg, 0);
  const atm =
    chain.find((s) => s.strike === atmStrike) ??
    chain.reduce(
      (best, r) => (Math.abs(r.strike - atmStrike) < Math.abs(best.strike - atmStrike) ? r : best),
      chain[Math.floor(chain.length / 2)],
    );
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
  const oiSpike =
    Math.abs(totalCeOiChange + totalPeOiChange) / Math.max(totalCeOi + totalPeOi, 1) > 0.025;
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
      Math.round(Math.min(90, Math.abs(overallPcr - 1) * 85 + (sidewaysWithRisingOi ? 25 : 10)) * 10) /
      10,
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
