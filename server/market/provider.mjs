import * as fyersProvider from './fyersProvider.mjs';
import { isFyersConfigured } from './fyersSession.mjs';
import { ensureFyersSocket, resetFyersSocket } from './fyersSocket.mjs';
import { getFnoSymbolList } from './fyersUniverse.mjs';

const BOOT_SYMBOLS_MAX = Math.max(8, Number(process.env.FYERS_BOOT_SYMBOLS_MAX || 24));

function getBootSymbols() {
  return getFnoSymbolList().slice(0, BOOT_SYMBOLS_MAX);
}

/** Platform market data — Fyers API only */
export function getActiveMarketProvider() {
  if (!isFyersConfigured()) return 'fyers-offline';
  return 'fyers';
}

export function initMarketProvider() {
  if (!isFyersConfigured()) {
    console.warn('[Market] Fyers offline — save token (one-time OAuth) then restart API');
    return 'fyers-offline';
  }
  const symbols = getFnoSymbolList();
  const bootSymbols = getBootSymbols();
  ensureFyersSocket(bootSymbols);
  console.log(`[Market] Provider: Fyers API (${bootSymbols.length} boot symbols, ${symbols.length} total)`);
  return 'fyers';
}

export function restartFyersMarketStream() {
  if (!isFyersConfigured()) return;
  resetFyersSocket();
  ensureFyersSocket(getBootSymbols());
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
      message: 'Connect TradeX Live in Profile',
    };
  }
  return { status: 'ok', ...fyersProvider.getMarketHealth() };
}

function requireFyers() {
  if (!isFyersConfigured()) {
    throw new Error('TradeX Live not connected — Profile → Connect');
  }
}
