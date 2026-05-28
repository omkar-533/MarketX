import cookieParser from 'cookie-parser';
import express from 'express';
import http from 'http';
import { getOpenRouterApiKey, loadServerEnv } from './server/loadEnv.mjs';
import { getServerConfig } from './server/config/env.mjs';
import { createCorsMiddleware } from './server/middleware/cors.mjs';
import marketRoutes from './server/market/routes.mjs';
import { initMarketProvider } from './server/market/provider.mjs';
import { bootFyersAutoConnect, startFyersAutoConnectWatch } from './server/market/fyersAutoConnect.mjs';
import { attachMarketWebSocket } from './server/market/liveWebSocket.mjs';
import { attachSocketIo } from './server/market/socketIoServer.mjs';
import fyersRoutes from './server/fyers/routes.mjs';
import fyersAuthRoutes from './server/auth/fyersAuthRoutes.mjs';
import { createMasterAiRouter, MASTER_AI_MODELS } from './server/masterAi.mjs';

loadServerEnv();
const config = getServerConfig();
const marketProvider = initMarketProvider();

const app = express();
if (config.isProd) {
  app.set('trust proxy', 1);
}

app.use(createCorsMiddleware());
app.use(cookieParser());
app.use(express.json({ limit: '12mb' }));
app.use('/api/market', marketRoutes);
app.use('/api/fyers', fyersRoutes);
app.use('/api/auth', fyersAuthRoutes);

const apiKey = getOpenRouterApiKey();
const masterAi = createMasterAiRouter(apiKey);

if (!apiKey) {
  console.warn('[Master AI] OPENROUTER_API_KEY missing');
} else {
  console.log('[Master AI] OpenRouter API key loaded ✓');
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv });
});

app.get('/api/chat/status', (_req, res) => {
  res.json({
    configured: masterAi.isConfigured,
    message: masterAi.isConfigured ? 'Master AI ready' : 'Add OPENROUTER_API_KEY',
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
    console.error(`\n[Server] Port ${config.port} is already in use.\n`);
  } else {
    console.error('[Server]', err);
  }
  process.exit(1);
});

httpServer.listen(config.port, () => {
  attachMarketWebSocket(httpServer);
  attachSocketIo(httpServer);
  startFyersAutoConnectWatch();
  void bootFyersAutoConnect();
  console.log(`Master TradeX API on port ${config.port} (${config.nodeEnv})`);
  console.log(`  Frontend: ${config.frontendUrl}`);
  console.log(`  Fyers redirect: ${config.fyersRedirect}`);
  console.log(`  Auth: GET /api/auth/fyers/login · GET /api/auth/session`);
  console.log(`  Market: Socket.IO /socket.io (${marketProvider})`);
});
