import type { JournalMarket, PnlCurrency } from '../types/journal';

export type GlobalMarket = 'crypto' | 'forex';

export interface GlobalInstrumentSelection {
  symbol: string;
  name: string;
  market: GlobalMarket;
  quoteCurrency: string;
  /** 1 for crypto; 100_000 for forex standard lot */
  lotSize: number;
}

export const FOREX_STANDARD_LOT = 100_000;

const CRYPTO_PRESETS: GlobalInstrumentSelection[] = [
  { symbol: 'BTC/USDT', name: 'Bitcoin', market: 'crypto', quoteCurrency: 'USDT', lotSize: 1 },
  { symbol: 'ETH/USDT', name: 'Ethereum', market: 'crypto', quoteCurrency: 'USDT', lotSize: 1 },
  { symbol: 'SOL/USDT', name: 'Solana', market: 'crypto', quoteCurrency: 'USDT', lotSize: 1 },
  { symbol: 'BNB/USDT', name: 'BNB', market: 'crypto', quoteCurrency: 'USDT', lotSize: 1 },
  { symbol: 'XRP/USDT', name: 'Ripple', market: 'crypto', quoteCurrency: 'USDT', lotSize: 1 },
  { symbol: 'DOGE/USDT', name: 'Dogecoin', market: 'crypto', quoteCurrency: 'USDT', lotSize: 1 },
  { symbol: 'ADA/USDT', name: 'Cardano', market: 'crypto', quoteCurrency: 'USDT', lotSize: 1 },
  { symbol: 'AVAX/USDT', name: 'Avalanche', market: 'crypto', quoteCurrency: 'USDT', lotSize: 1 },
  { symbol: 'BTC/USD', name: 'Bitcoin (USD)', market: 'crypto', quoteCurrency: 'USD', lotSize: 1 },
  { symbol: 'ETH/USD', name: 'Ethereum (USD)', market: 'crypto', quoteCurrency: 'USD', lotSize: 1 },
  { symbol: 'BTC/INR', name: 'Bitcoin (INR)', market: 'crypto', quoteCurrency: 'INR', lotSize: 1 },
  { symbol: 'ETH/INR', name: 'Ethereum (INR)', market: 'crypto', quoteCurrency: 'INR', lotSize: 1 },
];

const FOREX_PRESETS: GlobalInstrumentSelection[] = [
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', market: 'forex', quoteCurrency: 'USD', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'GBP/USD', name: 'British Pound / USD', market: 'forex', quoteCurrency: 'USD', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'USD/JPY', name: 'US Dollar / Yen', market: 'forex', quoteCurrency: 'JPY', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'USD/CHF', name: 'US Dollar / Franc', market: 'forex', quoteCurrency: 'CHF', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'AUD/USD', name: 'Australian Dollar / USD', market: 'forex', quoteCurrency: 'USD', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', market: 'forex', quoteCurrency: 'CAD', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'NZD/USD', name: 'New Zealand Dollar / USD', market: 'forex', quoteCurrency: 'USD', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'EUR/GBP', name: 'Euro / Pound', market: 'forex', quoteCurrency: 'GBP', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'EUR/JPY', name: 'Euro / Yen', market: 'forex', quoteCurrency: 'JPY', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'GBP/JPY', name: 'Pound / Yen', market: 'forex', quoteCurrency: 'JPY', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'USD/INR', name: 'US Dollar / Indian Rupee', market: 'forex', quoteCurrency: 'INR', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'EUR/INR', name: 'Euro / Indian Rupee', market: 'forex', quoteCurrency: 'INR', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'GBP/INR', name: 'Pound / Indian Rupee', market: 'forex', quoteCurrency: 'INR', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'XAU/USD', name: 'Gold / USD', market: 'forex', quoteCurrency: 'USD', lotSize: FOREX_STANDARD_LOT },
  { symbol: 'XAG/USD', name: 'Silver / USD', market: 'forex', quoteCurrency: 'USD', lotSize: FOREX_STANDARD_LOT },
];

