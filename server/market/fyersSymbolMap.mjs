/** App symbol → Fyers v3 symbol (NSE/BSE) */

const INDEX_FYERS = {
  NIFTY: 'NSE:NIFTY50-INDEX',
  BANKNIFTY: 'NSE:NIFTYBANK-INDEX',
  FINNIFTY: 'NSE:FINNIFTY-INDEX',
  MIDCPNIFTY: 'NSE:MIDCPNIFTY-INDEX',
  NIFTYNXT50: 'NSE:NIFTYNXT50-INDEX',
  SENSEX: 'BSE:SENSEX-INDEX',
  BANKEX: 'BSE:BANKEX-INDEX',
  VIX: 'NSE:INDIAVIX-INDEX',
};

const FYERS_TO_APP = Object.fromEntries(
  Object.entries(INDEX_FYERS).map(([app, fyers]) => [fyers.toUpperCase(), app]),
);

export function toFyersSymbol(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  if (INDEX_FYERS[sym]) return INDEX_FYERS[sym];
  if (sym.includes(':')) return sym;
  return `NSE:${sym}-EQ`;
}

export function fromFyersSymbol(fyersSym, requested = []) {
  const f = String(fyersSym || '').trim().toUpperCase();
  if (FYERS_TO_APP[f]) return FYERS_TO_APP[f];
  const m = f.match(/^NSE:([A-Z0-9&.-]+)-EQ$/);
  if (m) {
    const base = m[1];
    if (requested.length && requested.includes(base)) return base;
    return base;
  }
  return null;
}
