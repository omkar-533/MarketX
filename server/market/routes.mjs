import { Router } from 'express';
import { fetchFyersFnoHistory } from './fyersFnoHistory.mjs';
import { fetchOptionChain } from './optionChainProvider.mjs';
import { fetchFyersFnoOiBatch } from './fyersFnoOi.mjs';
import { isFyersOptionChainAvailable } from './fyersOptionChain.mjs';
import { fetchGlobalIndexQuotes } from './globalQuotes.mjs';
import { fetchFyersFiiDii } from './fyersFiiDii.mjs';
import { fetchOhlc, fetchQuotes, getMarketHealth } from './provider.mjs';
import { registerLiveStreamRoutes } from './liveStream.mjs';
import { getFyersWsStatus } from './fyersWsManager.mjs';

const router = Router();
registerLiveStreamRoutes(router);

router.get('/health', (_req, res) => {
  const health = getMarketHealth();
  const ws = getFyersWsStatus();
  res.json({
    status: 'ok',
    ...health,
    websocket: ws.connected || health.websocket,
    wsStatus: ws.status,
    wsLastTickAt: ws.lastTickAt || null,
    wsReconnectAttempt: ws.reconnectAttempt,
  });
});

router.get('/ws-status', (_req, res) => {
  res.json(getFyersWsStatus());
});

router.get('/quotes', async (req, res) => {
  const raw = String(req.query.symbols || '').trim();
  if (!raw) {
    return res.status(400).json({ error: 'symbols query required (comma-separated)' });
  }
  const symbols = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 200);
  try {
    const data = await fetchQuotes(symbols);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Market fetch failed';
    return res.status(502).json({ error: msg });
  }
});

router.get('/ohlc', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const interval = String(req.query.interval || '15m').trim();
  const range = String(req.query.range || '').trim() || undefined;
  if (!symbol) {
    return res.status(400).json({ error: 'symbol query required' });
  }
  try {
    const data = await fetchOhlc(symbol, interval, range);
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
    return res.status(400).json({ error: 'symbol query required' });
  }
  try {
    const data = await fetchOptionChain(symbol, expiry);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Option chain fetch failed';
    return res.status(502).json({ error: msg, symbol, rows: [] });
  }
});

router.get('/fno-oi', async (req, res) => {
  const raw = String(req.query.symbols || '').trim();
  if (!raw) {
    return res.status(400).json({ error: 'symbols query required (comma-separated)' });
  }
  const symbols = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 40);
  if (!isFyersOptionChainAvailable()) {
    return res.status(503).json({ error: 'Fyers not connected', snapshots: [] });
  }
  try {
    const data = await fetchFyersFnoOiBatch(symbols);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FNO OI fetch failed';
    return res.status(502).json({ error: msg, snapshots: [] });
  }
});

router.get('/fii-dii', async (req, res) => {
  const days = Math.min(60, Number(req.query.days) || 30);
  try {
    const data = await fetchFyersFiiDii(days);
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
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (!symbol) {
    return res.status(400).json({ error: 'symbol query required' });
  }
  try {
    const data = await fetchFyersFnoHistory(symbol, from, to);
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FNO history failed';
    return res.status(502).json({ error: msg });
  }
});

export default router;
