/**
 * TradingView-backed forex + crypto tickers used site-wide.
 * Keep in sync with server/market/tradingview/symbolMap.mjs.
 */

export const CORE_FOREX_LIVE_SYMBOLS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDINR',
  'AUDUSD',
  'USDCAD',
  'USDCHF',
  'XAUUSD',
  'XAGUSD',
  'DXY',
] as const;

export const CORE_CRYPTO_LIVE_SYMBOLS = [
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
  'DOGE',
  'ADA',
  'AVAX',
] as const;

export const CORE_GLOBAL_LIVE_SYMBOLS: string[] = [
  ...CORE_FOREX_LIVE_SYMBOLS,
  ...CORE_CRYPTO_LIVE_SYMBOLS,
];

export const FOREX_WATCH_META = [
  { symbol: 'EURUSD', label: 'EUR/USD', name: 'Euro / Dollar' },
  { symbol: 'GBPUSD', label: 'GBP/USD', name: 'Pound / Dollar' },
  { symbol: 'USDJPY', label: 'USD/JPY', name: 'Dollar / Yen' },
  { symbol: 'USDINR', label: 'USD/INR', name: 'Dollar / Rupee' },
  { symbol: 'AUDUSD', label: 'AUD/USD', name: 'Aussie / Dollar' },
  { symbol: 'USDCAD', label: 'USD/CAD', name: 'Dollar / Cad' },
  { symbol: 'USDCHF', label: 'USD/CHF', name: 'Dollar / Franc' },
  { symbol: 'XAUUSD', label: 'XAU/USD', name: 'Gold' },
  { symbol: 'XAGUSD', label: 'XAG/USD', name: 'Silver' },
  { symbol: 'DXY', label: 'DXY', name: 'US Dollar Index' },
] as const;

export const CRYPTO_WATCH_META = [
  { symbol: 'BTC', label: 'BTC/USDT', name: 'Bitcoin' },
  { symbol: 'ETH', label: 'ETH/USDT', name: 'Ethereum' },
  { symbol: 'SOL', label: 'SOL/USDT', name: 'Solana' },
  { symbol: 'BNB', label: 'BNB/USDT', name: 'BNB' },
  { symbol: 'XRP', label: 'XRP/USDT', name: 'Ripple' },
  { symbol: 'DOGE', label: 'DOGE/USDT', name: 'Dogecoin' },
  { symbol: 'ADA', label: 'ADA/USDT', name: 'Cardano' },
  { symbol: 'AVAX', label: 'AVAX/USDT', name: 'Avalanche' },
] as const;

/** Map slash / exchange aliases → CORE_GLOBAL app tickers. */
export const GLOBAL_SYMBOL_ALIASES: Record<string, string> = {
  BTC: 'BTC',
  BITCOIN: 'BTC',
  BTCUSDT: 'BTC',
  'BTC/USDT': 'BTC',
  'BTC/USD': 'BTC',
  ETH: 'ETH',
  ETHEREUM: 'ETH',
  ETHUSDT: 'ETH',
  'ETH/USDT': 'ETH',
  'ETH/USD': 'ETH',
  SOL: 'SOL',
  SOLANA: 'SOL',
  SOLUSDT: 'SOL',
  'SOL/USDT': 'SOL',
  BNB: 'BNB',
  BNBUSDT: 'BNB',
  'BNB/USDT': 'BNB',
  XRP: 'XRP',
  RIPPLE: 'XRP',
  XRPUSDT: 'XRP',
  'XRP/USDT': 'XRP',
  DOGE: 'DOGE',
  DOGEUSDT: 'DOGE',
  'DOGE/USDT': 'DOGE',
  ADA: 'ADA',
  ADAUSDT: 'ADA',
  'ADA/USDT': 'ADA',
  AVAX: 'AVAX',
  AVAXUSDT: 'AVAX',
  'AVAX/USDT': 'AVAX',
  EURUSD: 'EURUSD',
  'EUR/USD': 'EURUSD',
  GBPUSD: 'GBPUSD',
  'GBP/USD': 'GBPUSD',
  USDJPY: 'USDJPY',
  'USD/JPY': 'USDJPY',
  USDINR: 'USDINR',
  'USD/INR': 'USDINR',
  AUDUSD: 'AUDUSD',
  'AUD/USD': 'AUDUSD',
  USDCAD: 'USDCAD',
  'USD/CAD': 'USDCAD',
  USDCHF: 'USDCHF',
  'USD/CHF': 'USDCHF',
  XAUUSD: 'XAUUSD',
  'XAU/USD': 'XAUUSD',
  GOLD: 'XAUUSD',
  XAGUSD: 'XAGUSD',
  'XAG/USD': 'XAGUSD',
  SILVER: 'XAGUSD',
  DXY: 'DXY',
};

export function toGlobalLiveSymbol(symbol: string): string {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  if (GLOBAL_SYMBOL_ALIASES[raw]) return GLOBAL_SYMBOL_ALIASES[raw];
  const compact = raw.replace(/\s+/g, '').replace(/\//g, '');
  if (GLOBAL_SYMBOL_ALIASES[compact]) return GLOBAL_SYMBOL_ALIASES[compact];
  if (compact.endsWith('USDT') && compact.length > 4) return compact.slice(0, -4);
  return compact;
}
