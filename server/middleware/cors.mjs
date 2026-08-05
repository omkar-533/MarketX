import cors from 'cors';
import { getServerConfig } from '../config/env.mjs';

export function createCorsMiddleware() {
  const { corsOrigins, isProd } = getServerConfig();

  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!isProd && /localhost|127\.0\.0\.1/.test(origin)) {
        return callback(null, true);
      }
      if (corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    // PATCH is required for admin indicator/user updates from the Vercel frontend.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-OpenRouter-Key',
      'X-Admin-Email',
      'X-Admin-Password',
    ],
  });
}
