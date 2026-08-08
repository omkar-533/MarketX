/**
 * Market API stubs — TradingView / NSE / Kite live stack deleted.
 * Endpoints remain so old clients get explicit "removed" responses (not 404).
 */
import { Router } from 'express';

const router = Router();
const disabled = () => ({
  source: 'removed',
  fetchedAt: new Date().toISOString(),
});

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: 'disabled',
    configured: false,
    websocket: false,
    wsStatus: 'removed',
    wsLastTickAt: null,
    wsReconnectAttempt: 0,
    liveDisabled: true,
    upstream: 'removed',
    kiteConfigured: false,
    optionChain: 'none',
    kite: { configured: false, loginReady: false, upstream: 'removed' },
  });
});

router.get('/ws-status', (_req, res) => {
  res.json({
    status: 'removed',
    connected: false,
    hasTicks: false,
    lastTickAt: null,
    reconnectAttempt: 0,
    upstream: 'removed',
  });
});

router.get('/quotes', (req, res) => {
  const raw = String(req.query.symbols || '').trim();
  const symbols = raw
    ? raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 200)
    : [];
  res.json({
    quotes: [],
    errors: symbols.map((symbol) => ({ symbol, error: 'market data removed' })),
    ...disabled(),
  });
});

router.get('/ohlc', (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase() || 'UNKNOWN';
  const interval = String(req.query.interval || '15m').trim();
  res.json({
    symbol,
    timeframe: interval,
    bars: [],
    ...disabled(),
  });
});

router.get('/ticks', (req, res) => {
  const raw = String(req.query.symbols || '').trim();
  const symbols = raw
    ? raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [];
  res.json({
    quotes: [],
    errors: symbols.map((symbol) => ({ symbol, error: 'market data removed' })),
    ...disabled(),
  });
});

router.get('/stream', (_req, res) => {
  res.status(410).json({ error: 'market stream removed' });
});

router.get('/option-chain', (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  res.json({
    symbol: symbol || null,
    rows: [],
    error: 'option chain removed',
    ...disabled(),
  });
});

router.get('/fno-oi', (_req, res) => {
  res.json({ snapshots: [], ...disabled() });
});

router.get('/fii-dii', (_req, res) => {
  res.json({ rows: [], ...disabled() });
});

router.get('/global-quotes', (_req, res) => {
  res.json({ indices: [], ...disabled() });
});

router.get('/fno-history', (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  res.json({ symbol: symbol || null, rows: [], ...disabled() });
});

router.get('/kite/login-url', (_req, res) => {
  res.status(410).json({ error: 'Kite integration removed', configured: false, loginReady: false });
});

router.get('/kite/callback', (_req, res) => {
  res.status(410).send('Kite integration removed');
});

router.get('/kite/status', (_req, res) => {
  res.json({ configured: false, loginReady: false, removed: true });
});

export default router;
