import * as tvProvider from './tradingview/tvProvider.mjs';
import {
  ensureTvSocket,
  resetTvSocket,
  subscribeTvSymbols,
} from './tradingview/tvWsManager.mjs';
import { getFnoSymbolList } from './universe.mjs';

const BOOT_SYMBOLS_MAX = Math.max(8, Number(process.env.TV_BOOT_SYMBOLS_MAX || 24));

function getBootSymbols() {
  return getFnoSymbolList().slice(0, BOOT_SYMBOLS_MAX);
}

/** Platform market data — TradingView quote stream only */
export function getActiveMarketProvider() {
  return 'tradingview';
}

export function initMarketProvider() {
  const symbols = getFnoSymbolList();
  const bootSymbols = getBootSymbols();
  ensureTvSocket(bootSymbols);
  console.log(
    `[Market] Provider: TradingView (${bootSymbols.length} boot symbols, ${symbols.length} total)`,
  );
  return 'tradingview';
}

export function restartMarketStream() {
  resetTvSocket();
  ensureTvSocket(getBootSymbols());
}

/** @deprecated */
export function restartFyersMarketStream() {
  restartMarketStream();
}

export async function fetchQuotes(symbols, opts) {
  subscribeTvSymbols(symbols);
  return tvProvider.fetchQuotes(symbols, opts);
}

export async function fetchOhlc(symbol, timeframe, range) {
  subscribeTvSymbols([symbol]);
  return tvProvider.fetchOhlc(symbol, timeframe, range);
}

export function getMarketHealth() {
  return { status: 'ok', ...tvProvider.getMarketHealth() };
}
