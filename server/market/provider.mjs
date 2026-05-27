import * as fyersProvider from './fyersProvider.mjs';
import { isFyersConfigured } from './fyersSession.mjs';
import { ensureFyersSocket, resetFyersSocket } from './fyersSocket.mjs';
import { getFnoSymbolList } from './fyersUniverse.mjs';

/** Platform market data — Fyers API only */
export function getActiveMarketProvider() {
  if (!isFyersConfigured()) return 'fyers-offline';
  return 'fyers';
}

export function initMarketProvider() {
  if (!isFyersConfigured()) {
    console.warn('[Market] Fyers not connected — connect via Profile (no Yahoo fallback)');
    return 'fyers-offline';
  }
  const symbols = getFnoSymbolList();
  ensureFyersSocket(symbols);
  console.log(`[Market] Provider: Fyers API only (${symbols.length} symbols)`);
  return 'fyers';
}

export function restartFyersMarketStream() {
  if (!isFyersConfigured()) return;
  resetFyersSocket();
  ensureFyersSocket(getFnoSymbolList());
}

export async function fetchQuotes(symbols) {
  requireFyers();
  const { subscribeFyersSymbols } = await import('./fyersSocket.mjs');
  subscribeFyersSymbols(symbols);
  return fyersProvider.fetchQuotes(symbols);
}

export async function fetchOhlc(symbol, timeframe, range) {
  requireFyers();
  const { subscribeFyersSymbols } = await import('./fyersSocket.mjs');
  subscribeFyersSymbols([symbol]);
  return fyersProvider.fetchOhlc(symbol, timeframe, range);
}

export function getMarketHealth() {
  if (!isFyersConfigured()) {
    return {
      status: 'degraded',
      provider: 'fyers',
      configured: false,
      websocket: false,
      message: 'Connect Fyers in Profile — only Fyers API is used',
    };
  }
  return { status: 'ok', ...fyersProvider.getMarketHealth() };
}

function requireFyers() {
  if (!isFyersConfigured()) {
    throw new Error('Fyers API not connected — Profile → Connect Fyers');
  }
}
