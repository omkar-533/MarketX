import { KiteConnect } from 'kiteconnect';
import {
  getKiteApiKey,
  getKiteApiSecret,
  isKiteLoginReady,
  kiteRedirectUrl,
  setKiteAccessToken,
} from './kiteConfig.mjs';
import { restartKiteWithToken } from './kiteWsManager.mjs';

export function buildKiteLoginUrl(config) {
  if (!isKiteLoginReady()) {
    throw new Error('Set KITE_API_KEY and KITE_API_SECRET to enable Kite login');
  }
  const kc = new KiteConnect({ api_key: getKiteApiKey() });
  // Zerodha uses the redirect URL configured in the developer console;
  // we still expose it so ops can verify.
  void kiteRedirectUrl(config);
  return kc.getLoginURL();
}

export async function exchangeKiteRequestToken(requestToken) {
  if (!isKiteLoginReady()) {
    throw new Error('Set KITE_API_KEY and KITE_API_SECRET first');
  }
  const token = String(requestToken || '').trim();
  if (!token) throw new Error('request_token required');

  const kc = new KiteConnect({ api_key: getKiteApiKey() });
  const session = await kc.generateSession(token, getKiteApiSecret());
  setKiteAccessToken(session.access_token);
  restartKiteWithToken();
  return {
    user_id: session.user_id,
    user_name: session.user_name,
    login_time: session.login_time,
    // access_token stays server-side (runtime); echo only truncated for UI confirm
    accessTokenSet: true,
    accessTokenHint: String(session.access_token || '').slice(0, 6) + '…',
  };
}
