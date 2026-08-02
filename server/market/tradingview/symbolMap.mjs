/** App symbol → TradingView exchange symbol (NSE/BSE). */

const INDEX_TV = {
  NIFTY: 'NSE:NIFTY',
  BANKNIFTY: 'NSE:BANKNIFTY',
  FINNIFTY: 'NSE:FINNIFTY',
  MIDCPNIFTY: 'NSE:MIDCPNIFTY',
  NIFTYNXT50: 'NSE:NIFTYNXT50',
  SENSEX: 'BSE:SENSEX',
  BANKEX: 'BSE:BANKEX',
  VIX: 'NSE:INDIAVIX',
  INDIAVIX: 'NSE:INDIAVIX',
};

const TV_TO_APP = Object.fromEntries(
  Object.entries(INDEX_TV).map(([app, tv]) => [tv.toUpperCase(), app]),
);

export function toTvSymbol(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  if (INDEX_TV[sym]) return INDEX_TV[sym];
  if (sym.includes(':')) return sym;
  return `NSE:${sym}`;
}

export function fromTvSymbol(tvSym, requested = []) {
  const t = String(tvSym || '').trim().toUpperCase();
  if (!t) return null;
  if (TV_TO_APP[t]) return TV_TO_APP[t];
  const m = t.match(/^(?:NSE|BSE):([A-Z0-9&.-]+)$/);
  if (m) {
    const base = m[1];
    if (requested.length && requested.includes(base)) return base;
    return base;
  }
  return null;
}
