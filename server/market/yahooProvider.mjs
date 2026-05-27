/**
 * @deprecated Removed — platform uses Fyers API only.
 * This module is kept empty to avoid broken imports during migration.
 */
export async function fetchQuotes() {
  throw new Error('Yahoo Finance disabled — connect Fyers API');
}

export async function fetchOhlc() {
  throw new Error('Yahoo Finance disabled — connect Fyers API');
}

export function getMarketHealth() {
  return { provider: 'fyers', configured: false, websocket: false };
}
