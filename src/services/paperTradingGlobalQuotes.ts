import type { GlobalMarket } from './globalInstrumentService';
import { getGlobalInstrument } from './globalInstrumentService';
import type { MarketItem } from './paperTradingEngine';

/** Demo base prices for crypto / forex paper trading (no Fyers feed) */
const BASE_PRICES: Record<string, number> = {
  'BTC/USDT': 94_250,
  'ETH/USDT': 3_420,
  'SOL/USDT': 178,
  'BNB/USDT': 612,
  'XRP/USDT': 0.62,
  'EUR/USD': 1.084,
  'GBP/USD': 1.268,
  'USD/JPY': 149.2,
  'USD/INR': 83.12,
  'XAU/USD': 2_338,
  'XAG/USD': 27.4,
};

const priceState = new Map<string, number>();

function stateKey(symbol: string, market: GlobalMarket) {
  return `${market}:${symbol.trim().toUpperCase()}`;
}

export function getGlobalPaperBasePrice(symbol: string, market: GlobalMarket): number {
  const key = stateKey(symbol, market);
  const cached = priceState.get(key);
  if (cached && cached > 0) return cached;

  const preset = getGlobalInstrument(market, symbol);
  const sym = preset?.symbol ?? symbol;
  const base = BASE_PRICES[sym] ?? BASE_PRICES[sym.replace('/', '')];
  if (base) {
    priceState.set(key, base);
    return base;
  }

  const seed = market === 'crypto' ? 1_000 : 1;
  priceState.set(key, seed);
  return seed;
}

/** Small random walk for simulated global quotes */
export function tickGlobalPaperQuote(item: MarketItem): MarketItem {
  if (item.assetMarket !== 'crypto' && item.assetMarket !== 'forex') return item;

  const market = item.assetMarket;
  const key = stateKey(item.symbol, market);
  let price = priceState.get(key) ?? item.price;
  if (!price || price <= 0) price = getGlobalPaperBasePrice(item.symbol, market);

  const drift = (Math.random() - 0.5) * (market === 'crypto' ? 0.004 : 0.0008);
  const next = Math.max(price * (1 + drift), market === 'forex' ? 0.0001 : 0.01);
  priceState.set(key, next);

  const prev = item.price > 0 ? item.price : next * 0.999;
  const change = next - prev;
  const changePercent = prev ? (change / prev) * 100 : 0;

  return {
    ...item,
    price: Number(next.toFixed(market === 'forex' ? 5 : 2)),
    change: Number(change.toFixed(4)),
    changePercent: Number(changePercent.toFixed(2)),
    open: item.open || prev,
    high: Math.max(item.high || next, next),
    low: Math.min(item.low || next, next),
  };
}
