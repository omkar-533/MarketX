/**
 * /api/market-data — connection catalog + status.
 * Tokens never leave the server. Order execution never exposed.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { listProviders, getProvider, DEMO_PROVIDER } from './providersCatalog.mjs';
import {
  storeCredential,
  deleteCredential,
  getCredential,
  publicView,
} from './credentialStore.mjs';

const router = Router();
const SESSION_COOKIE = 'wolf_md_session';

function userKeyFrom(req, res) {
  // Prefer authenticated user id when present; else opaque session cookie.
  const authUser = req.user?.id || req.appUser?.id;
  if (authUser) return `user:${authUser}`;

  let sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) {
    sid = randomUUID();
    const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  return `session:${sid}`;
}

router.get('/providers', (_req, res) => {
  res.json({
    providers: listProviders(),
    orderExecution: false,
    note: 'WOLF market-data connectors are read-only. Order access is NOT ENABLED.',
  });
});

router.get('/providers/:providerId/capabilities', (req, res) => {
  const provider = getProvider(String(req.params.providerId || ''));
  if (!provider) return res.status(404).json({ error: 'Unknown provider' });
  res.json({
    id: provider.id,
    name: provider.name,
    capabilities: provider.capabilities,
    supportedExchanges: provider.supportedExchanges,
    supportedTimeframes: provider.supportedTimeframes,
    enabled: provider.enabled,
    isDemo: provider.isDemo,
    notes: provider.notes,
  });
});

router.get('/status', (req, res) => {
  const key = userKeyFrom(req, res);
  const record = getCredential(key);
  res.json(publicView(record));
});

router.post('/connect', (req, res) => {
  const key = userKeyFrom(req, res);
  const providerId = String(req.body?.providerId || '').trim();
  const provider = getProvider(providerId);
  if (!provider) {
    return res.status(400).json({ error: 'Unknown market data provider' });
  }
  if (!provider.enabled) {
    return res.status(400).json({
      error: `${provider.name} is not enabled yet. Official authorization will be required — no fake connect.`,
      providerId: provider.id,
      enabled: false,
    });
  }
  if (!provider.isDemo) {
    // Phase 12: start OAuth redirect here. Do not accept passwords.
    return res.status(501).json({
      error: 'Official broker authorization is not configured yet.',
      providerId: provider.id,
    });
  }

  const view = storeCredential({
    userKey: key,
    provider: DEMO_PROVIDER.id,
    credentialPayload: { kind: 'demo', v: 1 },
    expiresAt: null,
    capabilities: DEMO_PROVIDER.capabilities,
    mode: 'DEMO',
    status: 'CONNECTED',
  });

  console.log('[market-data] demo connected', { provider: DEMO_PROVIDER.id, keyType: key.split(':')[0] });
  res.json(view);
});

router.post('/callback', (_req, res) => {
  // OAuth callbacks land here once a real broker is enabled.
  res.status(501).json({
    error: 'Broker OAuth callback is not configured. No credentials accepted.',
  });
});

router.post('/disconnect', (req, res) => {
  const key = userKeyFrom(req, res);
  deleteCredential(key);
  console.log('[market-data] disconnected', { keyType: key.split(':')[0] });
  res.json(publicView(null));
});

/** Stub scan job — real server scan moves engines server-side in a later phase. */
router.post('/radar/scan', (_req, res) => {
  res.status(501).json({
    error: 'Server-side radar scan not enabled yet. Client DEMO scanner is active.',
    orderExecution: false,
  });
});

export default router;
