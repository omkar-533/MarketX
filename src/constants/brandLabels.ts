/** User-facing brand — never show broker/API vendor names on screen */
export const BRAND = 'Wolf Trade AI';
export const BRAND_SHORT = 'Wolf Trade';
export const BRAND_LINE1 = 'Wolf Trade';
export const BRAND_LINE2 = 'AI';
/** Official tagline — no trailing period so it can sit inline after the name. */
export const BRAND_TAGLINE = 'The Future of Intelligent Trading';
export const BRAND_TAGLINE_FULL = `${BRAND_TAGLINE}.`;
export const LIVE_DATA_LABEL = 'Live Data';
export const CONNECT_LIVE_LABEL = 'Connect Live Data';
export const LIVE_FEED_LABEL = 'AI live market feed';
export const DATA_OFFLINE_MSG = 'Live data offline — refresh or reconnect in Profile';
export const SERVER_OFFLINE_MSG = `${BRAND} server starting — please wait…`;
export const CONNECT_PATH = '/fyers-login';

/** Tab id → human page name (for document.title + UI) */
export const PAGE_NAMES: Record<string, string> = {
  dashboard: 'Dashboard',
  ltpcalc: 'LPT Master',
  tradingjournal: 'Trading Journal',
  optionchain: 'Option Chain',
  optionsimulator: 'Option Simulator',
  strategy: 'Strategy Builder',
  scanner: 'Scanners',
  'master-tx': 'Master TX',
  watchlist: 'Watchlist',
  alerts: 'Alerts',
  news: 'News',
  admin: 'Admin',
  subscription: 'Subscription',
  global: 'Global Markets',
  papertrading: 'Paper Trading',
  backtesting: 'Backtesting',
  heatmap: 'Heatmap',
  signals: 'Signals',
  futures: 'Futures Analytics',
  oiintelligence: 'AI Intelligence',
  footprint: 'Footprint',
  trafi: 'Master AI',
  indicators: 'Indicators',
};

export function pageDocumentTitle(tabId?: string | null): string {
  const page = tabId ? PAGE_NAMES[tabId] : null;
  return page ? `${page} · ${BRAND}` : BRAND;
}

/** True when UI talks to remote API (Vercel + Render), not local Vite proxy only */
export const hasRemoteApi = Boolean(import.meta.env.VITE_API_URL?.trim());

/** User-facing message when API is down — never expose CLI / npm commands */
export function serverOfflineMessage(): string {
  return hasRemoteApi
    ? 'Live market feed reconnecting…'
    : 'Market feed unavailable — please refresh shortly';
}

export function serverUnreachableMessage(): string {
  return hasRemoteApi
    ? 'Unable to reach live market feed — retrying…'
    : 'Market feed temporarily unavailable — please try again';
}

export function masterAiOfflineMessage(): string {
  return hasRemoteApi
    ? 'Master AI temporarily offline — reconnecting…'
    : 'Master AI temporarily unavailable — please try again';
}

/** Strip vendor names and developer commands from messages shown in UI */
export function sanitizeDisplayMessage(msg: string): string {
  return String(msg || '')
    .replace(/AI Powered Market Intelligent/gi, BRAND)
    .replace(/\bAPMI\b/gi, BRAND_SHORT)
    .replace(/opstra/gi, BRAND_SHORT)
    .replace(/fyers/gi, BRAND_SHORT)
    .replace(/Master TradeX/gi, BRAND)
    .replace(/\bTradeX\b/gi, BRAND_SHORT)
    .replace(/\bAPI server\b/gi, 'live server')
    .replace(/\bMarket API\b/gi, 'market feed')
    .replace(/\bAPI offline\b/gi, 'Offline')
    .replace(/\bAPI Access\b/gi, 'Data Access')
    .replace(/Connect Fyers/gi, CONNECT_LIVE_LABEL)
    .replace(/Start\s+\w+\s+server:\s*/gi, '')
    .replace(/npm run dev:all/gi, 'refresh')
    .replace(/npm run server/gi, 'refresh')
    .replace(/npm run dev/gi, 'refresh')
    .replace(/run npm run\s+\S+/gi, 'refresh')
    .replace(/FYERS_[A-Z_]+/g, 'configuration')
    .replace(/myapi\.fyers\.in/gi, 'developer portal')
    .replace(/auth_code/gi, 'login code')
    .replace(/App Secret/gi, 'secret key')
    .replace(/invalid app id hash/gi, 'Invalid credentials — check secret key in settings')
    .replace(/Broker\s*\/?\s*API/gi, 'External feed')
    .replace(/Connect API/gi, CONNECT_LIVE_LABEL)
    .replace(/io server disconnect/gi, 'Live stream paused')
    .replace(/transport close/gi, 'Connection closed')
    .replace(/\bdisconnect(ed)?\b/gi, 'reconnect needed')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
