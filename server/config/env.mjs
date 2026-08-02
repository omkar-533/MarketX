/**
 * Central server configuration — dev + production (Render/Vercel split).
 */
export function getServerConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const port = Number(process.env.PORT || 5000);

  const frontendUrl =
    process.env.FRONTEND_URL?.trim() ||
    process.env.VITE_DEV_URL?.trim() ||
    'http://localhost:5173';

  const apiPublicUrl =
    process.env.API_PUBLIC_URL?.trim() ||
    (isProd ? '' : `http://127.0.0.1:${port}`);

  const corsOrigins = (process.env.CORS_ORIGINS || frontendUrl)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    isProd,
    port,
    frontendUrl: frontendUrl.replace(/\/$/, ''),
    apiPublicUrl,
    jwtSecret:
      process.env.JWT_SECRET?.trim() ||
      (isProd ? '' : 'dev-broker-session-change-in-production'),
    corsOrigins,
    cookieSecure: isProd || process.env.COOKIE_SECURE === 'true',
    cookieSameSite: isProd ? 'none' : 'lax',
    marketProvider: process.env.MARKET_PROVIDER?.trim() || 'tradingview',
  };
}
