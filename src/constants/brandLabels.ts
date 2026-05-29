/** User-facing labels — never show broker/API vendor names on screen */
export const BRAND = 'TradeX';
export const LIVE_DATA_LABEL = 'TradeX Live';
export const CONNECT_LIVE_LABEL = 'Connect Live Data';
export const LIVE_FEED_LABEL = 'TradeX live feed';
export const DATA_OFFLINE_MSG = 'Live data offline — refresh or reconnect in Profile';
export const SERVER_OFFLINE_MSG = 'TradeX server starting — please wait…';
export const CONNECT_PATH = '/fyers-login';

/** True when UI talks to remote API (Vercel + Render), not local Vite proxy only */
export const hasRemoteApi = Boolean(import.meta.env.VITE_API_URL?.trim());

/** User-facing message when API is down — no "npm run dev" on production */
export function serverOfflineMessage(): string {
  return hasRemoteApi
    ? 'Live server waking up — reconnecting…'
    : 'Start TradeX server: npm run dev';
}

export function serverUnreachableMessage(): string {
  return hasRemoteApi
    ? 'Cannot reach live server — wait ~1 min (free tier) or refresh'
    : 'Cannot reach TradeX server — run npm run dev';
}

export function masterAiOfflineMessage(): string {
  return hasRemoteApi
    ? 'Master AI offline — live server unreachable'
    : 'Offline — start npm run dev';
}

/** Strip vendor names from messages shown in UI */
export function sanitizeDisplayMessage(msg: string): string {
  const devHint = hasRemoteApi ? 'reconnect live server' : 'npm run dev';
  return String(msg || '')
    .replace(/opstra/gi, 'TradeX')
    .replace(/fyers/gi, 'TradeX')
    .replace(/\bAPI server\b/gi, 'TradeX server')
    .replace(/\bMarket API\b/gi, 'TradeX')
    .replace(/\bAPI offline\b/gi, 'Offline')
    .replace(/\bAPI Access\b/gi, 'Data Access')
    .replace(/Connect Fyers/gi, 'Connect TradeX Live')
    .replace(/npm run dev:all/gi, devHint)
    .replace(/npm run server/gi, devHint)
    .replace(/npm run dev/gi, devHint)
    .replace(/FYERS_[A-Z_]+/g, 'configuration')
    .replace(/myapi\.fyers\.in/gi, 'developer portal')
    .replace(/auth_code/gi, 'login code')
    .replace(/App Secret/gi, 'secret key')
    .replace(/invalid app id hash/gi, 'Invalid credentials — check secret key in settings')
    .replace(/Broker\s*\/?\s*API/gi, 'External feed')
    .replace(/Connect API/gi, 'Connect TradeX Live')
    .replace(/io server disconnect/gi, 'Live stream paused')
    .replace(/transport close/gi, 'Connection closed')
    .replace(/\bdisconnect(ed)?\b/gi, 'reconnect needed');
}
