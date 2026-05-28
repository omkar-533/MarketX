/** User-facing labels — never show broker/API vendor names on screen */
export const BRAND = 'TradeX';
export const LIVE_DATA_LABEL = 'TradeX Live';
export const CONNECT_LIVE_LABEL = 'Connect Live Data';
export const LIVE_FEED_LABEL = 'TradeX live feed';
export const DATA_OFFLINE_MSG = 'Live data offline — refresh or reconnect in Profile';
export const SERVER_OFFLINE_MSG = 'TradeX server starting — please wait…';
export const CONNECT_PATH = '/fyers-login';

/** Strip vendor names from messages shown in UI */
export function sanitizeDisplayMessage(msg: string): string {
  return String(msg || '')
    .replace(/fyers/gi, 'TradeX')
    .replace(/\bAPI server\b/gi, 'TradeX server')
    .replace(/\bMarket API\b/gi, 'TradeX')
    .replace(/\bAPI offline\b/gi, 'Offline')
    .replace(/\bAPI Access\b/gi, 'Data Access')
    .replace(/Connect Fyers/gi, 'Connect TradeX Live')
    .replace(/npm run dev:all/gi, 'npm run dev')
    .replace(/npm run server/gi, 'npm run dev')
    .replace(/FYERS_[A-Z_]+/g, 'configuration')
    .replace(/myapi\.fyers\.in/gi, 'developer portal')
    .replace(/auth_code/gi, 'login code')
    .replace(/App Secret/gi, 'secret key')
    .replace(/invalid app id hash/gi, 'Invalid credentials — check secret key in settings')
    .replace(/Broker\s*\/?\s*API/gi, 'External feed')
    .replace(/Connect API/gi, 'Connect TradeX Live');
}
