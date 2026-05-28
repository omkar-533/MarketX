import { fetchQuotes } from './fyersProvider.mjs';
import { isFyersConfigured } from './fyersSession.mjs';

/** Indian indices via Fyers (platform does not use Yahoo / external feeds) */
const INDIA_GLOBAL = {
  NIFTY: { name: 'Nifty 50', country: 'India', openTime: '09:15', closeTime: '15:30', currency: 'INR' },
  BANKNIFTY: { name: 'Bank Nifty', country: 'India', openTime: '09:15', closeTime: '15:30', currency: 'INR' },
  FINNIFTY: { name: 'Fin Nifty', country: 'India', openTime: '09:15', closeTime: '15:30', currency: 'INR' },
  SENSEX: { name: 'Sensex', country: 'India', openTime: '09:15', closeTime: '15:30', currency: 'INR' },
};

const cache = { data: null, at: 0 };
const CACHE_MS = 45_000;

function sessionStatus() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const h = ist.getHours();
  const m = ist.getMinutes();
  const mins = h * 60 + m;
  if (mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30) return 'Open';
  return 'Closed';
}

/** Global page: Indian indices from Fyers only */
export async function fetchGlobalIndexQuotes() {
  if (!isFyersConfigured()) {
    return {
      indices: [],
      source: 'fyers',
      error: 'TradeX Live not connected',
      fetchedAt: new Date().toISOString(),
    };
  }

  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;

  const ids = Object.keys(INDIA_GLOBAL);
  const res = await fetchQuotes(ids);
  const quoteById = new Map((res.quotes ?? []).map((q) => [q.symbol, q]));

  const indices = ids.map((id) => {
    const meta = INDIA_GLOBAL[id];
    const q = quoteById.get(id);
    return {
      id,
      name: meta.name,
      country: meta.country,
      price: q?.price ?? 0,
      change: q?.change ?? 0,
      changePercent: q?.changePercent ?? 0,
      status: sessionStatus(),
      openTime: meta.openTime,
      closeTime: meta.closeTime,
      currency: meta.currency,
      source: 'fyers',
    };
  });

  const payload = {
    indices,
    source: 'fyers',
    note: 'US/EU indices removed — platform uses Fyers API only (India)',
    fetchedAt: new Date().toISOString(),
  };
  cache.data = payload;
  cache.at = Date.now();
  return payload;
}
