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
  SOL: 'BINANCE:SOLUSDT',
  SOLANA: 'BINANCE:SOLUSDT',
  SOLUSDT: 'BINANCE:SOLUSDT',
  BNB: 'BINANCE:BNBUSDT',
  BNBUSDT: 'BINANCE:BNBUSDT',
  XRP: 'BINANCE:XRPUSDT',
  RIPPLE: 'BINANCE:XRPUSDT',
  XRPUSDT: 'BINANCE:XRPUSDT',
  DOGE: 'BINANCE:DOGEUSDT',
  DOGEUSDT: 'BINANCE:DOGEUSDT',
  ADA: 'BINANCE:ADAUSDT',
  ADAUSDT: 'BINANCE:ADAUSDT',
  AVAX: 'BINANCE:AVAXUSDT',
  AVAXUSDT: 'BINANCE:AVAXUSDT',
  // Common FX / metals (TradingView FX_IDC)
  'EUR/USD': 'FX_IDC:EURUSD',
  EURUSD: 'FX_IDC:EURUSD',
  'GBP/USD': 'FX_IDC:GBPUSD',
  GBPUSD: 'FX_IDC:GBPUSD',
  'USD/JPY': 'FX_IDC:USDJPY',
  USDJPY: 'FX_IDC:USDJPY',
  'USD/INR': 'FX_IDC:USDINR',
  USDINR: 'FX_IDC:USDINR',
  EURINR: 'FX_IDC:EURINR',
  GBPINR: 'FX_IDC:GBPINR',
  'AUD/USD': 'FX_IDC:AUDUSD',
  AUDUSD: 'FX_IDC:AUDUSD',
  'USD/CAD': 'FX_IDC:USDCAD',
  USDCAD: 'FX_IDC:USDCAD',
  'USD/CHF': 'FX_IDC:USDCHF',
  USDCHF: 'FX_IDC:USDCHF',
  'NZD/USD': 'FX_IDC:NZDUSD',
  NZDUSD: 'FX_IDC:NZDUSD',
  'EUR/GBP': 'FX_IDC:EURGBP',
  EURGBP: 'FX_IDC:EURGBP',
  'EUR/JPY': 'FX_IDC:EURJPY',
  EURJPY: 'FX_IDC:EURJPY',
  'GBP/JPY': 'FX_IDC:GBPJPY',
  GBPJPY: 'FX_IDC:GBPJPY',
  'EUR/INR': 'FX_IDC:EURINR',
  'GBP/INR': 'FX_IDC:GBPINR',
  'XAU/USD': 'OANDA:XAUUSD',
  XAUUSD: 'OANDA:XAUUSD',
  GOLD: 'OANDA:XAUUSD',
  SONA: 'OANDA:XAUUSD',
  'XAG/USD': 'OANDA:XAGUSD',
  XAGUSD: 'OANDA:XAGUSD',
  SILVER: 'OANDA:XAGUSD',
  CHANDI: 'OANDA:XAGUSD',
  WTI: 'TVC:USOIL',
  USOIL: 'TVC:USOIL',
  CRUDE: 'TVC:USOIL',
  BRENT: 'TVC:UKOIL',
  DXY: 'TVC:DXY',
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
  const compact = sym.replace(/\s+/g, '');
  if (INDEX_TV[compact]) return INDEX_TV[compact];
  if (compact.includes('/')) {
    const noslash = compact.replace(/\//g, '');
    if (INDEX_TV[noslash]) return INDEX_TV[noslash];
  }
  if (sym.includes(':')) return sym;
  // Default Indian cash / F&O names → NSE
  return `NSE:${compact.replace(/\//g, '')}`;
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
