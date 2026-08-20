import { FNO_UNIVERSE, type FnoInstrumentType } from '../data/fnoUniverse';
import { toGlobalLiveSymbol } from '../data/coreGlobalLiveSymbols';

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
  EURUSD: 'FX_IDC:EURUSD',
  GBPUSD: 'FX_IDC:GBPUSD',
  USDJPY: 'FX_IDC:USDJPY',
  AUDUSD: 'FX_IDC:AUDUSD',
  USDCAD: 'FX_IDC:USDCAD',
  USDCHF: 'FX_IDC:USDCHF',
  NZDUSD: 'FX_IDC:NZDUSD',
  EURGBP: 'FX_IDC:EURGBP',
  EURJPY: 'FX_IDC:EURJPY',
  GBPJPY: 'FX_IDC:GBPJPY',
  USDINR: 'FX_IDC:USDINR',
  EURINR: 'FX_IDC:EURINR',
  GBPINR: 'FX_IDC:GBPINR',
  DXY: 'TVC:DXY',
  VIX: 'NSE:INDIAVIX',
  INDIAVIX: 'NSE:INDIAVIX',
  XAUUSD: 'OANDA:XAUUSD',
  XAGUSD: 'OANDA:XAGUSD',
  CRUDE: 'MCX:CRUDEOIL',
  CRUDEOIL: 'MCX:CRUDEOIL',
  GOLD: 'MCX:GOLD',
  SONA: 'MCX:GOLD',
  SILVER: 'MCX:SILVER',
  CHANDI: 'MCX:SILVER',
  USOIL: 'TVC:USOIL',
  NATURALGAS: 'MCX:NATURALGAS',
  COPPER: 'MCX:COPPER',
  ZINC: 'MCX:ZINC',
  ALUMINIUM: 'MCX:ALUMINIUM',
  NICKEL: 'MCX:NICKEL',
  LEAD: 'MCX:LEAD',
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

/** Study ids follow TradingView's tv-basicstudies naming; unknown ids are ignored by the widget. */
export const TV_STUDY_PRESETS: { id: string; label: string; studies: string[] }[] = [
  { id: 'ema', label: 'EMA (20, 50)', studies: ['MAExp@tv-basicstudies'] },
  { id: 'sma', label: 'MA / SMA (20, 50)', studies: ['MASimple@tv-basicstudies'] },
  { id: 'bb', label: 'Bollinger Bands', studies: ['BB@tv-basicstudies'] },
  { id: 'vwap', label: 'VWAP', studies: ['VWAP@tv-basicstudies'] },
  { id: 'supertrend', label: 'Supertrend', studies: ['STD;Supertrend'] },
  { id: 'ichimoku', label: 'Ichimoku Cloud', studies: ['IchimokuCloud@tv-basicstudies'] },
  { id: 'rsi', label: 'RSI', studies: ['RSI@tv-basicstudies'] },
  { id: 'macd', label: 'MACD', studies: ['MACD@tv-basicstudies'] },
  { id: 'stoch', label: 'Stochastic', studies: ['Stochastic@tv-basicstudies'] },
  { id: 'atr', label: 'ATR', studies: ['ATR@tv-basicstudies'] },
  { id: 'volume', label: 'Volume', studies: ['Volume@tv-basicstudies'] },
  { id: 'cci', label: 'CCI', studies: ['CCI@tv-basicstudies'] },
  { id: 'willr', label: 'Williams %R', studies: ['WillR@tv-basicstudies'] },
  { id: 'obv', label: 'On Balance Volume', studies: ['OBV@tv-basicstudies'] },
  { id: 'adx', label: 'ADX', studies: ['ADX@tv-basicstudies'] },
  { id: 'mom', label: 'Momentum', studies: ['Mom@tv-basicstudies'] },
  { id: 'roc', label: 'Rate of Change', studies: ['ROC@tv-basicstudies'] },
];

/** Studies are stored as one comma-joined string so a chat message can carry them. */
export function parseStudies(value: string): string[] {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'none');
}

export function joinStudies(list: string[]): string {
  return list.length ? list.join(',') : 'none';
}

/** Human label for a study id (technical preset or raw id). */
export function technicalStudyLabel(id: string): string {
  return TV_STUDY_PRESETS.find((s) => s.id === id)?.label ?? id.toUpperCase();
}

export function tvStudyIds(list: string[]): string[] {
  return list.flatMap((id) => TV_STUDY_PRESETS.find((s) => s.id === id)?.studies ?? []);
}

