/**
 * Live option-chain features for Opportunity Options Flow.
 * Numbers come from INDstocks /market/option-chain — never invented.
 */

export type OptionFlowSnap = {
  symbol: string;
  expiry: string;
  fetchedAt: number;
  spot: number;
  ceOi: number;
  peOi: number;
  ceOiChg: number;
  peOiChg: number;
  ceVol: number;
  peVol: number;
  pcr: number | null;
  atmStrike: number | null;
  atmBandCeOiChg: number;
  atmBandPeOiChg: number;
};

export type OptionFlowKind = 'long_buildup' | 'short_buildup' | 'short_cover' | 'long_unwind';

export type OptionFlowSignal = {
  kind: OptionFlowKind;
  direction: 'bullish' | 'bearish';
  active: boolean;
  label: string;
};

function isIndexUnderlier(symbol: string): boolean {
  return /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX|INDIAVIX)/.test(
    String(symbol || '').toUpperCase(),
  );
}

export function optionFlowDayPct(
  last: number,
  prevClose: number | null | undefined,
  sessionChangePct: number | null | undefined,
): number | null {
  if (prevClose != null && prevClose > 0 && last > 0) {
    return ((last - prevClose) / prevClose) * 100;
  }
  if (sessionChangePct != null && Number.isFinite(sessionChangePct)) return sessionChangePct;
  return null;
}

/** Classify real OI + day price. Null = no tradeable flow. */
export function optionFlowSignal(flow: OptionFlowSnap, dayPct: number): OptionFlowSignal | null {
  const totalOi = flow.ceOi + flow.peOi;
  const absChg = Math.abs(flow.ceOiChg) + Math.abs(flow.peOiChg);
  const atmAbs = Math.abs(flow.atmBandCeOiChg) + Math.abs(flow.atmBandPeOiChg);
  const index = isIndexUnderlier(flow.symbol);
  const minOi = index ? 400_000 : 20_000;
  const minChgPct = index ? 1.5 : 3;
  const minAtm = index ? 40_000 : 6_000;
  if (!(totalOi >= minOi)) return null;
  const chgPct = totalOi > 0 ? (absChg / totalOi) * 100 : 0;
  if (chgPct < minChgPct && atmAbs < minAtm) return null;
  if (!(flow.ceVol + flow.peVol > 0) && atmAbs < minAtm) return null;
  if (!Number.isFinite(dayPct)) return null;

  const twoWay =
    flow.atmBandCeOiChg > 0 &&
    flow.atmBandPeOiChg > 0 &&
    atmAbs > 0 &&
    Math.abs(flow.atmBandCeOiChg - flow.atmBandPeOiChg) / atmAbs < 0.22;
  if (twoWay) return null;

  const oiAdding = flow.ceOiChg + flow.peOiChg > 0;
  const priceUp = dayPct > 0;
  const kind: OptionFlowKind = priceUp
    ? oiAdding
      ? 'long_buildup'
      : 'short_cover'
    : oiAdding
      ? 'short_buildup'
      : 'long_unwind';
  const bullish = kind === 'long_buildup' || kind === 'short_cover';

  const atmCallAdd = flow.atmBandCeOiChg > 0;
  const atmPutAdd = flow.atmBandPeOiChg > 0;
  const atmCallDrop = flow.atmBandCeOiChg < 0;
  const atmPutDrop = flow.atmBandPeOiChg < 0;
  const atmConfirms = bullish
    ? atmCallAdd || atmPutAdd
    : atmPutAdd || atmCallAdd;
  if (!atmConfirms) return null;

  if (kind === 'long_buildup' && atmCallDrop && atmPutDrop) return null;
  if (kind === 'short_buildup' && atmCallDrop && atmPutDrop) return null;

  const cover = kind === 'short_cover' || kind === 'long_unwind';
  const absDay = Math.abs(dayPct);
  if (cover && absDay < 0.7) return null;
  if (!cover && absDay < 0.25) return null;

  const active = cover ? absDay >= 1.0 : absDay >= 0.45;
  const label =
    kind === 'long_buildup'
      ? active
        ? '🔥 LONG BUILDUP'
        : 'WATCH CALLS'
      : kind === 'short_buildup'
        ? active
          ? '🔥 SHORT BUILDUP'
          : 'WATCH PUTS'
        : kind === 'short_cover'
          ? 'SHORT COVER'
          : 'LONG UNWIND';

  return { kind, direction: bullish ? 'bullish' : 'bearish', active, label };
}
