/**
 * Asset-aware market session clock.
 * Charts must NOT assume NSE hours for gold / forex / crypto / US stocks.
 */

const IST = 'Asia/Kolkata';
const ET = 'America/New_York';

const WEEKDAY_TO_JS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type MarketVenue =
  | 'nse_bse'
  | 'mcx'
  | 'crypto'
  | 'forex'
  | 'us_equity'
  | 'unknown';

export type MarketSession = {
  open: boolean;
  venue: MarketVenue;
  /** Short badge text: OPEN / CLOSE */
  badge: 'OPEN' | 'CLOSE';
  /** Human label for tooltip */
  label: string;
};

type ClockParts = { day: number; hours: number; minutes: number };

function partsInZone(timeZone: string, at: Date = new Date()): ClockParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  let hours = Number(get('hour'));
  if (hours === 24) hours = 0;
  return {
    day: WEEKDAY_TO_JS[weekday] ?? at.getUTCDay(),
    hours,
    minutes: Number(get('minute')),
  };
}

function minsOf(p: ClockParts): number {
  return p.hours * 60 + p.minutes;
}

/** IST wall-clock parts via Intl (no fragile Date.parse of locale strings). */
export function getIstParts(at: Date = new Date()): ClockParts {
  return partsInZone(IST, at);
}

/** @deprecated Prefer getIstParts — kept for callers that still expect a Date. */
export function getIstNow(): Date {
  const { hours, minutes } = getIstParts();
  const base = new Date();
  const asUtc = new Date(base.toLocaleString('en-US', { timeZone: IST }));
  asUtc.setHours(hours, minutes, 0, 0);
  return asUtc;
}

