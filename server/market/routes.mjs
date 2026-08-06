import { Router } from 'express';
import { fetchGlobalIndexQuotes } from './globalQuotes.mjs';
import { fetchOhlc, fetchQuotes, getMarketHealth } from './provider.mjs';
import { registerLiveStreamRoutes } from './liveStream.mjs';
import { getTvWsStatus } from './tradingview/tvWsManager.mjs';

const router = Router();
registerLiveStreamRoutes(router);

const UNAVAILABLE =
  'TradingView feed does not provide option chain / FII-DII — this endpoint is unavailable';

router.get('/health', (_req, res) => {
  const health = getMarketHealth();
  const ws = getTvWsStatus();
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
  res.json(getTvWsStatus());
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

router.get('/option-chain', (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  return res.status(503).json({
    error: UNAVAILABLE,
    symbol,
    rows: [],
  });
});

router.get('/fno-oi', (_req, res) => {
  return res.status(503).json({ error: UNAVAILABLE, snapshots: [] });
});

router.get('/fii-dii', (_req, res) => {
  return res.status(503).json({ error: UNAVAILABLE, rows: [] });
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

router.get('/fno-history', (_req, res) => {
  return res.status(503).json({ error: UNAVAILABLE });
});

export default router;
