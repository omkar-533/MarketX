/**
 * Server-side kill switch for TradingView websocket ticks + NSE option-chain / live polls.
 * Flip to true only if live tape should return (requires redeploy).
 */
export const LIVE_MARKET_DISABLED =
  String(process.env.LIVE_MARKET_DATA || '').trim() === '1' ? false : true;
