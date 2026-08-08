/**
 * Market provider removed — TradingView / NSE / Kite live data deleted.
 * Stubs keep import sites compiling; all fetches return empty/disabled.
 */

export function getActiveMarketProvider() {
  return 'disabled';
}

export function initMarketProvider() {
  return 'disabled';
}

export function restartMarketStream() {}

export function restartFyersMarketStream() {}

export async function fetchQuotes(symbols = []) {
  const list = Array.isArray(symbols) ? symbols : [];
  return {
    quotes: [],
    errors: list.map((symbol) => ({
      symbol: String(symbol || '').toUpperCase(),
      error: 'market data removed',
    })),
    source: 'removed',
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchOhlc(symbol, timeframe = '15m') {
  return {
    symbol: String(symbol || '').toUpperCase(),
    timeframe,
    bars: [],
    source: 'removed',
    fetchedAt: new Date().toISOString(),
  };
}

export function getMarketHealth() {
  return {
    status: 'ok',
    provider: 'disabled',
    configured: false,
    websocket: false,
    wsStatus: 'removed',
    liveDisabled: true,
    upstream: 'removed',
    kiteConfigured: false,
    optionChain: 'none',
  };
}