export function toTradingViewSymbol(symbol: string, type?: FnoInstrumentType): string {
  const sym = symbol.trim().toUpperCase();
  if (INDEX_TV[sym]) return INDEX_TV[sym];
  if (type === 'index') return `NSE:${sym}`;
  return `NSE:${sym}`;
}

/** Full TradingView chart URL for the same symbol + Opportunity/desk timeframe. */
export function tradingViewChartUrl(
  symbol: string,
  timeframe?: string,
  exchange?: 'NSE' | 'BSE',
): string {
  const raw = String(symbol || '').trim().toUpperCase();
  let tvSymbol: string;
  if (!raw) {
    tvSymbol = 'NSE:NIFTY';
  } else if (raw.includes(':')) {
    tvSymbol = raw;
  } else if (exchange === 'BSE' && !INDEX_TV[raw]) {
    tvSymbol = `BSE:${raw}`;
  } else {
    tvSymbol = toTradingViewSymbol(raw);
  }
  const interval = normalizeTvInterval(timeframe) ?? '15';
  const params = new URLSearchParams({ symbol: tvSymbol, interval });
  return `https://in.tradingview.com/chart/?${params.toString()}`;
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
 * Exchanges our own /api/market/ohlc feed can serve. Indian ones have to be
 * native because TradingView's free widget refuses them, and the rest are drawn
 * natively on purpose: Wolf AI can only draw its markings on our own canvas.
 * Anything else (US stocks, exotic pairs) still gets the TradingView widget.
 */
const NATIVE_EXCHANGES = new Set([
  'NSE',
  'BSE',
  'MCX',
  'NCDEX',
  'BINANCE',
  'FX_IDC',
  'OANDA',
  'TVC',
]);

export function usesNativeChart(tvSymbol: string): boolean {
  // Plain "BTC" / "NIFTY" must resolve to BINANCE:/NSE: before the exchange check.
  const resolved = String(tvSymbol || '').includes(':')
    ? String(tvSymbol)
    : parseTradingViewInput(String(tvSymbol || ''));
  const exchange = resolved.includes(':') ? resolved.split(':')[0] : '';
  return NATIVE_EXCHANGES.has(exchange.toUpperCase());
}

const MCX_UNDERLYINGS = new Set([
  'GOLD',
  'GOLDM',
  'GOLDGUINEA',
  'GOLDPETAL',
  'SILVER',
  'SILVERM',
  'SILVERMIC',
  'CRUDEOIL',
  'CRUDEOILM',
  'NATURALGAS',
  'NATGASMINI',
  'COPPER',
  'COPPERM',
  'ZINC',
  'ZINCMINI',
  'LEAD',
  'ALUMINIUM',
  'NICKEL',
  'MENTHAOIL',
  'COTTON',
]);

/** TV symbol → market API ticker (NSE:NIFTY → NIFTY, MCX:GOLD stays MCX:GOLD). */
export function apiSymbolFromTv(tvSymbol: string): string {
  const resolved = String(tvSymbol || '').includes(':')
    ? String(tvSymbol).toUpperCase()
    : parseTradingViewInput(String(tvSymbol || ''));
  const exchange = resolved.includes(':') ? resolved.split(':')[0].toUpperCase() : '';
  const label = tradingViewSymbolLabel(resolved).toUpperCase();
  if (exchange === 'MCX' || exchange === 'NCDEX' || MCX_UNDERLYINGS.has(label)) {
    return `${exchange === 'NCDEX' ? 'NCDEX' : 'MCX'}:${label}`;
  }
  // Crypto/forex aliases: BTCUSDT/ETHUSDT → BTC/ETH (live tape + OHLC keys).
  const global = toGlobalLiveSymbol(label);
  return (global || label).toUpperCase();
}

/** Timeframes our OHLC backend can resolve. */
const NATIVE_INTERVAL: Partial<Record<TvInterval, string>> = {
  '1': '1m',
  '3': '3m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  D: '1d',
  W: '1w',
  M: '1M',
};

export function nativeIntervalFor(interval: TvInterval): string | null {
  return NATIVE_INTERVAL[interval] ?? null;
}

/**
 * Accept whatever a model reports for a timeframe — "15m", "15", "1H",
 * "daily", "1 hour" — and pin it to one of our intervals.
 */
export function normalizeTvInterval(raw: unknown): TvInterval | null {
  const value = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!value) return null;

  const direct = TV_TIMEFRAMES.find(
    (tf) => tf.id.toLowerCase() === value || tf.label.toLowerCase() === value,
  );
  if (direct) return direct.id;

  if (/^(1d|d|day|daily)$/.test(value)) return 'D';
  if (/^(1w|w|week|weekly)$/.test(value)) return 'W';
  if (/^(1mo|mo|month|monthly)$/.test(value)) return 'M';

  // Accept typos like 5mnt / 15mint / 5mins (Hinglish chat)
  const minutes = value.match(/^(\d{1,4})(m|min|mins|mint|mnt|mnts|minute|minutes)?$/);
  if (minutes) {
    const n = Number(minutes[1]);
    const known: TvInterval[] = ['1', '3', '5', '15', '30', '60', '120', '240'];
    if (known.includes(String(n) as TvInterval)) return String(n) as TvInterval;
  }

  const hours = value.match(/^(\d{1,2})(h|hr|hrs|hour|hours)$/);
  if (hours) {
    const n = Number(hours[1]) * 60;
    if (n === 60 || n === 120 || n === 240) return String(n) as TvInterval;
  }

  return null;
}

