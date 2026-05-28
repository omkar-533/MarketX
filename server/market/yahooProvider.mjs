/**
 * @deprecated Removed — platform uses Fyers API only.
 * This module is kept empty to avoid broken imports during migration.
 */
export async function fetchQuotes() {
  throw new Error('External feeds disabled — connect TradeX Live');
}

export async function fetchOhlc() {
  throw new Error('External feeds disabled — connect TradeX Live');
}

export function getMarketHealth() {
  return { provider: 'fyers', configured: false, websocket: false };
}
