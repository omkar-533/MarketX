/** Zerodha Kite Connect credentials from env / runtime token store. */

let runtimeAccessToken = '';

export function getKiteApiKey() {
  return process.env.KITE_API_KEY?.trim() || '';
}

export function getKiteApiSecret() {
  return process.env.KITE_API_SECRET?.trim() || '';
}

export function getKiteAccessToken() {
  return (
    runtimeAccessToken ||
    process.env.KITE_ACCESS_TOKEN?.trim() ||
    ''
  );
}

export function setKiteAccessToken(token) {
  runtimeAccessToken = String(token || '').trim();
}

export function isKiteConfigured() {
  return Boolean(getKiteApiKey() && getKiteAccessToken());
}

export function isKiteLoginReady() {
  return Boolean(getKiteApiKey() && getKiteApiSecret());
}

export function kiteRedirectUrl(config) {
  return (
    process.env.KITE_REDIRECT_URL?.trim() ||
    `${(config?.apiPublicUrl || 'http://127.0.0.1:5000').replace(/\/$/, '')}/api/market/kite/callback`
  );
}
