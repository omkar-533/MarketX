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
  storeCredentialOnKeys,
  persistStoredCredential,
  deleteCredentialPersist,
  expireCredentialPersist,
  resolveCredential,
  adoptCredential,
  publicView,
  readDecryptedCredential,
} from './credentialStore.mjs';
import { attachOptionalAppUser } from './optionalAuth.mjs';
import {
  validateIndstocksToken,
  refreshIndstocksInstrumentMap,
  ensureInstrumentMap,
  resolveScripCode,
  resolveScripCodeCandidates,
  listUniverseSymbols,
  listScannableUniverseSymbols,
  fetchIndstocksQuote,
  fetchIndstocksQuotesMany,
  fetchIndstocksCandles,
  fetchIndstocksCandlesMany,
  INDSTOCKS_CAPABILITIES,
  INDSTOCKS_PERMISSION_NOTE,
} from './indstocksClient.mjs';
import { getInstrumentUniverseStats } from './instrumentUniverse.mjs';
import { resolveServerUniverse } from './universeLists.mjs';
import { peekOpportunitySnapshot } from './opportunitySnapshot.mjs';
import { peekOpportunityDayBoard, mergeOpportunityDayBoard } from './opportunityDayBoard.mjs';

const router = Router();
const SESSION_COOKIE = 'wolf_md_session';
const CANDLE_CACHE_TTL_MS = 45_000;
const candleCache = new Map();

router.use(attachOptionalAppUser);

function candleCacheKey(symbol, timeframe, bars) {
  const bucket = bars <= 90 ? 80 : bars <= 160 ? 120 : Math.min(3200, bars);
  return `${String(symbol || '').toUpperCase()}|${String(timeframe || '')}|${bucket}`;
}

function readCandleCache(symbol, timeframe, bars) {
  const hit = candleCache.get(candleCacheKey(symbol, timeframe, bars));
  if (!hit) return null;
  if (Date.now() - hit.at > CANDLE_CACHE_TTL_MS) {
    candleCache.delete(candleCacheKey(symbol, timeframe, bars));
    return null;
  }
  if (!Array.isArray(hit.candles) || hit.candles.length < 20) return null;
  return hit.candles;
}

