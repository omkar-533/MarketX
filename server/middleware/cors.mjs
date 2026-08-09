import cors from 'cors';
import { getServerConfig } from '../config/env.mjs';

function isAllowedOrigin(origin, corsOrigins, isProd) {
  if (!origin) return true;
  if (corsOrigins.includes(origin) || corsOrigins.includes('*')) return true;
  // Local Vite (hostname or 127.0.0.1) — always allow so REST works in dev.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (!isProd) return /localhost|127\.0\.0\.1/.test(origin);
  // Production frontends for this app (+ Vercel preview deploys).
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === 'wolftradeai.in' || host.endsWith('.wolftradeai.in')) return true;
    if (host === 'mmtt-flame.vercel.app' || host.endsWith('.vercel.app')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function createCorsMiddleware() {
  const { corsOrigins, isProd } = getServerConfig();

  return cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin, corsOrigins, isProd)) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    // PATCH is required for admin indicator/user updates from the Vercel frontend.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-OpenRouter-Key',
      'X-Gemini-Key',
      'X-Master-Ai-Key',
      'X-Master-Ai-Key',
      'X-Admin-Email',
      'X-Admin-Password',
    ],
  });
}
