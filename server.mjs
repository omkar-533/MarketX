import cors from 'cors';
import express from 'express';
import http from 'http';
import { getOpenRouterApiKey, loadServerEnv } from './server/loadEnv.mjs';
import marketRoutes from './server/market/routes.mjs';
import { initMarketProvider } from './server/market/provider.mjs';
import { attachMarketWebSocket } from './server/market/liveWebSocket.mjs';
import { attachSocketIo } from './server/market/socketIoServer.mjs';
import fyersRoutes from './server/fyers/routes.mjs';
import { createMasterAiRouter, MASTER_AI_MODELS } from './server/masterAi.mjs';

loadServerEnv();
const marketProvider = initMarketProvider();

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use('/api/market', marketRoutes);
app.use('/api/fyers', fyersRoutes);

const apiKey = getOpenRouterApiKey();
const masterAi = createMasterAiRouter(apiKey);

if (!apiKey) {
  console.warn(
    '[Master AI] OPENROUTER_API_KEY missing — add to .env.local: OPENROUTER_API_KEY=sk-or-... then restart npm run server',
  );
} else {
  console.log('[Master AI] OpenRouter API key loaded ✓');
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/chat/status', (_req, res) => {
  res.json({
    configured: masterAi.isConfigured,
    message: masterAi.isConfigured
      ? 'Master AI ready'
      : 'Add OPENROUTER_API_KEY to .env.local and restart npm run server',
    models: MASTER_AI_MODELS.length,
  });
});

app.get('/api/chat/models', (_req, res) => {
  res.json({ models: MASTER_AI_MODELS });
});

app.post('/api/chat', async (req, res) => {
  try {
    const result = await masterAi.chat(req.body);
    return res.json(result);
  } catch (error) {
    const status = error?.status ?? 500;
    const message = error instanceof Error ? error.message : 'AI service error';
    if (status >= 500) console.error('[Master AI]', message);
    return res.status(status).json({ error: message });
  }
});

const httpServer = http.createServer(app);

httpServer.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`\n[Server] Port ${port} is already in use.`);
    console.error('  Fix: stop other terminals, then run: npm run dev:all\n');
  } else {
    console.error('[Server]', err);
  }
  process.exit(1);
});

httpServer.listen(port, () => {
  attachMarketWebSocket(httpServer);
  attachSocketIo(httpServer);
  console.log(`Master TradeX API running on http://localhost:${port}`);
  console.log(`  Market (${marketProvider}): Socket.IO /socket.io · WS /api/market/ws`);
  console.log(`  Fyers: GET /api/fyers/status · /api/fyers/login-url`);
  console.log(`  Master AI: POST /api/chat (OpenRouter — ${MASTER_AI_MODELS.length} models)`);
});
