/**
 * Optional app-invite JWT → stable user key for market-data isolation.
 */
import jwt from 'jsonwebtoken';

function jwtSecret() {
  return (
    process.env.APP_AUTH_JWT_SECRET ||
    process.env.JWT_SECRET ||
    'wolf-trade-dev-jwt-change-me'
  );
}

export function attachOptionalAppUser(req, _res, next) {
  try {
    const hdr = String(req.headers.authorization || '');
    const m = hdr.match(/^Bearer\s+(.+)$/i);
    if (m) {
      const payload = jwt.verify(m[1], jwtSecret());
      if (payload?.typ === 'app-invite' && (payload.sub || payload.id || payload.email)) {
        req.appUser = {
          id: String(payload.sub || payload.id || payload.email),
          email: payload.email ? String(payload.email) : null,
        };
      }
    }
  } catch {
    // ignore invalid — fall back to session cookie
  }
  next();
}
