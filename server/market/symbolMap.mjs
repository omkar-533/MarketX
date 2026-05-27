/** App symbol → Yahoo Finance ticker */
export const INDEX_TICKERS = {
  NIFTY: '^NSEI',
  BANKNIFTY: '^NSEBANK',
  FINNIFTY: 'NIFTY_FIN_SERVICE.NS',
  MIDCPNIFTY: 'NIFTY_MID_SELECT.NS',
  SENSEX: '^BSESN',
  BANKEX: '^BSEBANK',
  NIFTYNXT50: 'NIFTY_NEXT_50.NS',
  VIX: '^INDIAVIX',
  SP500: '^GSPC',
  DOW: '^DJI',
  NASDAQ: '^IXIC',
  FTSE: '^FTSE',
  DAX: '^GDAXI',
  NIKKEI: '^N225',
  HSI: '^HSI',
};

export function toYahooTicker(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  if (INDEX_TICKERS[sym]) return INDEX_TICKERS[sym];
  return `${sym}.NS`;
}

export function fromYahooTicker(ticker, requestedSymbols) {
  const t = String(ticker || '').trim().toUpperCase();
  for (const [sym, yf] of Object.entries(INDEX_TICKERS)) {
    if (String(yf).toUpperCase() === t) return sym;
  }
  if (requestedSymbols.includes(t)) return t;
  if (t.endsWith('.NS')) {
    const base = t.replace(/\.NS$/i, '');
    if (requestedSymbols.includes(base)) return base;
    return base;
  }
  return null;
}
