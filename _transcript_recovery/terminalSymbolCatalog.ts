/**
 * Searchable symbol catalog for the Terminal (FNO + indices + crypto/FX/commodities).
 */

import { FNO_UNIVERSE } from '../data/fnoUniverse';
import { toTradingViewSymbol } from '../utils/tradingViewSymbols';

export type TerminalSymbolHit = {
  tvSymbol: string;
  label: string;
  name: string;
  group: 'index' | 'stock' | 'crypto' | 'fx' | 'commodity';
};

const GLOBAL_HITS: TerminalSymbolHit[] = [
  { tvSymbol: 'BINANCE:BTCUSDT', label: 'BTCUSDT', name: 'Bitcoin', group: 'crypto' },
  { tvSymbol: 'BINANCE:ETHUSDT', label: 'ETHUSDT', name: 'Ethereum', group: 'crypto' },
  { tvSymbol: 'BINANCE:SOLUSDT', label: 'SOLUSDT', name: 'Solana', group: 'crypto' },
  { tvSymbol: 'BINANCE:BNBUSDT', label: 'BNBUSDT', name: 'BNB', group: 'crypto' },
  { tvSymbol: 'BINANCE:XRPUSDT', label: 'XRPUSDT', name: 'XRP', group: 'crypto' },
  { tvSymbol: 'FX_IDC:EURUSD', label: 'EURUSD', name: 'Euro / US Dollar', group: 'fx' },
  { tvSymbol: 'FX_IDC:GBPUSD', label: 'GBPUSD', name: 'Pound / US Dollar', group: 'fx' },
  { tvSymbol: 'FX_IDC:USDJPY', label: 'USDJPY', name: 'US Dollar / Yen', group: 'fx' },
  { tvSymbol: 'FX_IDC:USDINR', label: 'USDINR', name: 'US Dollar / Rupee', group: 'fx' },
  { tvSymbol: 'OANDA:XAUUSD', label: 'XAUUSD', name: 'Gold', group: 'commodity' },
  { tvSymbol: 'OANDA:XAGUSD', label: 'XAGUSD', name: 'Silver', group: 'commodity' },
  { tvSymbol: 'TVC:USOIL', label: 'USOIL', name: 'Crude Oil WTI', group: 'commodity' },
];

let cached: TerminalSymbolHit[] | null = null;

export function terminalSymbolCatalog(): TerminalSymbolHit[] {
  if (cached) return cached;
  const fno: TerminalSymbolHit[] = FNO_UNIVERSE.map((i) => ({
    tvSymbol: toTradingViewSymbol(i.symbol, i.type),
    label: i.symbol,
    name: i.name,
    group: i.type === 'index' ? 'index' : 'stock',
  }));
  const seen = new Set(fno.map((h) => h.tvSymbol));
  for (const g of GLOBAL_HITS) {
    if (!seen.has(g.tvSymbol)) {
      fno.push(g);
      seen.add(g.tvSymbol);
    }
  }
  cached = fno;
  return fno;
}

export function searchTerminalSymbols(query: string, limit = 24): TerminalSymbolHit[] {
  const q = query.trim().toUpperCase().replace(/\s+/g, '');
  const all = terminalSymbolCatalog();
  if (!q) return all.slice(0, limit);

  const scored = all
    .map((hit) => {
      const label = hit.label.toUpperCase();
      const name = hit.name.toUpperCase();
      const tv = hit.tvSymbol.toUpperCase();
      let score = 0;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80;
      else if (label.includes(q)) score = 50;
      else if (tv.includes(q)) score = 40;
      else if (name.includes(q)) score = 25;
      else return null;
      return { hit, score };
    })
    .filter((x): x is { hit: TerminalSymbolHit; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score || a.hit.label.localeCompare(b.hit.label));

  return scored.slice(0, limit).map((x) => x.hit);
}