export const NATIVE_TIMEFRAMES = TV_TIMEFRAMES.filter((tf) => nativeIntervalFor(tf.id) !== null);

/** Study presets we can compute locally for the native chart. */
const NATIVE_STUDY_IDS = new Set([
  'ema',
  'sma',
  'bb',
  'vwap',
  'supertrend',
  'ichimoku',
  'rsi',
  'macd',
  'stoch',
  'atr',
  'volume',
  'cci',
  'willr',
  'obv',
  'mom',
  'roc',
]);

export const NATIVE_STUDY_PRESETS = TV_STUDY_PRESETS.filter((s) => NATIVE_STUDY_IDS.has(s.id));

/** Technicals shown in Terminal Indicators modal (full basic set). */
export const TECHNICAL_STUDY_PRESETS = TV_STUDY_PRESETS;

const FNO_SYMBOLS = new Set(FNO_UNIVERSE.map((i) => i.symbol.toUpperCase()));

/** Words that mean "put this on the chart" across English / Hindi / Hinglish. */
const CHART_INTENT =
  /\b(chart|charts|graph|candle|candles|candlestick|timeframe|time frame|plot|dikhao?|dikha|dekhna|dekho|dekhe|kholo|khol|open|show|display|laga(?:o|do)?|lgao?)\b/i;

/** Minute unit: m / min / mins / mint / mnt (common Hinglish typo for "min"). */
const M = String.raw`m(?:in(?:ute)?s?|ints?|nts?)?`;

