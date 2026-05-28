import jwt from 'jsonwebtoken';
import { getServerConfig } from '../config/env.mjs';

const COOKIE_NAME = 'broker_session';

export function getBrokerCookieName() {
  return COOKIE_NAME;
}

function secret() {
  const { jwtSecret, isProd } = getServerConfig();
  if (!jwtSecret && isProd) {
    throw new Error('JWT_SECRET required in production');
  }
  return jwtSecret || 'dev-broker-session-change-in-production';
}

export function createBrokerSessionToken() {
  return jwt.sign(
    { broker: 'fyers', scope: 'market_data', v: 1 },
    secret(),
    { expiresIn: '30d' },
  );
}

export function verifyBrokerSessionToken(token) {
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}

export function setBrokerSessionCookie(res) {
  const { cookieSecure, cookieSameSite, isProd } = getServerConfig();
  const token = createBrokerSessionToken();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
    ...(isProd ? {} : {}),
  });
  return token;
}

export function clearBrokerSessionCookie(res) {
  const { cookieSecure, cookieSameSite } = getServerConfig();
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: '/',
  });
}

export function readBrokerSession(req) {
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) return null;
  return verifyBrokerSessionToken(raw);
}
