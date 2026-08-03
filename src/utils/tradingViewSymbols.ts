import { FNO_UNIVERSE, type FnoInstrumentType } from '../data/fnoUniverse';

/** Map app symbols → TradingView exchange symbols (NSE/BSE) */
const INDEX_TV: Record<string, string> = {
  NIFTY: 'NSE:NIFTY',
  BANKNIFTY: 'NSE:BANKNIFTY',
  FINNIFTY: 'NSE:FINNIFTY',
  MIDCPNIFTY: 'NSE:MIDCPNIFTY',
  NIFTYNXT50: 'NSE:NIFTYNXT50',
  SENSEX: 'BSE:SENSEX',
  BANKEX: 'BSE:BANKEX',
};

/** Crypto + forex + commodity aliases users actually type in chat. */
const GLOBAL_TV: Record<string, string> = {
  BTC: 'BINANCE:BTCUSDT',
  BITCOIN: 'BINANCE:BTCUSDT',
  BTCUSDT: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  ETHEREUM: 'BINANCE:ETHUSDT',
  ETHUSDT: 'BINANCE:ETHUSDT',
  SOL: 'BINANCE:SOLUSDT',
  SOLANA: 'BINANCE:SOLUSDT',
  BNB: 'BINANCE:BNBUSDT',
  XRP: 'BINANCE:XRPUSDT',
  RIPPLE: 'BINANCE:XRPUSDT',
  DOGE: 'BINANCE:DOGEUSDT',
  ADA: 'BINANCE:ADAUSDT',
  AVAX: 'BINANCE:AVAXUSDT',
  EURUSD: 'FX:EURUSD',
  GBPUSD: 'FX:GBPUSD',
  USDJPY: 'FX:USDJPY',
  AUDUSD: 'FX:AUDUSD',
  USDCAD: 'FX:USDCAD',
  USDCHF: 'FX:USDCHF',
  NZDUSD: 'FX:NZDUSD',
  EURGBP: 'FX:EURGBP',
  EURJPY: 'FX:EURJPY',
  GBPJPY: 'FX:GBPJPY',
  USDINR: 'FX_IDC:USDINR',
  EURINR: 'FX_IDC:EURINR',
  GBPINR: 'FX_IDC:GBPINR',
  XAUUSD: 'OANDA:XAUUSD',
  GOLD: 'OANDA:XAUUSD',
  SONA: 'OANDA:XAUUSD',
  XAGUSD: 'OANDA:XAGUSD',
  SILVER: 'OANDA:XAGUSD',
  CHANDI: 'OANDA:XAGUSD',
  CRUDE: 'TVC:USOIL',
  CRUDEOIL: 'TVC:USOIL',
  USOIL: 'TVC:USOIL',
};

export type TvChartStyle = '0' | '1' | '2' | '3' | '8' | '9' | '10';

export const TV_CHART_STYLES: { id: TvChartStyle; label: string }[] = [
  { id: '1', label: 'Candles' },
  { id: '8', label: 'Heikin Ashi' },
  { id: '9', label: 'Hollow Candles' },
  { id: '0', label: 'Bars' },
  { id: '2', label: 'Line' },
  { id: '3', label: 'Area' },
  { id: '10', label: 'Baseline' },
];

export type TvInterval =
  | '1'
  | '3'
  | '5'
  | '15'
  | '30'
  | '60'
  | '120'
  | '240'
  | 'D'
  | 'W'
  | 'M';

export const TV_TIMEFRAMES: { id: TvInterval; label: string }[] = [
  { id: '1', label: '1m' },
  { id: '3', label: '3m' },
  { id: '5', label: '5m' },
  { id: '15', label: '15m' },
  { id: '30', label: '30m' },
  { id: '60', label: '1H' },
  { id: '120', label: '2H' },
  { id: '240', label: '4H' },
  { id: 'D', label: '1D' },
  { id: 'W', label: '1W' },
  { id: 'M', label: '1M' },
];