const INTERVAL_WORDS: { re: RegExp; id: TvInterval }[] = [
  // Longer minutes first so 15/30 win before a bare "5m" fragment.
  { re: new RegExp(String.raw`\b15\s*${M}\b`, 'i'), id: '15' },
  { re: new RegExp(String.raw`\b30\s*${M}\b`, 'i'), id: '30' },
  { re: new RegExp(String.raw`\b60\s*${M}\b`, 'i'), id: '60' },
  { re: new RegExp(String.raw`\b240\s*${M}\b`, 'i'), id: '240' },
  { re: new RegExp(String.raw`\b(1\s*${M}|one\s*min(?:ute)?s?)\b`, 'i'), id: '1' },
  { re: new RegExp(String.raw`\b3\s*${M}\b`, 'i'), id: '3' },
  { re: new RegExp(String.raw`\b5\s*${M}\b`, 'i'), id: '5' },
  { re: /\b(1\s*h(?:r|our)?s?|hourly)\b/i, id: '60' },
  { re: /\b2\s*h(?:r|our)?s?\b/i, id: '120' },
  { re: /\b4\s*h(?:r|our)?s?\b/i, id: '240' },
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
  // "RSI aur MACD ke saath" should switch both on, not just the first one.
  const matched = STUDY_WORDS.filter((w) => w.re.test(raw)).map((w) => w.id);
  const study = matched.length ? matched.join(',') : undefined;
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

/**
 * Tickers that double as ordinary words. Without this a message like
 * "koi idea hai" would silently open an IDEA chart.
 */
const AMBIGUOUS_TICKERS = new Set([
  'IDEA',
  'CALL',
  'PUT',
  'TREND',
  'POWER',
  'FORCE',
  'INDIA',
  'ZONE',
  'GAP',
  'BUY',
  'SELL',
  'VIEW',
  'RISK',
  'DATA',
  'NEWS',
  'TIME',
  'BEST',
  'GOOD',
  'HIGH',
  'LOW',
  'OPEN',
  'CLOSE',
  'LONG',
  'SHORT',
  'LEVEL',
  'PRICE',
  'MARKET',
  'TARGET',
  'PROFIT',
  'LOSS',
]);

/**
 * Resolve a symbol the model read off a screenshot. Unlike
 * parseTradingViewInput this refuses to guess: an unknown ticker returns null
 * rather than an NSE symbol that would load an empty chart.
 */
export function resolveKnownSymbol(raw: unknown): string | null {
  const input = String(raw ?? '').trim().toUpperCase();
  if (!input) return null;

  if (input.includes(':')) {
    const [exchange, ticker] = input.split(':');
    if (/^[A-Z_]{2,12}$/.test(exchange) && /^[A-Z0-9._]{1,20}$/.test(ticker)) return input;
    return null;
  }

  const token = input.replace(/[\s/-]/g, '');
  if (GLOBAL_TV[token]) return GLOBAL_TV[token];
  if (INDEX_TV[token]) return INDEX_TV[token];
  if (FNO_SYMBOLS.has(token)) return toTradingViewSymbol(token);
  // Crypto pairs the alias table does not list yet (e.g. LINKUSDT).
  if (/^[A-Z]{2,10}USDT$/.test(token)) return `BINANCE:${token}`;
  return null;
}

/**
 * "Order block mark kro" names no instrument, but it clearly means the chart
 * already on screen. Detecting that keeps the request attached to it.
 */
const MARKUP_INTENT = new RegExp(
  [
    '\\b(mark|marking|markings|markup|draw|annotate|highlight|plot)\\b',
    // Hindi / Hinglish: mark kar do / mark kr ke do / mark kar dena / marking krdo
    'mark(?:ing)?\\s*(kar|kr|kro|krdo|kardo|ke|dena|dijiye|karva|karwa)',
    // Tool names alone imply "draw this" on the open chart
    'order\\s*block|\\bob\\b|\\bfvg\\b|imbalance|liquidity',
    '\\bbos\\b|choch|break\\s*of\\s*structure',
    'trend\\s*line|trendlines?|trend\\s*live|trend\\s*channel|price\\s*channel|neckline',
    '\\bfib\\b|fibonacci|retracement',
    'khinch|khich|laga\\s*do|lagao|bana\\s*do|dikha(?:\\s*do)?|dikhado',
    // S/R only with a mark/draw verb — "support kya hai" is a lesson, not a mark ask
    '(?:support|resistance|s\\/r|\\bzone\\b|\\blevels?\\b|pivot).{0,24}(?:mark|draw|khinch|laga|dikha)',
    '(?:mark|draw|khinch|laga|dikha).{0,24}(?:support|resistance|s\\/r|\\bzone\\b|\\blevels?\\b|pivot)',
  ].join('|'),
  'i',
);

export function isChartMarkupRequest(text: string): boolean {
  const t = String(text || '');
  // Pure concept lessons stay text-only.
  if (
    /\b(kya\s+(hai|hota|hoti)|what\s+is|what\s+are|explain|samjha|samjhao|meaning|definition)\b/i.test(
      t,
    ) &&
    !/\b(mark|draw|khinch|laga|dikha|annotate|plot)\b/i.test(t)
  ) {
    return false;
  }
  return MARKUP_INTENT.test(t);
}

/**
 * Find the instrument a plain question is about — no "chart" keyword needed,
 * so "NIFTY ka kya view hai" can bring its own chart along.
 * Returns null when nothing is named, which keeps concept questions
 * ("RSI kya hota hai") chart-free.
 */
export function detectInstrumentMention(text: string): string | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const explicit = raw.match(/\b([A-Z]{2,12}):([A-Z0-9._]{1,20})\b/);
  if (explicit) return `${explicit[1]}:${explicit[2]}`;

  const tokens = Array.from(
    new Set((raw.toUpperCase().match(/[A-Z][A-Z0-9&/-]{1,19}/g) ?? []).map((t) => t.replace(/[/-]/g, ''))),
  ).sort((a, b) => b.length - a.length);

  for (const token of tokens) {
    if (AMBIGUOUS_TICKERS.has(token)) continue;
    if (GLOBAL_TV[token]) return GLOBAL_TV[token];
    if (INDEX_TV[token]) return INDEX_TV[token];
    // Single stocks need a longer match; 2-3 letter tickers hit English words.
    if (token.length >= 4 && FNO_SYMBOLS.has(token)) return toTradingViewSymbol(token);
  }
  return null;
}
