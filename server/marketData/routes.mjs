/**
 * /api/market-data — connection + read-only candles/quotes.
 * Tokens never leave the server. Order execution never exposed.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  listProviders,
  getProvider,
  DEMO_PROVIDER,
  INDSTOCKS_PROVIDER,
} from './providersCatalog.mjs';
import {
  storeCredential,
  deleteCredential,
  getCredential,
  publicView,
  readDecryptedCredential,
} from './credentialStore.mjs';
import { attachOptionalAppUser } from './optionalAuth.mjs';
import {
  validateIndstocksToken,
  refreshIndstocksInstrumentMap,
  resolveScripCode,
  resolveScripCodeCandidates,
  listUniverseSymbols,
  listScannableUniverseSymbols,
  fetchIndstocksQuote,
  fetchIndstocksCandles,
  INDSTOCKS_CAPABILITIES,
  INDSTOCKS_PERMISSION_NOTE,
} from './indstocksClient.mjs';
import { getInstrumentUniverseStats } from './instrumentUniverse.mjs';

const router = Router();
const SESSION_COOKIE = 'wolf_md_session';

router.use(attachOptionalAppUser);

function userKeyFrom(req, res) {
  const authUser = req.appUser?.id;
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

function requireLiveToken(req, res) {
  const key = userKeyFrom(req, res);
  const record = getCredential(key);
  if (!record || record.status !== 'CONNECTED') {
    res.status(401).json({ error: 'Market data not connected' });
    return null;
  }
  if (record.mode === 'DEMO' || record.provider === 'mock-demo') {
    res.status(400).json({ error: 'Demo connection has no live broker feed' });
    return null;
  }
  const cred = readDecryptedCredential(key);
  const accessToken = cred?.accessToken;
  if (!accessToken) {
    res.status(401).json({ error: 'Market data credential missing. Reconnect.' });
    return null;
  }
  return { key, record, accessToken };
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

router.post('/connect', async (req, res) => {
  const key = userKeyFrom(req, res);
  const providerId = String(req.body?.providerId || '').trim();
  const provider = getProvider(providerId);
  if (!provider) {
    return res.status(400).json({ error: 'Unknown market data provider' });
  }
  if (!provider.enabled) {
    return res.status(400).json({
      error: `${provider.name} is not enabled. WOLF will not fake a connection.`,
      providerId: provider.id,
      enabled: false,
    });
  }

  if (provider.isDemo) {
    const view = storeCredential({
      userKey: key,
      provider: DEMO_PROVIDER.id,
      credentialPayload: { kind: 'demo', v: 1 },
      expiresAt: null,
      capabilities: DEMO_PROVIDER.capabilities,
      mode: 'DEMO',
      status: 'CONNECTED',
      permissionNote: null,
    });
    console.log('[market-data] demo connected', { keyType: key.split(':')[0] });
    return res.json(view);
  }

  if (provider.id === 'indstocks') {
    const accessToken = String(req.body?.accessToken || '').trim();
    // Clear from req body echo risk — never return token
    req.body.accessToken = undefined;
    if (!accessToken || accessToken.length < 12) {
      return res.status(400).json({
        error:
          'Paste your INDstocks access token from indstocks.com/app/api-trading/access-tokens. WOLF does not accept MPIN, OTP, or TOTP.',
      });
    }
    try {
      await validateIndstocksToken(accessToken);
    } catch (e) {
      const status = e?.status === 401 || e?.status === 403 ? 401 : 400;
      return res.status(status).json({
        error: 'INDstocks token invalid or expired. Generate a new token on indstocks.com and try again.',
      });
    }
    try {
      await refreshIndstocksInstrumentMap(accessToken);
    } catch {
      // non-fatal — fallback scrip map still works
      console.log('[market-data] instrument refresh skipped');
    }

    const view = storeCredential({
      userKey: key,
      provider: INDSTOCKS_PROVIDER.id,
      credentialPayload: { kind: 'indstocks', accessToken, v: 1 },
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      capabilities: INDSTOCKS_CAPABILITIES,
      mode: 'LIVE',
      status: 'CONNECTED',
      permissionNote: INDSTOCKS_PERMISSION_NOTE,
    });
    console.log('[market-data] indstocks connected', { keyType: key.split(':')[0] });
    return res.json(view);
  }

  return res.status(501).json({
    error: 'This provider is not configured yet.',
    providerId: provider.id,
  });
});

router.post('/callback', (_req, res) => {
  res.status(501).json({
    error: 'OAuth callback not used for INDstocks token connect.',
  });
});

router.post('/disconnect', (req, res) => {
  const key = userKeyFrom(req, res);
  deleteCredential(key);
  console.log('[market-data] disconnected', { keyType: key.split(':')[0] });
  res.json(publicView(null));
});

router.get('/symbols', (req, res) => {
  const universe = String(req.query.universe || 'F&O');
  const catalog = listUniverseSymbols(universe);
  const scannable = listScannableUniverseSymbols(universe);
  const preferScannable = String(req.query.mode || '') === 'scannable';
  const stats = getInstrumentUniverseStats();
  const fromLive = Boolean(stats.refreshedAt);
  res.json({
    symbols: preferScannable ? scannable : catalog,
    catalog,
    scannable,
    universe,
    universeLoaded: catalog.length,
    dataAvailable: scannable.length,
    dataUnavailable: Math.max(0, catalog.length - scannable.length),
    instrumentMaster: stats,
    source: fromLive ? 'indstocks-instrument-master' : 'static-catalog-fallback',
    note: fromLive
      ? 'Universe derived from connected INDstocks instrument master (equity / index / F&O CSVs). Scannable = resolvable scrips only.'
      : 'Static WOLF catalog fallback (connect INDstocks to load the full instrument master). Scannable = resolvable scrips only.',
  });
});

router.get('/universes', (_req, res) => {
  const stats = getInstrumentUniverseStats();
  const mk = (id) => {
    const catalog = listUniverseSymbols(id);
    const scannable = listScannableUniverseSymbols(id);
    return {
      id,
      catalogCount: catalog.length,
      scannableCount: scannable.length,
      unavailableCount: Math.max(0, catalog.length - scannable.length),
    };
  };
  res.json({
    source: stats.refreshedAt ? 'indstocks-instrument-master' : 'static-catalog-fallback',
    instrumentMaster: stats,
    universes: {
      NSE: mk('NSE'),
      BSE: mk('BSE'),
      'F&O': mk('F&O'),
      NIFTY50: mk('NIFTY50'),
      CASH: mk('CASH'),
      BANKNIFTY: mk('BANKNIFTY'),
    },
  });
});

router.get('/quote', async (req, res) => {
  const live = requireLiveToken(req, res);
  if (!live) return;
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const candidates = resolveScripCodeCandidates(symbol);
  if (!candidates.length) return res.status(404).json({ error: `Unknown symbol: ${symbol}` });
  try {
    let lastErr = null;
    for (const scrip of candidates) {
      try {
        const quote = await fetchIndstocksQuote(live.accessToken, scrip);
        quote.symbol = symbol;
        return res.json({ quote, mode: 'LIVE', source: 'indstocks', scrip });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Quote unavailable');
  } catch (e) {
    const status = e?.status === 401 ? 401 : 502;
    if (status === 401) {
      live.record.status = 'EXPIRED';
    }
    res.status(status).json({
      error: status === 401
        ? 'Market data connection expired. Reconnect your broker.'
        : 'Failed to fetch quote',
    });
  }
});

router.get('/candles', async (req, res) => {
  const live = requireLiveToken(req, res);
  if (!live) return;
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const timeframe = String(req.query.timeframe || '5m').trim();
  const bars = Math.min(3200, Math.max(10, Number(req.query.bars) || 80));
  const beforeRaw = Number(req.query.before);
  const beforeMs = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const candidates = resolveScripCodeCandidates(symbol);
  if (!candidates.length) {
    return res.status(404).json({
      error: `Unknown symbol: ${symbol}`,
      hint: 'Index symbols need NIDX scrips. Reconnect market data after API redeploy.',
    });
  }
  try {
    let candles = [];
    let used = candidates[0];
    for (const scrip of candidates) {
      const chunk = await fetchIndstocksCandles(live.accessToken, scrip, timeframe, bars, {
        beforeMs,
      });
      if (chunk?.length) {
        candles = chunk;
        used = scrip;
        break;
      }
    }
    for (const c of candles) c.symbol = symbol;
    res.json({
      symbol,
      timeframe,
      candles,
      scrip: used,
      mode: 'LIVE',
      source: 'indstocks',
      orderExecution: false,
    });
  } catch (e) {
    const status = e?.status === 401 ? 401 : 502;
    res.status(status).json({
      error: status === 401
        ? 'Market data connection expired. Reconnect your broker.'
        : 'Failed to fetch candles',
    });
  }
});

/** Stub — client scanner still runs; live provider feeds candles via /candles. */
router.post('/radar/scan', (_req, res) => {
  res.status(501).json({
    error: 'Server-side radar job coming later. Use client scanner with connected LIVE provider.',
    orderExecution: false,
  });
});

export default router;
