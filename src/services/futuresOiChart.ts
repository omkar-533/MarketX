import type { OiBar } from './optionOiTimeframe';

export type FuturesRangeId = '1m' | '3m' | '6m' | 'YTD' | '1y' | 'All';

export type OiBuildupType =
  | 'Long Buildup'
  | 'Short Buildup'
  | 'Short Covering'
  | 'Long Unwinding'
  | 'Neutral';

export const BUILDUP_COLORS: Record<OiBuildupType, string> = {
  'Long Buildup': '#22c55e',
  'Short Buildup': '#ef4444',
  'Short Covering': '#84cc16',
  'Long Unwinding': '#f59e0b',
  Neutral: '#94a3b8',
};

export interface FuturesChartBar extends OiBar {
  combinedOi: number;
  buildupType: OiBuildupType;
  buildupColor: string;
  deliveryPct: number;
}

export function lookbackDaysForRange(range: FuturesRangeId): number {
  const now = new Date();
  switch (range) {
    case '1m':
      return 22;
    case '3m':
      return 66;
    case '6m':
      return 132;
    case '1y':
      return 252;
    case 'YTD': {
      const start = new Date(now.getFullYear(), 0, 1);
      return Math.max(22, Math.ceil((now.getTime() - start.getTime()) / 86400000));
    }
    case 'All':
    default:
      return 0;
  }
}

export function enrichBarsWithBuildup(bars: OiBar[]): FuturesChartBar[] {
  return bars.map((bar, i) => {
    const prev = bars[i - 1];
    let buildupType: OiBuildupType = 'Neutral';
    if (prev) {
      const priceChg = bar.close - prev.close;
      const oiChg = bar.totalCE_OI + bar.totalPE_OI - (prev.totalCE_OI + prev.totalPE_OI);
      if (priceChg > 0 && oiChg > 0) buildupType = 'Long Buildup';
      else if (priceChg < 0 && oiChg > 0) buildupType = 'Short Buildup';
      else if (priceChg > 0 && oiChg < 0) buildupType = 'Short Covering';
      else if (priceChg < 0 && oiChg < 0) buildupType = 'Long Unwinding';
    }
    const combinedOi = bar.totalCE_OI + bar.totalPE_OI;
    const seed = bar.date.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const deliveryPct = 28 + (seed % 18);
    return {
      ...bar,
      combinedOi,
      buildupType,
      buildupColor: BUILDUP_COLORS[buildupType],
      deliveryPct,
    };
  });
}

/** lightweight-charts time key */
export function barToChartTime(bar: FuturesChartBar): string {
  return bar.date;
}

export function formatOiAxis(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(0)}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}

export function formatVolAxis(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}
