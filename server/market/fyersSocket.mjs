/**
 * Backward-compatible exports — delegates to centralized FyersWsManager.
 */
export {
  ensureFyersSocket,
  subscribeFyersSymbols,
  unsubscribeFyersSymbols,
  subscribeTickBroadcast,
  emitTickBroadcast,
  getTickSnapshot,
  getTickQuotes,
  resetFyersSocket,
  shutdownFyersSocket,
  isFyersSocketActive,
  getFyersWsStatus,
  subscribeWsStatus,
} from './fyersWsManager.mjs';