function writeCandleCache(symbol, timeframe, bars, candles) {
  if (!candles?.length || candles.length < 20) return;
  candleCache.set(candleCacheKey(symbol, timeframe, bars), { at: Date.now(), candles });
  if (candleCache.size > 800) {
    const oldest = [...candleCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) candleCache.delete(oldest[0]);
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function resolveCandidates(accessToken, symbol) {
  await ensureInstrumentMap(accessToken);
  let candidates = resolveScripCodeCandidates(symbol);
  if (!candidates.length) {
    try {
      await ensureInstrumentMap(accessToken, { force: true });
    } catch {
      /* keep empty */
    }
    candidates = resolveScripCodeCandidates(symbol);
  }
  return candidates;
}

async function loadLiveCandles(accessToken, symbol, timeframe, bars, beforeMs, skipCache = false) {
  const cached = !beforeMs && !skipCache ? readCandleCache(symbol, timeframe, bars) : null;
  if (cached) return { candles: cached, scrip: 'cache' };
  const candidates = await resolveCandidates(accessToken, symbol);
  if (!candidates.length) {
    const err = new Error(`Unknown symbol: ${symbol}`);
    err.status = 404;
    throw err;
  }
  const tryN = Math.min(candidates.length, 6);
  const tryList = candidates.slice(0, tryN);
  let candles = [];
  let used = tryList[0];
  for (const scrip of tryList) {
    try {
      const chunk = await fetchIndstocksCandles(accessToken, scrip, timeframe, bars, { beforeMs });
      if (chunk?.length >= 20) {
        candles = chunk;
        used = scrip;
        break;
      }
      if (chunk?.length > candles.length) {
        candles = chunk;
        used = scrip;
      }
    } catch {
      /* try next scrip — never fail the desk on one dead token */
    }
  }
  for (const c of candles) c.symbol = symbol;
  if (!beforeMs) writeCandleCache(symbol, timeframe, bars, candles);
  return { candles, scrip: used };
}

async function loadLiveCandlesMany(accessToken, symbols, timeframe, bars, skipCache = false) {
  await ensureInstrumentMap(accessToken);
  /** @type {Record<string, object[]>} */
  const result = {};
  /** @type {{ symbol: string, scrip: string }[]} */
  const need = [];
  for (const symbol of symbols) {
    const cached = skipCache ? null : readCandleCache(symbol, timeframe, bars);
    if (cached?.length) {
      result[symbol] = cached;
      continue;
    }
    const candidates = resolveScripCodeCandidates(symbol);
    if (!candidates[0]) {
      result[symbol] = [];
      continue;
    }
    need.push({ symbol, scrip: candidates[0] });
  }
  if (!need.length) return result;

  const scrips = [...new Set(need.map((n) => n.scrip))];
  const byScrip = await fetchIndstocksCandlesMany(accessToken, scrips, timeframe, bars);
  for (const { symbol, scrip } of need) {
    let candles = byScrip.get(scrip) || [];
    if (candles.length < 20) {
      const alts = resolveScripCodeCandidates(symbol).filter((c) => c !== scrip).slice(0, 2);
      for (const alt of alts) {
        try {
          const chunk = await fetchIndstocksCandles(accessToken, alt, timeframe, bars);
          if (chunk.length > candles.length) candles = chunk;
          if (candles.length >= 20) break;
        } catch {
          /* next alt */
        }
      }
    }
    for (const c of candles) c.symbol = symbol;
    writeCandleCache(symbol, timeframe, bars, candles);
    result[symbol] = candles;
  }
  return result;
}

function cookieOpts() {
  const frontendHttps = String(process.env.FRONTEND_URL || '').startsWith('https://');
  const secure =
    process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' || frontendHttps;
  return {
    httpOnly: true,
    // Cross-origin (Vercel → API) needs None+Secure or the session never round-trips
    // and every /quote|/candles call looks disconnected → Wolf pages used to fall back to DEMO.
    sameSite: secure ? 'none' : 'lax',
    secure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function identityFrom(req, res) {
  const authUser = req.appUser?.id ? String(req.appUser.id) : '';
  let sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) sid = randomUUID();
  // Always refresh attrs so a leftover Lax cookie upgrades to None+Secure.
  res.cookie(SESSION_COOKIE, sid, cookieOpts());
  const userKey = authUser ? `user:${authUser}` : '';
  const sessionKey = `session:${sid}`;
  const keys = [...new Set([userKey, sessionKey].filter(Boolean))];
  return { primary: keys[0], userKey, sessionKey, keys };
}

/** Keep user:{id} and session cookie copies in sync. Never drop one on login. */
async function hydrateIdentity(ident) {
  const found = await resolveCredential(ident.keys);
  if (!found.record) return found;
  await reviveIndstocksIfBrokerStillLive(found);
  if (found.record.status !== 'CONNECTED') return found;
  if (ident.userKey && ident.sessionKey) {
    await adoptCredential(found.key, ident.userKey);
    await adoptCredential(found.key, ident.sessionKey);
  }
  return found;
}

/**
 * Wolf used to stamp a 24h clock on INDstocks tokens. That forced a reconnect
 * even when the broker token was still valid. Revive from EXPIRED if profile still works.
 */
async function reviveIndstocksIfBrokerStillLive(found) {
  const record = found?.record;
  if (!record || record.provider !== 'indstocks' || record.mode !== 'LIVE') return;
  const cred = readDecryptedCredential(found.key);
  const token = String(cred?.accessToken || '').trim();
  if (token.length < 12) return;
  const clockDead =
    record.status === 'EXPIRED' ||
    (record.expiresAt && record.expiresAt < Date.now());
  if (record.status === 'CONNECTED' && !clockDead) return;
  try {
    await validateIndstocksToken(token);
    record.status = 'CONNECTED';
    record.expiresAt = null;
    record.updatedAt = Date.now();
    await persistStoredCredential(found.key);
  } catch {
    /* broker still rejects — leave expired so the user can paste a new token */
  }
}

async function expireBrokerSession(req, res, liveKey, accessToken) {
  if (accessToken) {
    try {
      await validateIndstocksToken(accessToken);
      return;
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) return;
    }
  }
  const ident = identityFrom(req, res);
  const keys = [...new Set([liveKey, ...ident.keys].filter(Boolean))];
  await Promise.all(keys.map((k) => expireCredentialPersist(k)));
}

async function optionalLiveToken(req, res) {
  const ident = identityFrom(req, res);
  const found = await hydrateIdentity(ident);
  if (!found.record || found.record.status !== 'CONNECTED') return null;
  if (found.record.mode === 'DEMO' || found.record.provider === 'mock-demo') return null;
  const cred = readDecryptedCredential(found.key);
  return cred?.accessToken || null;
}

async function requireLiveToken(req, res) {
  const ident = identityFrom(req, res);
  const found = await hydrateIdentity(ident);
  const { key, record } = found;
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

router.get('/status', async (req, res) => {
  const ident = identityFrom(req, res);
  const found = await hydrateIdentity(ident);
  res.json(publicView(found.record));
});

router.post('/connect', async (req, res) => {
  const ident = identityFrom(req, res);
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
    const view = await storeCredentialOnKeys(ident.keys, {
      provider: DEMO_PROVIDER.id,
      credentialPayload: { kind: 'demo', v: 1 },
      expiresAt: null,
      capabilities: DEMO_PROVIDER.capabilities,
      mode: 'DEMO',
      status: 'CONNECTED',
      permissionNote: null,
    });
    console.log('[market-data] demo connected', { keyType: ident.primary.split(':')[0] });
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

    const view = await storeCredentialOnKeys(ident.keys, {
      provider: INDSTOCKS_PROVIDER.id,
      credentialPayload: { kind: 'indstocks', accessToken, v: 1 },
      expiresAt: null,
      capabilities: INDSTOCKS_CAPABILITIES,
      mode: 'LIVE',
      status: 'CONNECTED',
      permissionNote: INDSTOCKS_PERMISSION_NOTE,
    });
    console.log('[market-data] indstocks connected', { keyType: ident.primary.split(':')[0] });
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

router.post('/disconnect', async (req, res) => {
  const ident = identityFrom(req, res);
  await Promise.all(ident.keys.map((k) => deleteCredentialPersist(k)));
  console.log('[market-data] disconnected', { keyType: ident.primary.split(':')[0] });
  res.json(publicView(null));
});

router.get('/symbols', async (req, res) => {
  const token = await optionalLiveToken(req, res);
  if (token) await ensureInstrumentMap(token);
  const universe = String(req.query.universe || 'F&O');
  const mode = String(req.query.mode || '');
  const staticList = [
    ...new Set(
      resolveServerUniverse(universe)
        .map((s) => String(s || '').toUpperCase())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const catalog = listUniverseSymbols(universe);
  const scannable = listScannableUniverseSymbols(universe);
  const preferScannable = mode === 'scannable';
  const preferStatic = mode === 'static';
  const stats = getInstrumentUniverseStats();
  const fromLive = Boolean(stats.refreshedAt);
  res.json({
    symbols: preferStatic ? staticList : preferScannable ? scannable : catalog,
    catalog,
    scannable,
    static: staticList,
    universe,
    universeLoaded: preferStatic ? staticList.length : catalog.length,
    dataAvailable: preferStatic ? staticList.length : scannable.length,
    dataUnavailable: preferStatic ? 0 : Math.max(0, catalog.length - scannable.length),
    instrumentMaster: stats,
    source: preferStatic
      ? 'static-wolf-catalog'
      : fromLive
        ? 'indstocks-instrument-master'
        : 'static-catalog-fallback',
    note: preferStatic
      ? 'Fixed WOLF catalog — same names on every server instance and every login.'
      : fromLive
        ? 'Universe derived from connected INDstocks instrument master (equity / index / F&O CSVs). Scannable = resolvable scrips only.'
        : 'Static WOLF catalog fallback (connect INDstocks to load the full instrument master). Scannable = resolvable scrips only.',
  });
});

router.get('/universes', async (req, res) => {
  const token = await optionalLiveToken(req, res);
  if (token) await ensureInstrumentMap(token);
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

router.post('/quotes-batch', async (req, res) => {
  const live = await requireLiveToken(req, res);
  if (!live) return;
  const raw = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
  const symbols = [...new Set(raw.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(0, 80);
  if (!symbols.length) return res.status(400).json({ error: 'symbols required' });
  try {
    const pairs = [];
    for (const symbol of symbols) {
      const candidates = await resolveCandidates(live.accessToken, symbol);
      if (candidates[0]) pairs.push([symbol, candidates[0]]);
    }
    const byScrip = await fetchIndstocksQuotesMany(
      live.accessToken,
      pairs.map(([, scrip]) => scrip),
    );
    const quotes = [];
    for (const [symbol, scrip] of pairs) {
      const row = byScrip.get(scrip);
      if (!row || !(row.price > 0)) continue;
      quotes.push({
        ...row,
        symbol,
        scrip,
      });
    }
    res.json({
      quotes,
      mode: 'LIVE',
      source: 'indstocks',
      orderExecution: false,
    });
  } catch (e) {
    const status = e?.status === 401 ? 401 : 502;
    if (status === 401) await expireBrokerSession(req, res, live.key, live.accessToken);
    res.status(status).json({
      error: status === 401
        ? 'Market data connection expired. Reconnect your broker.'
        : 'Failed to fetch quotes',
    });
  }
});

router.get('/quote', async (req, res) => {
  const live = await requireLiveToken(req, res);
  if (!live) return;
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const candidates = await resolveCandidates(live.accessToken, symbol);
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
    if (status === 401) await expireBrokerSession(req, res, live.key, live.accessToken);
    res.status(status).json({
      error: status === 401
        ? 'Market data connection expired. Reconnect your broker.'
        : 'Failed to fetch quote',
    });
  }
});

router.get('/candles', async (req, res) => {
  const live = await requireLiveToken(req, res);
  if (!live) return;
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const timeframe = String(req.query.timeframe || '5m').trim();
  const bars = Math.min(3200, Math.max(10, Number(req.query.bars) || 80));
  const beforeRaw = Number(req.query.before);
  const beforeMs = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;
  const skipCache = String(req.query.fresh || '') === '1' || String(req.query.fresh || '') === 'true';
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const { candles, scrip } = await loadLiveCandles(
      live.accessToken,
      symbol,
      timeframe,
      bars,
      beforeMs,
      skipCache,
    );
    res.json({
      symbol,
      timeframe,
      candles,
      scrip,
      mode: 'LIVE',
      source: 'indstocks',
      orderExecution: false,
    });
  } catch (e) {
    const status = e?.status === 401 ? 401 : e?.status === 404 ? 404 : 502;
    if (status === 401) await expireBrokerSession(req, res, live.key, live.accessToken);
    res.status(status).json({
      error: status === 401
        ? 'Market data connection expired. Reconnect your broker.'
        : e?.status === 404
          ? e.message
          : 'Failed to fetch candles',
    });
  }
});

router.post('/candles-batch', async (req, res) => {
  const live = await requireLiveToken(req, res);
  if (!live) return;
  const timeframe = String(req.body?.timeframe || '15m').trim();
  const bars = Math.min(500, Math.max(20, Number(req.body?.bars) || 80));
  const raw = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
  const symbols = [...new Set(raw.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(0, 80);
  const skipCache = Boolean(req.body?.fresh);
  if (!symbols.length) return res.status(400).json({ error: 'symbols required' });
  try {
    const candlesBySymbol = await loadLiveCandlesMany(
      live.accessToken,
      symbols,
      timeframe,
      bars,
      skipCache,
    );
    res.json({
      timeframe,
      bars,
      candlesBySymbol,
      mode: 'LIVE',
      source: 'indstocks',
      orderExecution: false,
    });
  } catch (e) {
    const status = e?.status === 401 ? 401 : 502;
    if (status === 401) await expireBrokerSession(req, res, live.key, live.accessToken);
    res.status(status).json({
      error: status === 401
        ? 'Market data connection expired. Reconnect your broker.'
        : 'Failed to fetch candle batch',
    });
  }
});

/** Shared Opportunity candle map — same names for every login in this bar. */
router.get('/opportunity-snapshot', async (req, res) => {
  const live = await requireLiveToken(req, res);
  if (!live) return;
  const universe = String(req.query.universe || 'F&O');
  const timeframe = String(req.query.timeframe || '5m');
  try {
    const payload = peekOpportunitySnapshot(live.accessToken, universe, timeframe);
    res.json({
      ...payload,
      mode: 'LIVE',
      orderExecution: false,
    });
  } catch (e) {
    const status = e?.status === 401 ? 401 : 502;
    if (status === 401) await expireBrokerSession(req, res, live.key, live.accessToken);
    res.status(status).json({
      error:
        status === 401
          ? 'Market data connection expired. Reconnect your broker.'
          : 'Failed to load shared opportunity board',
    });
  }
});

/** Shared IST-day Opportunity list — same names/times for every login. */
router.get('/opportunity-board', async (req, res) => {
  const live = await requireLiveToken(req, res);
  if (!live) return;
  const universe = String(req.query.universe || 'F&O');
  const timeframe = String(req.query.timeframe || '5m');
  res.json({
    ...(await peekOpportunityDayBoard(universe, timeframe)),
    mode: 'LIVE',
    orderExecution: false,
  });
});

router.post('/opportunity-board', async (req, res) => {
  const live = await requireLiveToken(req, res);
  if (!live) return;
  const universe = String(req.body?.universe || req.query.universe || 'F&O');
  const timeframe = String(req.body?.timeframe || req.query.timeframe || '5m');
  const cards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  const cacheKey = String(req.body?.cacheKey || '');
  res.json({
    ...(await mergeOpportunityDayBoard(universe, timeframe, cards, cacheKey)),
    mode: 'LIVE',
    orderExecution: false,
  });
});

router.post('/radar/scan', (_req, res) => {
  res.status(501).json({
    error: 'Server-side radar job coming later. Use client scanner with connected LIVE provider.',
    orderExecution: false,
  });
});

export default router;
