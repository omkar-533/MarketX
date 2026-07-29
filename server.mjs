import cookieParser from 'cookie-parser';
import express from 'express';
import { existsSync } from 'fs';
import http from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getMasterAiApiKey, getOpenRouterApiKey, loadServerEnv } from './server/loadEnv.mjs';
import { resolveOpenRouterKey } from './server/utils/openRouterKey.mjs';
import { getServerConfig } from './server/config/env.mjs';
import { createCorsMiddleware } from './server/middleware/cors.mjs';
import marketRoutes from './server/market/routes.mjs';
import { initMarketProvider } from './server/market/provider.mjs';
import { bootFyersAutoConnect, startFyersAutoConnectWatch } from './server/market/fyersAutoConnect.mjs';
import { attachMarketWebSocket } from './server/market/liveWebSocket.mjs';
import { attachSocketIo } from './server/market/socketIoServer.mjs';
import fyersRoutes from './server/fyers/routes.mjs';
import fyersAuthRoutes from './server/auth/fyersAuthRoutes.mjs';
import appAuthRoutes from './server/auth/appAuthRoutes.mjs';
import {
  hasAccessSchema,
  isCloudUserStore,
  migrateFileUsersToCloud,
} from './server/auth/appUserStore.mjs';
import { createMasterAiRouter, MASTER_AI_MODELS, GEMINI_COST_MODE } from './server/masterAi.mjs';
import { ensureSeedTeachings } from './server/auth/masterAiKnowledgeStore.mjs';
import { getFyersWsStatus } from './server/market/fyersWsManager.mjs';
import { getFyersAccessToken, isFyersConfigured } from './server/market/fyersSession.mjs';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)));

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
app.use('/api/app-auth', appAuthRoutes);

const envOpenRouterKey = getMasterAiApiKey() || getOpenRouterApiKey();

if (!envOpenRouterKey) {
  console.warn('[Analyse AI] No GEMINI_API_KEY / OPENAI / OPENROUTER — users can add key in Profile');
} else {
  console.log('[Analyse AI] API key loaded from env ✓');
}

app.get('/api/health', (_req, res) => {
  const ws = getFyersWsStatus();
  res.json({
    status: 'ok',
    env: config.nodeEnv,
    live: {
      fyersConfigured: isFyersConfigured(),
      hasToken: Boolean(getFyersAccessToken()),
      wsStatus: ws.status,
      wsConnected: ws.connected,
    },
  });
});

function attachProductionFrontend(app) {
  if (!config.isProd) return;
  const distDir = resolve(serverRoot, 'dist');
  const indexHtml = resolve(distDir, 'index.html');
  if (!existsSync(indexHtml)) {
    console.warn('[Server] dist/index.html missing — API only (run npm run build for full site)');
    return;
  }
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(indexHtml, (err) => (err ? next(err) : undefined));
  });
  console.log('[Server] Serving frontend from dist/');
}

attachProductionFrontend(app);

app.get('/api/chat/status', (req, res) => {
  const key = resolveOpenRouterKey(req);
  const ai = createMasterAiRouter(key);
  res.json({
    configured: ai.isConfigured,
    message: ai.isConfigured
      ? `Analyse AI ready (${ai.provider || 'ok'})`
      : 'Add Gemini API key (aistudio.google.com) or OpenAI / OpenRouter key in Profile',
    models: MASTER_AI_MODELS.length,
    provider: ai.provider || null,
    keySource: key ? (key === envOpenRouterKey ? 'server' : 'profile') : 'none',
    costMode: GEMINI_COST_MODE,
  });
});

app.get('/api/chat/models', (_req, res) => {
  res.json({ models: MASTER_AI_MODELS });
});

app.post('/api/chat', async (req, res) => {
  const key = resolveOpenRouterKey(req);
  const masterAi = createMasterAiRouter(key);
  try {
    const result = await masterAi.chat(req.body);
    return res.json(result);
  } catch (error) {
    const status = error?.status ?? 500;
    const message = error instanceof Error ? error.message : 'AI service error';
    if (status >= 500) console.error('[Analyse AI]', message);
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
  void ensureSeedTeachings()
    .then((r) => console.log(`[Jarvis Teach] seed imported=${r.imported} total=${r.total}`))
    .catch((err) => console.warn('[Jarvis Teach] seed import failed:', err?.message || err));
  console.log(`Wolf Trade AI API on port ${config.port} (${config.nodeEnv})`);
  console.log(`  Frontend: ${config.frontendUrl}`);
  console.log(`  Fyers redirect: ${config.fyersRedirect}`);
  console.log(`  Auth: GET /api/auth/fyers/login · GET /api/auth/session`);
  console.log(`  Market: Socket.IO /socket.io (${marketProvider})`);

  if (!isCloudUserStore()) {
    console.log('  Logins: local file store — set SUPABASE_SERVICE_ROLE_KEY to persist in Supabase');
    return;
  }
  migrateFileUsersToCloud()
    .then(({ migrated }) => {
      console.log(
        `  Logins: Supabase app_users${migrated ? ` — lifted ${migrated} local login(s)` : ''}`,
      );
    })
    .catch((err) => console.warn('  Logins: Supabase store error —', err.message));

  hasAccessSchema()
    .then((ready) => {
      if (!ready) {
        console.warn('  Access: run supabase/app_access.sql — trial/OTP columns are missing');
      }
    })
    .catch(() => undefined);
});
