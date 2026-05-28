/**
 * Production Fyers auth API (spec routes) — wraps existing Fyers OAuth + session cookies.
 */
import { Router } from 'express';
import {
  exchangeFyersAuthCode,
  generateFyersAuthUrl,
  getFyersAccessToken,
  isFyersConfigured,
  setFyersAccessToken,
} from '../market/fyersSession.mjs';
import { initMarketProvider, restartFyersMarketStream } from '../market/provider.mjs';
import { bootFyersAutoConnect } from '../market/fyersAutoConnect.mjs';
import { shutdownFyersSocket, getFyersWsStatus } from '../market/fyersWsManager.mjs';
import { getActiveMarketProvider } from '../market/provider.mjs';
import { fyersCallbackHtml } from '../fyers/callbackPage.mjs';
import {
  setBrokerSessionCookie,
  clearBrokerSessionCookie,
  readBrokerSession,
} from '../services/brokerSession.mjs';
import { getServerConfig } from '../config/env.mjs';

const router = Router();

function pickAuthCodeFromQuery(query = {}) {
  let code = String(query.auth_code || query.code || query.authCode || '').trim();
  const stateIdx = code.indexOf('&state=');
  if (stateIdx > 0 && /^eyJ/i.test(code)) code = code.slice(0, stateIdx);
  return code;
}

async function completeBrokerConnect(res) {
  initMarketProvider();
  restartFyersMarketStream();
  await bootFyersAutoConnect();
  setBrokerSessionCookie(res);
}

function sessionPayload(req) {
  const hasToken = Boolean(getFyersAccessToken());
  const configured = Boolean(getServerConfig().fyersAppId);
  const brokerConnected = isFyersConfigured();
  const ws = getFyersWsStatus();
  const jwtSession = readBrokerSession(req);

  return {
    broker: 'fyers',
    brokerConnected,
    configured,
    hasToken,
    sessionActive: Boolean(jwtSession) || brokerConnected,
    provider: getActiveMarketProvider(),
    wsStatus: ws.status,
    wsConnected: ws.connected,
    hasTicks: ws.hasTicks,
    autoReconnect: true,
    needsLogin: configured && !brokerConnected,
    redirectUri: getServerConfig().fyersRedirect,
  };
}

/** GET /api/auth/fyers/login — start OAuth */
router.get('/fyers/login', (_req, res) => {
  try {
    const url = generateFyersAuthUrl({ forceLogin: true });
    return res.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Login URL failed';
    return res.status(400).json({ error: msg });
  }
});

/** GET /api/auth/fyers/callback — OAuth return + auto token exchange */
router.get('/fyers/callback', (req, res) => {
  const { frontendUrl } = getServerConfig();
  const authCode = pickAuthCodeFromQuery(req.query);

  if (authCode) {
    return void exchangeFyersAuthCode(authCode)
      .then(async () => {
        await completeBrokerConnect(res);
        return res.send(
          `<html><body style="font-family:system-ui;background:#0a0e1a;color:#e2e8f0;padding:2rem">
            <h2>TradeX connected ✓</h2>
            <p>Live data auto-reconnect enabled. Redirecting…</p>
            <script>setTimeout(function(){ location.href=${JSON.stringify(`${frontendUrl}/`)}; }, 1200);</script>
          </body></html>`,
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Token exchange failed';
        return res.status(502).type('html').send(
          fyersCallbackHtml({
            appUrl: `${frontendUrl}/fyers-login`,
            apiConnectPath: '/api/auth/fyers/connect',
          }).replace('Processing redirect…', `Error: ${msg.replace(/[<>]/g, '')}`),
        );
      });
  }

  return res.send(
    fyersCallbackHtml({
      appUrl: `${frontendUrl}/fyers-login`,
      apiConnectPath: '/api/auth/fyers/connect',
    }),
  );
});

/** POST /api/auth/fyers/connect — manual auth_code (fallback) */
router.post('/fyers/connect', async (req, res) => {
  const authCode = String(req.body?.auth_code || req.body?.authCode || '').trim();
  if (!authCode) return res.status(400).json({ error: 'auth_code required' });
  try {
    await exchangeFyersAuthCode(authCode);
    await completeBrokerConnect(res);
    return res.json({ ok: true, ...sessionPayload(req) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connect failed';
    return res.status(502).json({ error: msg });
  }
});

/** GET /api/auth/session — broker + websocket state (no secrets) */
router.get('/session', (req, res) => {
  const payload = sessionPayload(req);
  if (payload.brokerConnected && !readBrokerSession(req)) {
    setBrokerSessionCookie(res);
    payload.sessionActive = true;
  }
  return res.json(payload);
});

/** POST /api/auth/logout — disconnect broker */
router.post('/logout', (_req, res) => {
  shutdownFyersSocket();
  setFyersAccessToken('');
  clearBrokerSessionCookie(res);
  return res.json({ ok: true, brokerConnected: false });
});

export default router;
