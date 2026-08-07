import { Router } from 'express';
import { fetchGlobalIndexQuotes } from './globalQuotes.mjs';
import { fetchOhlc, fetchQuotes, getMarketHealth } from './provider.mjs';
import { registerLiveStreamRoutes } from './liveStream.mjs';
import {
  getLiveTickSnapshot,
  getLiveWsStatus,
  subscribeLiveSymbols,
} from './liveFeed.mjs';
import { fetchOptionChain, isOptionChainAvailable } from './optionChainProvider.mjs';
import { fetchNseFiiDii } from './nseFiiDii.mjs';
import { fetchNseFnoHistory } from './nseFnoProvider.mjs';
import { fetchNseFnoOiBatch } from './nseFnoOi.mjs';
import { getServerConfig } from '../config/env.mjs';
import { isKiteConfigured, isKiteLoginReady } from './kite/kiteConfig.mjs';
import { buildKiteLoginUrl, exchangeKiteRequestToken } from './kite/kiteAuth.mjs';
import { getCachedOptionChain } from './optionChainHub.mjs';

const router = Router();
registerLiveStreamRoutes(router);

router.get('/health', (_req, res) => {
  const health = getMarketHealth();
  const ws = getLiveWsStatus();
  res.json({
    status: 'ok',
    ...health,
    websocket: ws.connected || health.websocket,
    wsStatus: ws.status,
    wsLastTickAt: ws.lastTickAt || null,
    wsReconnectAttempt: ws.reconnectAttempt,
    kite: {
      configured: isKiteConfigured(),
      loginReady: isKiteLoginReady(),
      upstream: ws.upstream,
    },
    optionChain: isOptionChainAvailable() ? 'nse' : 'none',
  });
});

router.get('/ws-status', (_req, res) => {
  res.json(getLiveWsStatus());
});

router.get('/quotes', async (req, res) => {
  const raw = String(req.query.symbols || '').trim();
  if (!raw) {
    return res.status(400).json({ error: 'symbols query required (comma-separated)' });
  }
  const symbols = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 200);
  try {
    // Instant path: serve warm live-tape ticks, then fill only missing via TV/OHLC.
    // Full wait-for-all + many OHLC fallbacks used to take 30s+ and blow client timeouts.
    void subscribeLiveSymbols(symbols);
    const snap = getLiveTickSnapshot(symbols) || [];
    const have = new Set(snap.map((q) => String(q.symbol || '').toUpperCase()));
    const missing = symbols.filter((s) => !have.has(s));
    if (!missing.length) {
      return res.json({
        quotes: snap,
        errors: [],
        source: 'live-snapshot',
        fetchedAt: new Date().toISOString(),
      });
    }
    const rest = await fetchQuotes(missing.length === symbols.length ? symbols : missing, {
      fast: missing.length < symbols.length || symbols.length > 12,
    });
    const bySym = new Map();
    for (const q of snap) {
      if (q?.symbol) bySym.set(String(q.symbol).toUpperCase(), q);
    }
    for (const q of rest?.quotes || []) {
      if (q?.symbol) bySym.set(String(q.symbol).toUpperCase(), q);
    }
    return res.json({
      quotes: [...bySym.values()],
      errors: rest?.errors || [],
      source: snap.length ? `live+${rest?.source || 'tv'}` : rest?.source || 'tradingview',
      fetchedAt: rest?.fetchedAt || new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Market fetch failed';
    return res.status(502).json({ error: msg });
  }
});

router.get('/ohlc', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const interval = String(req.query.interval || '15m').trim();
  const range = String(req.query.range || '').trim() || undefined;
  const barsRaw = Number(req.query.bars);
  const bars = Number.isFinite(barsRaw) && barsRaw > 0 ? Math.min(8000, Math.floor(barsRaw)) : undefined;
  if (!symbol) {
    return res.status(400).json({ error: 'symbol query required' });
  }
  try {
    const data = await fetchOhlc(symbol, interval, range, bars ? { bars } : undefined);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OHLC fetch failed';
    return res.status(502).json({ error: msg });
  }
});

router.get('/option-chain', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const expiry = String(req.query.expiry || '').trim() || undefined;
  if (!symbol) {
    return res.status(400).json({ error: 'symbol query required', rows: [] });
  }
  try {
    const cached = getCachedOptionChain(symbol, expiry);
    if (cached?.rows?.length) {
      return res.json(cached);
    }
    const data = await fetchOptionChain(symbol, expiry);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Option chain fetch failed';
    return res.status(502).json({ error: msg, symbol, rows: [], source: 'nse' });
  }
});

router.get('/fno-oi', async (req, res) => {
  const raw = String(req.query.symbols || '').trim();
  const symbols = raw
    ? raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [];
  if (!symbols.length) {
    return res.status(400).json({ error: 'symbols query required', snapshots: [] });
  }
  try {
    const data = await fetchNseFnoOiBatch(symbols);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FNO OI failed';
    return res.status(502).json({ error: msg, snapshots: [] });
  }
});

router.get('/fii-dii', async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  try {
    const data = await fetchNseFiiDii(days);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FII/DII fetch failed';
    return res.status(502).json({ error: msg, rows: [] });
  }
});

router.get('/global-quotes', async (_req, res) => {
  try {
    const data = await fetchGlobalIndexQuotes();
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Global quotes failed';
    return res.status(502).json({ error: msg, indices: [] });
  }
});

router.get('/fno-history', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const from = String(req.query.from || '').trim() || undefined;
  const to = String(req.query.to || '').trim() || undefined;
  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }
  try {
    const data = await fetchNseFnoHistory(symbol, from, to);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FNO history failed';
    return res.status(502).json({ error: msg });
  }
});

/** Kite OAuth — login URL (needs API key+secret) */
router.get('/kite/login-url', (_req, res) => {
  try {
    const config = getServerConfig();
    const url = buildKiteLoginUrl(config);
    return res.json({ url, redirectHint: process.env.KITE_REDIRECT_URL || null });
  } catch (err) {
    return res.status(503).json({
      error: err instanceof Error ? err.message : 'Kite login unavailable',
      loginReady: isKiteLoginReady(),
      configured: isKiteConfigured(),
    });
  }
});

/** Kite OAuth callback — exchange request_token → access_token (runtime) */
router.get('/kite/callback', async (req, res) => {
  const requestToken = String(req.query.request_token || '').trim();
  const status = String(req.query.status || '');
  if (status && status !== 'success') {
    return res.status(400).send(`Kite login ${status}`);
  }
  try {
    const session = await exchangeKiteRequestToken(requestToken);
    const frontend = getServerConfig().frontendUrl;
    const html = `<!doctype html><html><body style="font-family:system-ui;padding:2rem;background:#0b0f14;color:#e8eef7">
      <h1>Kite connected</h1>
      <p>User: ${session.user_name || session.user_id || 'ok'}</p>
      <p>Token set for this server process. For production, also set <code>KITE_ACCESS_TOKEN</code> in env (daily refresh).</p>
      <p><a href="${frontend}" style="color:#6cf">Back to app</a></p>
      <script>setTimeout(()=>location.href=${JSON.stringify(frontend)},2500)</script>
    </body></html>`;
    res.type('html').send(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Kite callback failed';
    res.status(502).send(`Kite auth failed: ${msg}`);
  }
});

router.get('/kite/status', (_req, res) => {
  res.json({
    configured: isKiteConfigured(),
    loginReady: isKiteLoginReady(),
    ws: getLiveWsStatus(),
  });
});

export default router;