/** NSE / BSE cash + F&O regular session: Mon–Fri 09:15–15:30 IST. */
export function isNseFnoMarketOpen(at: Date = new Date()): boolean {
  const p = getIstParts(at);
  if (p.day === 0 || p.day === 6) return false;
  const mins = minsOf(p);
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

/**
 * MCX non-agri (bullion / energy / base metals): Mon–Fri 09:00–23:30 IST.
 * (Exact agri sessions differ; we treat NCDEX same window as a practical default.)
 */
export function isMcxMarketOpen(at: Date = new Date()): boolean {
  const p = getIstParts(at);
  if (p.day === 0 || p.day === 6) return false;
  const mins = minsOf(p);
  return mins >= 9 * 60 && mins <= 23 * 60 + 30;
}

/** Crypto spot (Binance etc.): 24/7. */
export function isCryptoMarketOpen(_at: Date = new Date()): boolean {
  return true;
}

/**
 * Spot FX + metals/oil CFDs (XAUUSD, EURUSD, USOIL…):
 * Open Sun 22:00 UTC → Fri 22:00 UTC, with daily maintenance Fri break already covered
 * and a daily pause ~22:00–23:00 UTC (Sun–Thu).
 */
export function isForexMarketOpen(at: Date = new Date()): boolean {
  const utcDay = at.getUTCDay(); // 0 Sun … 6 Sat
  const utcMins = at.getUTCHours() * 60 + at.getUTCMinutes();
  const openUtc = 22 * 60; // 22:00
  const closeDaily = 22 * 60; // daily rollover start
  const reopenDaily = 23 * 60; // 23:00

  // Full weekend gap: Fri 22:00 UTC → Sun 22:00 UTC
  if (utcDay === 6) return false; // Saturday
  if (utcDay === 0 && utcMins < openUtc) return false; // Sunday before open
  if (utcDay === 5 && utcMins >= closeDaily) return false; // Friday after close

  // Daily maintenance pause Sun–Thu 22:00–23:00 UTC
  if (utcDay >= 0 && utcDay <= 4 && utcMins >= closeDaily && utcMins < reopenDaily) {
    return false;
  }
  return true;
}

/** US cash equities regular hours: Mon–Fri 09:30–16:00 America/New_York. */
export function isUsEquityMarketOpen(at: Date = new Date()): boolean {
  const p = partsInZone(ET, at);
  if (p.day === 0 || p.day === 6) return false;
  const mins = minsOf(p);
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

function stripSymbol(raw: string): { exchange: string; ticker: string } {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (s.includes(':')) {
    const [ex, ...rest] = s.split(':');
    return { exchange: ex, ticker: rest.join(':').replace(/[^A-Z0-9/_-]/g, '') };
  }
  return { exchange: '', ticker: s.replace(/[^A-Z0-9/_-]/g, '') };
}

const CRYPTO_EX = new Set([
  'BINANCE',
  'BINANCEUS',
  'BYBIT',
  'BITSTAMP',
  'COINBASE',
  'KRAKEN',
  'KUCOIN',
  'OKX',
  'BITFINEX',
  'GATEIO',
]);

const FOREX_EX = new Set(['FX', 'FX_IDC', 'OANDA', 'FOREXCOM', 'PEPPERSTONE', 'SAXO', 'FXCM']);

const US_EX = new Set(['NASDAQ', 'NYSE', 'AMEX', 'CBOE', 'ARCA', 'BATS']);

const CRYPTO_TICKER =
  /^(BTC|ETH|SOL|BNB|XRP|DOGE|ADA|AVAX|DOT|LINK|MATIC|POL|USDT|USDC)(USDT|USD|BUSD|PERP)?$/;
const METAL_OIL_TICKER = /^(XAU|XAG|GOLD|SILVER|XAUUSD|XAGUSD|USOIL|UKOIL|WTI|BRENT|CRUDE|CRUDEOIL)/;
const FOREX_TICKER =
  /^(EUR|GBP|AUD|NZD|USD|CAD|CHF|JPY|INR)(EUR|GBP|AUD|NZD|USD|CAD|CHF|JPY|INR)$/;

/**
 * Resolve which venue rules apply for a TradingView / app symbol.
 * Accepts `OANDA:XAUUSD`, `GOLD`, `NSE:NIFTY`, `BINANCE:BTCUSDT`, etc.
 */
export function resolveMarketVenue(symbol: string): MarketVenue {
  const { exchange, ticker } = stripSymbol(symbol);
  const plain = ticker.replace(/\//g, '');

  // Exchange prefix wins over ticker name heuristics (MCX:GOLD ≠ spot XAUUSD).
  if (CRYPTO_EX.has(exchange)) return 'crypto';
  if (exchange === 'MCX' || exchange === 'NCDEX') return 'mcx';
  if (exchange === 'NSE' || exchange === 'BSE') return 'nse_bse';
  if (US_EX.has(exchange)) return 'us_equity';
  if (FOREX_EX.has(exchange)) return 'forex';

  if (exchange === 'TVC') {
    if (/^(SPX|DJI|NDX|IXIC|COMP)/.test(plain)) return 'us_equity';
    if (/OIL|XAU|XAG|GOLD|SILVER|WTI|BRENT/.test(plain)) return 'forex';
    return 'forex';
  }

  if (CRYPTO_TICKER.test(plain) || /USDT$/.test(plain)) return 'crypto';
  if (METAL_OIL_TICKER.test(plain) || FOREX_TICKER.test(plain)) return 'forex';

  // Bare Indian names from Terminal (NIFTY, RELIANCE) default to NSE.
  if (!exchange && plain.length >= 2) return 'nse_bse';

  return 'unknown';
}

export function isMarketOpenForVenue(venue: MarketVenue, at: Date = new Date()): boolean {
  switch (venue) {
    case 'crypto':
      return isCryptoMarketOpen(at);
    case 'forex':
      return isForexMarketOpen(at);
    case 'mcx':
      return isMcxMarketOpen(at);
    case 'us_equity':
      return isUsEquityMarketOpen(at);
    case 'nse_bse':
      return isNseFnoMarketOpen(at);
    default:
      // Unknown: don't falsely mark closed if ticks look live — use forex-like 24/5.
      return isForexMarketOpen(at);
  }
}

const VENUE_LABEL: Record<MarketVenue, { open: string; closed: string }> = {
  nse_bse: {
    open: 'NSE/BSE session open (09:15–15:30 IST)',
    closed: 'NSE/BSE session closed (outside 09:15–15:30 IST)',
  },
  mcx: {
    open: 'MCX session open (≈09:00–23:30 IST)',
    closed: 'MCX session closed (outside ≈09:00–23:30 IST)',
  },
  crypto: {
    open: 'Crypto market open (24/7)',
    closed: 'Crypto market closed',
  },
  forex: {
    open: 'FX / metals session open (Sun 22:00–Fri 22:00 UTC)',
    closed: 'FX / metals session closed (weekend or daily break)',
  },
  us_equity: {
    open: 'US equity session open (09:30–16:00 ET)',
    closed: 'US equity session closed (outside RTH)',
  },
  unknown: {
    open: 'Market open',
    closed: 'Market closed',
  },
};

/** Full session status for any chart symbol. */
export function getMarketSession(symbol: string, at: Date = new Date()): MarketSession {
  const venue = resolveMarketVenue(symbol);
  const open = isMarketOpenForVenue(venue, at);
  const copy = VENUE_LABEL[venue];
  return {
    open,
    venue,
    badge: open ? 'OPEN' : 'CLOSE',
    label: open ? copy.open : copy.closed,
  };
}

export function isMarketOpenForSymbol(symbol: string, at: Date = new Date()): boolean {
  return getMarketSession(symbol, at).open;
}

/** Legacy helper — NSE hours only (OI / Indian futures callers). */
export function marketSessionLabel(): string {
  return isNseFnoMarketOpen() ? 'Market open' : 'Market closed';
}

export function marketSessionLabelFor(symbol: string, at: Date = new Date()): string {
  return getMarketSession(symbol, at).label;
}