export const TV_STUDY_PRESETS: { id: string; label: string; studies: string[] }[] = [
  { id: 'none', label: 'No preset', studies: [] },
  { id: 'ema', label: 'EMA', studies: ['STD;EMA@tv-basicstudies'] },
  { id: 'rsi', label: 'RSI', studies: ['STD;RSI@tv-basicstudies'] },
  { id: 'macd', label: 'MACD', studies: ['STD;MACD@tv-basicstudies'] },
  { id: 'bb', label: 'Bollinger Bands', studies: ['STD;Bollinger Bands@tv-basicstudies'] },
  { id: 'vwap', label: 'VWAP', studies: ['STD;VWAP@tv-basicstudies'] },
  { id: 'supertrend', label: 'Supertrend', studies: ['STD;Supertrend@tv-basicstudies'] },
  { id: 'ichimoku', label: 'Ichimoku', studies: ['STD;Ichimoku Cloud@tv-basicstudies'] },
  { id: 'volume', label: 'Volume', studies: ['STD;Volume@tv-basicstudies'] },
];

export function toTradingViewSymbol(symbol: string, type?: FnoInstrumentType): string {
  const sym = symbol.trim().toUpperCase();
  if (INDEX_TV[sym]) return INDEX_TV[sym];
  if (type === 'index') return `NSE:${sym}`;
  return `NSE:${sym}`;
}

/** Parse user input: NIFTY, NSE:NIFTY, RELIANCE, BTC, EURUSD */
export function parseTradingViewInput(input: string): string {
  const raw = input.trim().toUpperCase();
  if (!raw) return 'NSE:NIFTY';
  if (raw.includes(':')) return raw;
  const global = GLOBAL_TV[raw.replace(/[\s/-]/g, '')];
  if (global) return global;
  return toTradingViewSymbol(raw);
}

/** Label shown on the chart header, e.g. NSE:BANKNIFTY → BANKNIFTY */
export function tradingViewSymbolLabel(tvSymbol: string): string {
  const part = tvSymbol.includes(':') ? tvSymbol.split(':')[1] : tvSymbol;
  return part || tvSymbol;
}

/**
 * TradingView is not licensed to serve these exchanges through the free embed
 * widget — it answers with "This symbol is only available on TradingView".
 * We draw those from our own /api/market/ohlc feed instead.
 */
const WIDGET_BLOCKED_EXCHANGES = new Set(['NSE', 'BSE', 'MCX', 'NCDEX']);

export function isWidgetRestricted(tvSymbol: string): boolean {
  const exchange = tvSymbol.includes(':') ? tvSymbol.split(':')[0] : '';
  return WIDGET_BLOCKED_EXCHANGES.has(exchange.toUpperCase());
}

/** TV symbol → the plain name our own market API expects (NSE:NIFTY → NIFTY). */
export function apiSymbolFromTv(tvSymbol: string): string {
  return tradingViewSymbolLabel(tvSymbol).toUpperCase();
}

/** Timeframes our OHLC backend can resolve; 3m and monthly have no mapping. */
const NATIVE_INTERVAL: Partial<Record<TvInterval, string>> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  D: '1d',
  W: '1w',
};

export function nativeIntervalFor(interval: TvInterval): string | null {
  return NATIVE_INTERVAL[interval] ?? null;
}

export const NATIVE_TIMEFRAMES = TV_TIMEFRAMES.filter((tf) => nativeIntervalFor(tf.id) !== null);

/** Study presets we can compute locally for the native chart. */
const NATIVE_STUDY_IDS = new Set(['none', 'ema', 'rsi', 'macd', 'bb', 'vwap']);

export const NATIVE_STUDY_PRESETS = TV_STUDY_PRESETS.filter((s) => NATIVE_STUDY_IDS.has(s.id));

const FNO_SYMBOLS = new Set(FNO_UNIVERSE.map((i) => i.symbol.toUpperCase()));

