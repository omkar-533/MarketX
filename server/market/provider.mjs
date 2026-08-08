import * as tvProvider from './tradingview/tvProvider.mjs';
import { getFnoSymbolList } from './universe.mjs';
import { isKiteConfigured } from './kite/kiteConfig.mjs';
import { LIVE_MARKET_DISABLED } from './liveKill.mjs';
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
  if (LIVE_MARKET_DISABLED) return 'disabled';
  return isKiteConfigured() ? 'kite+nse' : 'tradingview+nse';
}

export function initMarketProvider() {
  if (LIVE_MARKET_DISABLED) {
    console.log('[Market] Live data kill-switch ON — TradingView WS + NSE live polls not started');
    return getActiveMarketProvider();
  }
  const symbols = getFnoSymbolList();
  const bootSymbols = getBootSymbols();
  const upstream = ensureLiveSocket(bootSymbols);
  console.log(
    `[Market] Feed: ${upstream} ticks + NSE option-chain (${bootSymbols.length} boot, ${symbols.length} universe)${isKiteConfigured() ? '' : ' — set KITE_API_KEY + KITE_ACCESS_TOKEN for Zerodha WebSocket'}`,
  );
  return getActiveMarketProvider();
}

export function restartMarketStream() {
  if (LIVE_MARKET_DISABLED) return;
  resetLiveSocket();
  ensureLiveSocket(getBootSymbols());
}

/** @deprecated */
export function restartFyersMarketStream() {
  restartMarketStream();
}

export async function fetchQuotes(symbols, opts) {
  if (LIVE_MARKET_DISABLED) {
    return {
      quotes: [],
      errors: (symbols || []).map((symbol) => ({ symbol, error: 'live market disabled' })),
      source: 'disabled',
      fetchedAt: new Date().toISOString(),
    };
  }
  void subscribeLiveSymbols(symbols);
  return tvProvider.fetchQuotes(symbols, opts);
}

export async function fetchOhlc(symbol, timeframe, range, opts) {
  if (LIVE_MARKET_DISABLED) {
    return {
      symbol,
      timeframe,
      bars: [],
      source: 'disabled',
      fetchedAt: new Date().toISOString(),
      error: 'live market disabled',
    };
  }
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
    optionChain: LIVE_MARKET_DISABLED ? 'none' : 'nse',
    liveDisabled: LIVE_MARKET_DISABLED,
  };
}