const cryptoByKey = new Map(
  CRYPTO_PRESETS.map((p) => [normalizeSymbolKey(p.symbol), p]),
);
const forexByKey = new Map(
  FOREX_PRESETS.map((p) => [normalizeSymbolKey(p.symbol), p]),
);

function normalizeSymbolKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/** BTCUSDT → BTC/USDT style when user types without slash */
export function formatGlobalSymbol(raw: string, market: GlobalMarket): string {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return '';
  if (trimmed.includes('/')) return trimmed;

  const known = (market === 'crypto' ? cryptoByKey : forexByKey).get(trimmed);
  if (known) return known.symbol;

  if (market === 'forex' && trimmed.length === 6) {
    return `${trimmed.slice(0, 3)}/${trimmed.slice(3)}`;
  }

  if (market === 'crypto') {
    const quotes = ['USDT', 'USD', 'INR', 'BTC', 'ETH', 'BUSD'];
    for (const q of quotes) {
      if (trimmed.endsWith(q) && trimmed.length > q.length) {
        return `${trimmed.slice(0, -q.length)}/${q}`;
      }
    }
  }

  return trimmed;
}

export function defaultPnlCurrency(market: JournalMarket): PnlCurrency {
  if (market === 'crypto') return 'USDT';
  if (market === 'forex') return 'USD';
  return 'INR';
}

export function tradeMarket(trade: { market?: JournalMarket }): JournalMarket {
  return trade.market ?? 'equity';
}

export function tradePnlCurrency(trade: { market?: JournalMarket; pnlCurrency?: PnlCurrency }): PnlCurrency {
  return trade.pnlCurrency ?? defaultPnlCurrency(tradeMarket(trade));
}

export function formatPnlAmount(value: number, currency: PnlCurrency): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (currency === 'INR') {
    return `${sign}${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(abs)}`;
  }
  if (currency === 'EUR') {
    return `${sign}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(abs)}`;
  }
  if (currency === 'USDT') {
    const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
    return `${sign}${n} USDT`;
  }
  return `${sign}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(abs)}`;
}

export function getGlobalInstrument(
  market: GlobalMarket,
  symbol: string,
): GlobalInstrumentSelection | null {
  const key = normalizeSymbolKey(symbol);
  const map = market === 'crypto' ? cryptoByKey : forexByKey;
  const hit = map.get(key);
  if (hit) return hit;

  const formatted = formatGlobalSymbol(symbol, market);
  const key2 = normalizeSymbolKey(formatted);
  return map.get(key2) ?? null;
}

export function createManualGlobalInstrument(
  market: GlobalMarket,
  symbol: string,
): GlobalInstrumentSelection {
  const formatted = formatGlobalSymbol(symbol, market);
  const preset = getGlobalInstrument(market, formatted);
  if (preset) return preset;

  const quote =
    market === 'crypto'
      ? formatted.includes('/')
        ? formatted.split('/')[1] ?? 'USDT'
        : 'USDT'
      : formatted.includes('/')
        ? formatted.split('/')[1] ?? 'USD'
        : 'USD';

  return {
    symbol: formatted,
    name: market === 'crypto' ? 'Crypto pair' : 'Forex pair',
    market,
    quoteCurrency: quote,
    lotSize: market === 'forex' ? FOREX_STANDARD_LOT : 1,
  };
}

export function searchGlobalInstruments(
  market: GlobalMarket,
  query: string,
  limit = 80,
): GlobalInstrumentSelection[] {
  const list = market === 'crypto' ? CRYPTO_PRESETS : FOREX_PRESETS;
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, limit);

  return list
    .filter(
      (p) =>
        p.symbol.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.symbol.replace('/', '').toLowerCase().includes(q.replace('/', '')),
    )
    .slice(0, limit);
}

export function pnlFieldLabel(currency: PnlCurrency): string {
  if (currency === 'INR') return 'Profit / Loss (₹) *';
  if (currency === 'USDT') return 'Profit / Loss (USDT) *';
  if (currency === 'EUR') return 'Profit / Loss (€) *';
  return 'Profit / Loss ($) *';
}
