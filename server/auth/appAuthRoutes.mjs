import { Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  authenticateAppUser,
  createAppUser,
  deleteAppUser,
  listAppUsers,
  setAppUserActive,
} from './appUserStore.mjs';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'omkarchauhan533@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Omkar@12345';
const JWT_SECRET =
  process.env.APP_AUTH_JWT_SECRET ||
  process.env.JWT_SECRET ||
  'apmi-invite-auth-change-me-in-production';

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 3);

function signAppToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      name: user.name,
      trialEndsAt: user.trialEndsAt ?? null,
      typ: 'app-invite',
    },
    JWT_SECRET,
    { expiresIn: '30d' },
  );
}

function verifyAppToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.typ !== 'app-invite') return null;
    return payload;
  } catch {
    return null;
  }
}

function isAdminPair(email, password) {
  return (
    String(email || '').trim().toLowerCase() === ADMIN_EMAIL &&
    String(password || '') === ADMIN_PASSWORD
  );
}

function failed(res, err, fallback) {
  const status = err?.status || 500;
  return res.status(status).json({ error: err instanceof Error ? err.message : fallback });
}

/** Admin gate: local admin credentials OR invite JWT with role=admin */
function requireAdmin(req, res, next) {
  const headerEmail = String(req.headers['x-admin-email'] || '').trim().toLowerCase();
  const headerPassword = String(req.headers['x-admin-password'] || '');
  if (isAdminPair(headerEmail, headerPassword)) {
    req.adminActor = headerEmail;
    return next();
  }

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const payload = token ? verifyAppToken(token) : null;
  if (payload?.role === 'admin') {
    req.adminActor = payload.email;
    return next();
  }

  return res.status(401).json({ error: 'Admin access required' });
}

const router = Router();

/** POST /api/app-auth/login — invite users + local admin */
router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  if (isAdminPair(email, password)) {
    const user = {
      id: 'admin_local_omkar',
      name: 'Omkar Chauhan',
      email: ADMIN_EMAIL,
      role: 'admin',
      plan: 'premium',
      verified: true,
      active: true,
      createdAt: new Date().toISOString(),
    };
    return res.json({ token: signAppToken(user), user, source: 'admin' });
  }

  try {
    const user = await authenticateAppUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    return res.json({ token: signAppToken(user), user, source: 'invite' });
  } catch (err) {
    return failed(res, err, 'Login failed');
  }
});

/** POST /api/app-auth/signup — public 3-day trial; signs the user straight in */
router.post('/signup', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (email === ADMIN_EMAIL) {
    return res.status(409).json({ error: 'This email already has an account. Please sign in.' });
  }

  try {
    const user = await createAppUser({
      email,
      password: req.body?.password,
      name: req.body?.name,
      plan: 'free',
      role: 'user',
      createdBy: 'self-signup',
      trialDays: TRIAL_DAYS,
    });
    return res.status(201).json({
      token: signAppToken(user),
      user,
      trialDays: TRIAL_DAYS,
      source: 'trial',
    });
  } catch (err) {
    return failed(res, err, 'Signup failed');
  }
});

/** GET /api/app-auth/me */
router.get('/me', (req, res) => {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const payload = token ? verifyAppToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Not authenticated' });
  return res.json({
    user: {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      plan: payload.plan,
      trialEndsAt: payload.trialEndsAt ?? null,
      verified: true,
      createdAt: new Date().toISOString(),
    },
  });
});

/** GET /api/app-auth/admin/users */
router.get('/admin/users', requireAdmin, async (_req, res) => {
  try {
    return res.json({ users: await listAppUsers() });
  } catch (err) {
    return failed(res, err, 'Could not load users');
  }
});

/** POST /api/app-auth/admin/users — create invite login */
router.post('/admin/users', requireAdmin, async (req, res) => {
  try {
    const user = await createAppUser({
      email: req.body?.email,
      password: req.body?.password,
      name: req.body?.name,
      plan: req.body?.plan,
      role: req.body?.role === 'admin' ? 'admin' : 'user',
      createdBy: req.adminActor || 'admin',
    });
    return res.status(201).json({
      user,
      message: 'Login created. Share email & password with the user privately.',
    });
  } catch (err) {
    return failed(res, err, 'Create failed');
  }
});

/** PATCH /api/app-auth/admin/users/:id — activate / deactivate */
router.patch('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await setAppUserActive(req.params.id, req.body?.active !== false);
    return res.json({ user });
  } catch (err) {
    return failed(res, err, 'Update failed');
  }
});

/** DELETE /api/app-auth/admin/users/:id */
router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    await deleteAppUser(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return failed(res, err, 'Delete failed');
  }
});

export default router;
