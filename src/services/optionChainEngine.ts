import type { OptionData } from '../data/marketData';
import {
  fetchOptionChainLive,
  getCachedExpiries,
  getCachedOptionChain,
} from './optionChainLiveService';

export type OiBuildup =
  | 'Long Buildup'
  | 'Short Buildup'
  | 'Short Covering'
  | 'Long Unwinding'
  | 'Neutral';

export type EnhancedOptionRow = OptionData & {
  strikePcr: number;
  ceBuildup: OiBuildup;
  peBuildup: OiBuildup;
  ceOiChgPct: number;
  peOiChgPct: number;
};

/** Expiries from Fyers option-chain cache only */
export function buildOptionExpiries(count = 8): string[] {
  const cached = getCachedExpiries('');
  if (cached.length >= 1) return cached.slice(0, count);

  const out: string[] = [];
  const today = new Date();
  let d = new Date(today);
  d.setHours(0, 0, 0, 0);

  while (out.length < count) {
    const day = d.getDay();
    if (day === 4) {
      out.push(
        d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      );
    }
    d.setDate(d.getDate() + 1);
  }

  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (monthEnd.getDay() !== 4) {
    while (monthEnd.getDay() !== 4) monthEnd.setDate(monthEnd.getDate() - 1);
  }
  const monthly = monthEnd.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  if (!out.includes(monthly)) out.push(monthly);

  return out.slice(0, count);
}

export function daysToExpiry(expiryLabel: string): number {
  const parsed = new Date(expiryLabel).getTime();
  if (Number.isNaN(parsed)) return 7;
  return Math.max(1, Math.ceil((parsed - Date.now()) / 86400000));
}

/** Real NSE option chain only — returns [] until refreshOptionChainsLive / fetchOptionChainLive */
export function buildOptionChain(
  symbol: string,
  _spot?: number,
  expiry?: string,
  strikeWindow = 21,
): EnhancedOptionRow[] {
  const sym = symbol.trim().toUpperCase();
  void fetchOptionChainLive(sym, expiry, { strikeWindow: strikeWindow || 0 });
  return getCachedOptionChain(sym, expiry, strikeWindow);
}

export function getOiChartData(rows: EnhancedOptionRow[]) {
  return rows.map((r) => ({
    strike: r.strike,
    ceOi: r.ceOi,
    peOi: r.peOi,
    pcr: r.strikePcr,
  }));
}

export function exportChainCsv(rows: EnhancedOptionRow[], symbol: string, expiry: string) {
  const header =
    'Strike,CE OI,CE Chg,CE Vol,CE IV,CE LTP,CE Delta,CE Gamma,CE Theta,CE Vega,CE Rho,PE Rho,PE Vega,PE Theta,PE Gamma,PE Delta,PE LTP,PE IV,PE Vol,PE Chg,PE OI,PCR';
  const lines = rows.map(
    (r) =>
      `${r.strike},${r.ceOi},${r.ceOiChg},${r.ceVolume},${r.ceIv},${r.ceLtp},${r.ceDelta},${r.ceGamma},${r.ceTheta},${r.ceVega},${r.ceRho},${r.peRho},${r.peVega},${r.peTheta},${r.peGamma},${r.peDelta},${r.peLtp},${r.peIv},${r.peVolume},${r.peOiChg},${r.peOi},${r.strikePcr}`,
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${symbol}_${expiry.replace(/\s/g, '_')}_chain.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export { fetchOptionChainLive, refreshOptionChainsLive } from './optionChainLiveService';
