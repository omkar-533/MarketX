/** Option chain is not available on the TradingView feed. */
export async function fetchOptionChain(symbol) {
  const err = new Error(
    'TradingView feed does not provide option chain — this endpoint is unavailable',
  );
  err.status = 503;
  err.symbol = symbol;
  throw err;
}

export function isOptionChainAvailable() {
  return false;
}
