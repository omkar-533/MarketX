import { Router } from 'express';
import {
  exchangeFyersAuthCode,
  generateFyersAuthUrl,
  getFyersConfig,
  getFyersAccessToken,
  getFyersConfigDiagnostics,
  isFyersConfigured,
  clearFyersAccessToken,
  setFyersAccessToken,
  validateFyersToken,
} from '../market/fyersSession.mjs';
import { initMarketProvider, restartFyersMarketStream } from '../market/provider.mjs';
import { bootFyersAutoConnect } from '../market/fyersAutoConnect.mjs';
import { shutdownFyersSocket } from '../market/fyersWsManager.mjs';
import { fyersCallbackHtml } from './callbackPage.mjs';
import { setBrokerSessionCookie, clearBrokerSessionCookie } from '../services/brokerSession.mjs';

const router = Router();

router.get('/status', (_req, res) => {
  const { appId, redirect } = getFyersConfig();
  res.json({
    configured: Boolean(appId),
    connected: isFyersConfigured(),
    hasToken: Boolean(getFyersAccessToken()),
    redirectUri: redirect,
    diagnostics: getFyersConfigDiagnostics(),
  });
});

router.get('/check-config', (_req, res) => {
  const d = getFyersConfigDiagnostics();
  const issues = [];
  if (!d.appIdFormatOk) issues.push('FYERS_APP_ID must end with -100');
  if (!d.secretConfigured) issues.push('FYERS_SECRET_KEY missing in .env.local');
  if (d.secretConfigured && d.secretLength < 6) {
    issues.push('FYERS_SECRET_KEY missing or invalid — copy Secret ID from Fyers dashboard');
  }
  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/i.test(d.redirectUri || '')) {
    issues.push(
      'FYERS_REDIRECT_URI points to localhost — set it to your Render callback URL',
    );
  }
  const notes = [];
  if (!d.refreshTokenConfigured) {
    notes.push('FYERS_REFRESH_TOKEN missing — auto-renew disabled (manual login after expiry)');
  }
  if (!d.pinConfigured) {
    notes.push('FYERS_PIN missing — auto-renew disabled (set 4-digit TPIN in env)');
  }
  res.json({
    ok: issues.length === 0,
    ...d,
    issues,
    notes,
    fix:
      issues.length > 0
        ? 'https://myapi.fyers.in/dashboard → App → copy App ID + App Secret → .env.local → restart npm run dev'
        : 'Config OK — use /fyers-login for fresh auth_code. Add FYERS_REFRESH_TOKEN + FYERS_PIN for zero-manual renew.',
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

/** One-click: open http://localhost:5173/api/fyers/go in browser to start OAuth */
router.get('/go', (_req, res) => {
  try {
    const url = generateFyersAuthUrl();
    return res.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to build login URL';
    return res.status(400).send(msg);
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
    await bootFyersAutoConnect();
    return res.json({ ok: true, message: 'TradeX connected — auto-reconnect enabled', expires: tokenRes?.expires_in });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed';
    return res.status(502).json({ error: msg });
  }
});

function pickAuthCodeFromQuery(query = {}) {
  return String(
    query.auth_code || query.code || query.authCode || '',
  ).trim();
}

/** OAuth return — HTML reads auth_code from #hash or ?query (Fyers may use either). */
router.get('/callback', (req, res) => {
  const appUrl = process.env.VITE_DEV_URL?.trim() || 'http://localhost:5173/';
  const authCode = pickAuthCodeFromQuery(req.query);

  if (authCode) {
    return void exchangeFyersAuthCode(authCode)
      .then(async () => {
        initMarketProvider();
        restartFyersMarketStream();
        await bootFyersAutoConnect();
        setBrokerSessionCookie(res);
        return res.send(
          `<html><body style="font-family:sans-serif;background:#0a0e1a;color:#e2e8f0;padding:2rem">
            <h2>TradeX connected ✓</h2>
            <p>Redirecting…</p>
            <script>setTimeout(function(){ location.href=${JSON.stringify(appUrl)}; }, 1200);</script>
          </body></html>`,
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Token exchange failed';
        return res.status(502).type('html').send(
          fyersCallbackHtml({ appUrl, apiConnectPath: '/api/fyers/connect' }).replace(
            'Processing redirect…',
            `Token error: ${msg.replace(/[<>]/g, '')}. Paste auth_code below.`,
          ),
        );
      });
  }

  return res.send(fyersCallbackHtml({ appUrl, apiConnectPath: '/api/fyers/connect' }));
});

router.post('/access-token', async (req, res) => {
  const token = String(req.body?.access_token || req.body?.accessToken || '').trim();
  if (!token || token.length < 40) {
    return res.status(400).json({ error: 'Valid access_token required' });
  }
  try {
    setFyersAccessToken(token);
    const valid = await validateFyersToken();
    if (!valid) {
      clearFyersAccessToken();
      return res.status(400).json({ error: 'Token invalid — check App ID matches token' });
    }
    initMarketProvider();
    restartFyersMarketStream();
    await bootFyersAutoConnect();
    setBrokerSessionCookie(res);
    return res.json({ ok: true, message: 'Access token saved — auto-connect enabled' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save token';
    return res.status(502).json({ error: msg });
  }
});

router.post('/disconnect', (_req, res) => {
  shutdownFyersSocket();
  clearFyersAccessToken();
  clearBrokerSessionCookie(res);
  return res.json({ ok: true });
});

export default router;
