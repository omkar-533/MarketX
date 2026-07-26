/** User-facing brand — never show broker/API vendor names on screen */
export const BRAND = 'AI Powered Market Intelligent';
export const BRAND_SHORT = 'APMI';
export const BRAND_LINE1 = 'AI Powered';
export const BRAND_LINE2 = 'Market Intelligent';
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
};

export function pageDocumentTitle(tabId?: string | null): string {
  const page = tabId ? PAGE_NAMES[tabId] : null;
  return page ? `${page} · ${BRAND}` : BRAND;
}

/** True when UI talks to remote API (Vercel + Render), not local Vite proxy only */
export const hasRemoteApi = Boolean(import.meta.env.VITE_API_URL?.trim());

/** User-facing message when API is down — no "npm run dev" on production */
export function serverOfflineMessage(): string {
  return hasRemoteApi
    ? 'Live server waking up — reconnecting…'
    : `Start ${BRAND_SHORT} server: npm run dev`;
}

export function serverUnreachableMessage(): string {
  return hasRemoteApi
    ? 'Cannot reach live server — wait ~1 min (free tier) or refresh'
    : `Cannot reach ${BRAND_SHORT} server — run npm run dev`;
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
    .replace(/opstra/gi, BRAND_SHORT)
    .replace(/fyers/gi, BRAND_SHORT)
    .replace(/Master TradeX/gi, BRAND)
    .replace(/\bTradeX\b/gi, BRAND_SHORT)
    .replace(/\bAPI server\b/gi, `${BRAND_SHORT} server`)
    .replace(/\bMarket API\b/gi, BRAND_SHORT)
    .replace(/\bAPI offline\b/gi, 'Offline')
    .replace(/\bAPI Access\b/gi, 'Data Access')
    .replace(/Connect Fyers/gi, CONNECT_LIVE_LABEL)
    .replace(/npm run dev:all/gi, devHint)
    .replace(/npm run server/gi, devHint)
    .replace(/npm run dev/gi, devHint)
    .replace(/FYERS_[A-Z_]+/g, 'configuration')
    .replace(/myapi\.fyers\.in/gi, 'developer portal')
    .replace(/auth_code/gi, 'login code')
    .replace(/App Secret/gi, 'secret key')
    .replace(/invalid app id hash/gi, 'Invalid credentials — check secret key in settings')
    .replace(/Broker\s*\/?\s*API/gi, 'External feed')
    .replace(/Connect API/gi, CONNECT_LIVE_LABEL)
    .replace(/io server disconnect/gi, 'Live stream paused')
    .replace(/transport close/gi, 'Connection closed')
    .replace(/\bdisconnect(ed)?\b/gi, 'reconnect needed');
}
