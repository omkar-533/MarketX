import { fetchNseOptionChain } from './nseOptionChain.mjs';

/** Option chain via NSE India unofficial endpoints (near-live poll). */
export async function fetchOptionChain(symbol, expiry) {
  return fetchNseOptionChain(symbol, expiry);
}

export function isOptionChainAvailable() {
  return true;
}
