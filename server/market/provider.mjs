import * as tvProvider from './tradingview/tvProvider.mjs';
import { getFnoSymbolList } from './universe.mjs';
import { isKiteConfigured } from './kite/kiteConfig.mjs';
import {
  activeUpstream,
  ensureLiveSocket,
  resetLiveSocket,
  subscribeLiveSymbols,
  getLiveWsStatus,
} from './liveFeed.mjs';

const BOOT_SYMBOLS_MAX = Math.max(8, Number(process.env.TV_BOOT_SYMBOLS_MAX || 24));

function getBootSymbols() {
  return getFnoSymbolList().slice(0, BOOT_SYMBOLS_MAX);
}

/** Active primary tick feed: kite (true WS) or tradingview (fallback) + NSE for OC */
export function getActiveMarketProvider() {
  return isKiteConfigured() ? 'kite+nse' : 'tradingview+nse';
}

export function initMarketProvider() {
  const symbols = getFnoSymbolList();
  const bootSymbols = getBootSymbols();
  const upstream = ensureLiveSocket(bootSymbols);
  console.log(
    `[Market] Feed: ${upstream} ticks + NSE option-chain (${bootSymbols.length} boot, ${symbols.length} universe)${isKiteConfigured() ? '' : ' — set KITE_API_KEY + KITE_ACCESS_TOKEN for Zerodha WebSocket'}`,
  );
  return getActiveMarketProvider();
}

export function restartMarketStream() {
  resetLiveSocket();
  ensureLiveSocket(getBootSymbols());
}

/** @deprecated */
export function restartFyersMarketStream() {
  restartMarketStream();
}

export async function fetchQuotes(symbols, opts) {
  void subscribeLiveSymbols(symbols);
  return tvProvider.fetchQuotes(symbols, opts);
}

export async function fetchOhlc(symbol, timeframe, range, opts) {
  void subscribeLiveSymbols([symbol]);
  return tvProvider.fetchOhlc(symbol, timeframe, range, opts);
}

export function getMarketHealth() {
  const ws = getLiveWsStatus();
  return {
    status: 'ok',
    ...tvProvider.getMarketHealth(),
    provider: getActiveMarketProvider(),
    upstream: activeUpstream(),
    websocket: ws.connected,
    kiteConfigured: isKiteConfigured(),
    optionChain: 'nse',
  };
}
