import { fetchFyersOptionChain, isFyersOptionChainAvailable } from './fyersOptionChain.mjs';

/** Option chain — Fyers API only (expiries + full chain per selected expiry) */
export async function fetchOptionChain(symbol, expiry) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) throw new Error('symbol required');

  if (!isFyersOptionChainAvailable()) {
    throw new Error('Fyers connected nahi hai — Profile se Connect Fyers karein');
  }

  const data = await fetchFyersOptionChain(sym, expiry, 100);
  if (!data?.rows?.length) {
    throw new Error(
      data?.error ||
        'Fyers se option chain khali — expiry change karein ya 30s baad refresh',
    );
  }
  return data;
}
