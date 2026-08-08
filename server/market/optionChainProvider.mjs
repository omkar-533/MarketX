import { LIVE_MARKET_DISABLED } from './liveKill.mjs';
import { fetchNseOptionChain } from './nseOptionChain.mjs';

/** Option chain via NSE India unofficial endpoints (near-live poll). */
export async function fetchOptionChain(symbol, expiry) {
  if (LIVE_MARKET_DISABLED) {
    const err = new Error('live market disabled');
    throw err;
  }
  return fetchNseOptionChain(symbol, expiry);
}

export function isOptionChainAvailable() {
  return !LIVE_MARKET_DISABLED;
}
