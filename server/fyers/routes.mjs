import { Router } from 'express';
import {
  exchangeFyersAuthCode,
  generateFyersAuthUrl,
  getFyersConfig,
  getFyersAccessToken,
  isFyersConfigured,
  setFyersAccessToken,
} from '../market/fyersSession.mjs';
import { initMarketProvider, restartFyersMarketStream } from '../market/provider.mjs';
import { shutdownFyersSocket } from '../market/fyersWsManager.mjs';

const router = Router();

router.get('/status', (_req, res) => {
  const { appId, redirect } = getFyersConfig();
  res.json({
    configured: Boolean(appId),
    connected: isFyersConfigured(),
    hasToken: Boolean(getFyersAccessToken()),
    redirectUri: redirect,
  });
});

router.get('/login-url', (_req, res) => {
  try {
    const url = generateFyersAuthUrl();
    return res.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to build login URL';
    return res.status(400).json({ error: msg });
  }
});

router.post('/connect', async (req, res) => {
  const authCode = String(req.body?.auth_code || req.body?.authCode || '').trim();
  if (!authCode) {
    return res.status(400).json({ error: 'auth_code required' });
  }
  try {
    const tokenRes = await exchangeFyersAuthCode(authCode);
    initMarketProvider();
    restartFyersMarketStream();
    return res.json({ ok: true, message: 'Fyers connected', expires: tokenRes?.expires_in });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed';
    return res.status(502).json({ error: msg });
  }
});

router.get('/callback', async (req, res) => {
  const authCode = String(req.query.auth_code || req.query.code || '').trim();
  if (!authCode) {
    return res.status(400).send('Missing auth_code from Fyers redirect');
  }
  try {
    await exchangeFyersAuthCode(authCode);
    initMarketProvider();
    restartFyersMarketStream();
    return res.send(
      '<html><body style="font-family:sans-serif;background:#0a0e1a;color:#e2e8f0;padding:2rem"><h2>Fyers connected</h2><p>You can close this tab and return to Master TradeX.</p></body></html>',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed';
    return res.status(502).send(`Fyers connection failed: ${msg}`);
  }
});

router.post('/disconnect', (_req, res) => {
  shutdownFyersSocket();
  setFyersAccessToken('');
  return res.json({ ok: true });
});

export default router;
