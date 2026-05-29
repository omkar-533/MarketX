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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-OpenRouter-Key'],
  });
}
