/** App symbol → TradingView exchange symbol (NSE/BSE/crypto). */

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
  // Crypto aliases → Binance USDT pairs
  BTC: 'BINANCE:BTCUSDT',
  BITCOIN: 'BINANCE:BTCUSDT',
  BTCUSDT: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  ETHEREUM: 'BINANCE:ETHUSDT',
  ETHUSDT: 'BINANCE:ETHUSDT',
};

const TV_TO_APP = Object.fromEntries(
  Object.entries(INDEX_TV).map(([app, tv]) => [tv.toUpperCase(), app]),
);

// Prefer short names when multiple aliases share one TV symbol
TV_TO_APP['BINANCE:BTCUSDT'] = 'BTC';
TV_TO_APP['BINANCE:ETHUSDT'] = 'ETH';

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

  if (requested.length) {
    if (requested.includes(t)) return t;
    const hit = requested.find((r) => toTvSymbol(r) === t);
    if (hit) return hit;
  }

  if (TV_TO_APP[t]) return TV_TO_APP[t];

  const m = t.match(/^([A-Z0-9_]+):([A-Z0-9&.\/-]+)$/);
  if (m) {
    const base = m[2];
    if (requested.length && requested.includes(base)) return base;
    return base;
  }
  return null;
}