/** Words that mean "put this on the chart" across English / Hindi / Hinglish. */
const CHART_INTENT =
  /\b(chart|charts|graph|candle|candles|candlestick|timeframe|time frame|plot|dikhao?|dikha|dekhna|dekho|dekhe|kholo|khol|open|show|display|laga(?:o|do)?|lgao?)\b/i;

const INTERVAL_WORDS: { re: RegExp; id: TvInterval }[] = [
  { re: /\b(1\s*m(?:in|inute)?s?|one\s*min(?:ute)?)\b/i, id: '1' },
  { re: /\b3\s*m(?:in|inute)?s?\b/i, id: '3' },
  { re: /\b5\s*m(?:in|inute)?s?\b/i, id: '5' },
  { re: /\b15\s*m(?:in|inute)?s?\b/i, id: '15' },
  { re: /\b30\s*m(?:in|inute)?s?\b/i, id: '30' },
  { re: /\b(1\s*h(?:r|our)?s?|60\s*m(?:in|inute)?s?|hourly)\b/i, id: '60' },
  { re: /\b2\s*h(?:r|our)?s?\b/i, id: '120' },
  { re: /\b(4\s*h(?:r|our)?s?|240\s*m(?:in|inute)?s?)\b/i, id: '240' },
  { re: /\b(1\s*d(?:ay)?|daily|din\s*ka)\b/i, id: 'D' },
  { re: /\b(1\s*w(?:eek|k)?|weekly|hafte\s*ka)\b/i, id: 'W' },
  { re: /\b(1\s*mo(?:nth)?|monthly|mahine\s*ka)\b/i, id: 'M' },
];

const STUDY_WORDS: { re: RegExp; id: string }[] = [
  { re: /\bema\b/i, id: 'ema' },
  { re: /\brsi\b/i, id: 'rsi' },
  { re: /\bmacd\b/i, id: 'macd' },
  { re: /\b(bollinger|bb\s*band|bollinger\s*band)\b/i, id: 'bb' },
  { re: /\bvwap\b/i, id: 'vwap' },
  { re: /\bsuper\s*trend\b/i, id: 'supertrend' },
  { re: /\bichimoku\b/i, id: 'ichimoku' },
  { re: /\bvolume\b/i, id: 'volume' },
];

export type ChartRequest = {
  tvSymbol: string;
  interval?: TvInterval;
  study?: string;
};

/**
 * Read "NIFTY ka 5 min chart dikha" / "open BTC 15m with RSI" from a chat message.
 * Returns null unless the user clearly asked for a chart, so normal questions
 * never hijack the panel.
 */
export function detectChartRequest(text: string): ChartRequest | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const interval = INTERVAL_WORDS.find((w) => w.re.test(raw))?.id;
  const study = STUDY_WORDS.find((w) => w.re.test(raw))?.id;
  const wantsChart = CHART_INTENT.test(raw);
  if (!wantsChart && !interval) return null;

  const explicit = raw.match(/\b([A-Z]{2,12}):([A-Z0-9._]{1,20})\b/);
  if (explicit) {
    return { tvSymbol: `${explicit[1]}:${explicit[2]}`, interval, study };
  }

  // Longest token first so BANKNIFTY wins over NIFTY, BTCUSDT over BTC.
  const tokens = Array.from(
    new Set((raw.toUpperCase().match(/[A-Z][A-Z0-9&/-]{1,19}/g) ?? []).map((t) => t.replace(/[/-]/g, ''))),
  ).sort((a, b) => b.length - a.length);

  for (const token of tokens) {
    if (GLOBAL_TV[token]) return { tvSymbol: GLOBAL_TV[token], interval, study };
    if (INDEX_TV[token]) return { tvSymbol: INDEX_TV[token], interval, study };
    if (FNO_SYMBOLS.has(token)) return { tvSymbol: toTradingViewSymbol(token), interval, study };
  }

  // "5 min chart dikha" with no symbol — keep the current one, just retune it.
  if (interval || study) return { tvSymbol: '', interval, study };
  return null;
}
