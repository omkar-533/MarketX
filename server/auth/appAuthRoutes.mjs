import { Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  authenticateAppUser,
  createAppUser,
  deleteAppUser,
  findAppUserByEmail,
  findAppUserById,
  findAppUserByIdentifier,
  findAppUserByPhone,
  hashPassword,
  listAppUsers,
  markUsersSeen,
  normalizePhone,
  publicUser,
  recordLogin,
  setAppUserActive,
  setAppUserRole,
  setPhoneVerified,
  setUserAccess,
  setUserPassword,
  setUserPhone,
} from './appUserStore.mjs';
import { accessStateFor } from './accessState.mjs';
import { consumeOtp, issueOtp, pendingOtpPayload } from './otpStore.mjs';
import { isDevSmsMode, sendOtpSms, smsProviderName } from './smsProvider.mjs';
import {
  DEFAULT_ACCESS_POPUP,
  DEFAULT_SUBSCRIPTION_CATALOG,
  getAccessPopup,
  getConfiguredTrialDays,
  getSubscriptionCatalog,
  publicAccessPopup,
  publicSubscriptionCatalog,
  setAccessPopup,
  setSubscriptionCatalog,
} from './appSettingsStore.mjs';
import {
  createAccessRequest,
  latestRequestForUser,
  listAccessRequests,
  pendingAccessRequestCount,
  reviewAccessRequest,
} from './accessRequests.mjs';
import {
  createIndicator,
  deleteIndicator,
  getIndicatorById,
  listAllIndicators,
  listPublishedIndicators,
  updateIndicator,
} from './indicatorsStore.mjs';
import { appendTvAccessRequest, isTvAccessSheetConfigured } from './tvAccessSheet.mjs';
import {
  createTvAccessRequest,
  deleteTvAccessRequest,
  getLatestTvAccessForUserIndicator,
  latestPendingTvAccessRequest,
  listGrantedTvAccessForUser,
  listTvAccessRequests,
  mapLatestTvAccessStatusByIndicator,
  pendingTvAccessRequestCount,
  reviewAllPendingTvAccessRequests,
  reviewTvAccessRequest,
} from './tvAccessRequests.mjs';
import {
  createKnowledgeFromPdf,
  createKnowledgeFromText,
  deleteKnowledgeDoc,
  listKnowledgeDocs,
} from './masterAiKnowledgeStore.mjs';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'omkarchauhan533@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Omkar@12345';
const JWT_SECRET =
  process.env.APP_AUTH_JWT_SECRET ||
  process.env.JWT_SECRET ||
  'apmi-invite-auth-change-me-in-production';

const LOCAL_ADMIN = {
  id: 'admin_local_omkar',
  name: 'Omkar Chauhan',
  email: ADMIN_EMAIL,
  role: 'admin',
  plan: 'premium',
  verified: true,
  active: true,
  phone: null,
  phoneVerified: false,
  accessStatus: 'granted',
  accessExpiresAt: null,
};

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

function bearerPayload(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return token ? verifyAppToken(token) : null;
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

  const payload = bearerPayload(req);
  if (payload?.role === 'admin') {
    req.adminActor = payload.email;
    return next();
  }

  return res.status(401).json({ error: 'Admin access required' });
}

/** Signed-in gate that always resolves the live record, never the stale JWT. */
async function requireUser(req, res, next) {
  const payload = bearerPayload(req);
  if (!payload) return res.status(401).json({ error: 'Not authenticated' });

  if (payload.role === 'admin' && payload.sub === LOCAL_ADMIN.id) {
    req.appUser = { ...LOCAL_ADMIN, createdAt: new Date().toISOString() };
    return next();
  }

  try {
    const record = await findAppUserById(payload.sub);
    if (!record) return res.status(401).json({ error: 'Account not found' });
    req.appUser = publicUser(record);
    return next();
  } catch (err) {
    return failed(res, err, 'Could not load account');
  }
}

/* ────────────────────────── validation ────────────────────────── */

function validateSignup({ name, email, phone, password }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = normalizePhone(phone);
  const pwd = String(password || '');

  if (cleanName.length < 2) return { error: 'Please enter your full name' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) return { error: 'Enter a valid email' };
  if (!cleanPhone) return { error: 'Enter a valid 10-digit Indian mobile number' };
  if (pwd.length < 6) return { error: 'Password must be at least 6 characters' };

  return { value: { name: cleanName, email: cleanEmail, phone: cleanPhone, password: pwd } };
}

async function accessPayloadFor(user) {
  const state = accessStateFor(user);
  const [popup, request, trialDays] = await Promise.all([
    getAccessPopup(),
    user.role === 'admin' ? Promise.resolve(null) : latestRequestForUser(user.id),
    getConfiguredTrialDays(),
  ]);

  return {
    access: {
      ...state,
      trialDays,
      request: request
        ? {
            id: request.id,
            status: request.status,
            createdAt: request.createdAt,
            adminNote: request.adminNote,
          }
        : null,
    },
    popup: publicAccessPopup(popup),
  };
}

const router = Router();

/* ────────────────────────── login ────────────────────────── */

/** POST /api/app-auth/login — strict mobile + password for every member (desk admin email still allowed) */
router.post('/login', async (req, res) => {
  const identifier = String(req.body?.identifier || req.body?.email || '').trim();
  const password = String(req.body?.password || '');

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Mobile number and password required' });
  }

  if (isAdminPair(identifier, password)) {
    const user = { ...LOCAL_ADMIN, createdAt: new Date().toISOString() };
    return res.json({
      token: signAppToken(user),
      user,
      source: 'admin',
      ...(await accessPayloadFor(user)),
    });
  }

  if (identifier.includes('@')) {
    return res.status(400).json({
      error: 'Sign in with your registered mobile number only.',
    });
  }

  const phone = normalizePhone(identifier);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number' });
  }

  try {
    const authed = await authenticateAppUser(phone, password);
    if (!authed) {
      return res.status(401).json({ error: 'Wrong mobile number or password' });
    }
    if (authed.active === false) {
      return res.status(403).json({ error: 'This account is disabled. Contact the desk.' });
    }
    const user = (await recordLogin(authed.id)) || authed;
    return res.json({
      token: signAppToken(user),
      user,
      source: 'invite',
      ...(await accessPayloadFor(user)),
    });
  } catch (err) {
    return failed(res, err, 'Login failed — try again in a moment');
  }
});

/* ────────────────────────── OTP signup (Twilio SMS) ────────────────────────── */

/** POST /api/app-auth/signup/start — validate, then SMS an OTP. No account yet. */
router.post('/signup/start', async (req, res) => {
  const { error, value } = validateSignup(req.body || {});
  if (error) return res.status(400).json({ error });

  try {
    if (value.email === ADMIN_EMAIL) {
      return res.status(409).json({ error: 'This email already has an account. Please sign in.' });
    }
    if (await findAppUserByEmail(value.email)) {
      return res.status(409).json({ error: 'This email is already registered. Please sign in.' });
    }
    if (await findAppUserByPhone(value.phone)) {
      return res
        .status(409)
        .json({ error: 'This mobile number is already registered. Please sign in.' });
    }

    const { code, expiresInSec } = await issueOtp(value.phone, 'signup', {
      name: value.name,
      email: value.email,
      phone: value.phone,
      passwordHash: hashPassword(value.password),
    });

    const sent = await sendOtpSms(value.phone, code);
    return res.json({
      sent: true,
      phone: value.phone,
      expiresInSec,
      provider: sent.provider,
      channel: 'sms',
      devMode: isDevSmsMode(),
      devCode: sent.devCode ?? null,
    });
  } catch (err) {
    return failed(res, err, 'Could not send OTP');
  }
});

/** POST /api/app-auth/signup/resend */
router.post('/signup/resend', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid mobile number' });

  try {
    const payload = await pendingOtpPayload(phone, 'signup');
    if (!payload) {
      return res.status(400).json({ error: 'Please start the signup again.' });
    }

    const { code, expiresInSec } = await issueOtp(phone, 'signup', payload);
    const sent = await sendOtpSms(phone, code);
    return res.json({
      sent: true,
      phone,
      expiresInSec,
      provider: sent.provider,
      channel: 'sms',
      devMode: isDevSmsMode(),
      devCode: sent.devCode ?? null,
    });
  } catch (err) {
    return failed(res, err, 'Could not resend OTP');
  }
});

/** POST /api/app-auth/signup/verify — creates the account + full trial */
router.post('/signup/verify', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();

  if (!phone || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit OTP' });
  }

  try {
    const payload = await consumeOtp(phone, 'signup', code);
    if (!payload?.email) {
      return res.status(400).json({ error: 'Signup expired. Please start again.' });
    }

    const trialDays = await getConfiguredTrialDays();
    const created = await createAppUser({
      email: payload.email,
      passwordHash: payload.passwordHash,
      name: payload.name,
      phone: payload.phone || phone,
      phoneVerified: true,
      plan: 'free',
      role: 'user',
      createdBy: 'self-signup',
      trialDays,
      planId: 'trial',
    });

    const user = (await recordLogin(created.id)) || created;
    return res.status(201).json({
      token: signAppToken(user),
      user,
      trialDays,
      source: 'trial',
      ...(await accessPayloadFor(user)),
    });
  } catch (err) {
    return failed(res, err, 'Verification failed');
  }
});

/* ────────────────────────── forgot password (SMS OTP) ────────────────────────── */

const RESET_PURPOSE = 'reset';

/** Enough of the number to recognise it, not enough to learn it from an email. */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return '';
  return `+91 ${digits.slice(0, 2)}••••${digits.slice(-4)}`;
}

async function resolveResetTarget(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) {
    throw Object.assign(new Error('Enter your 10-digit mobile number'), { status: 400 });
  }

  // Password reset is mobile-only (SMS OTP). Reject email identifiers.
  if (raw.includes('@')) {
    throw Object.assign(
      new Error('Use your registered mobile number only — email cannot reset the password.'),
      { status: 400 },
    );
  }

  const phone = normalizePhone(raw);
  if (!phone) {
    throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number'), { status: 400 });
  }

  const user = await findAppUserByPhone(phone);
  if (!user) {
    throw Object.assign(new Error('No account found with this mobile number.'), { status: 404 });
  }
  if (user.active === false) {
    throw Object.assign(new Error('This account is disabled. Contact the desk to reopen it.'), {
      status: 403,
    });
  }
  if (!user.phone) {
    throw Object.assign(
      new Error('No mobile number is linked to this account. Contact the desk to reset it.'),
      { status: 400 },
    );
  }
  return user;
}

async function sendResetOtp(user) {
  const { code, expiresInSec } = await issueOtp(user.phone, RESET_PURPOSE, { userId: user.id });
  const sent = await sendOtpSms(user.phone, code);
  return {
    sent: true,
    phoneMasked: maskPhone(user.phone),
    expiresInSec,
    channel: 'sms',
    devMode: isDevSmsMode(),
    devCode: sent.devCode ?? null,
  };
}

/** POST /api/app-auth/password/forgot — texts a reset code to the number on file */
router.post('/password/forgot', async (req, res) => {
  try {
    return res.json(await sendResetOtp(await resolveResetTarget(req.body?.identifier)));
  } catch (err) {
    return failed(res, err, 'Could not send the reset code');
  }
});

/** POST /api/app-auth/password/resend */
router.post('/password/resend', async (req, res) => {
  try {
    return res.json(await sendResetOtp(await resolveResetTarget(req.body?.identifier)));
  } catch (err) {
    return failed(res, err, 'Could not resend the reset code');
  }
});

/** POST /api/app-auth/password/reset — sets the new password and signs the user in */
router.post('/password/reset', async (req, res) => {
  const code = String(req.body?.code || '').trim();
  const password = String(req.body?.password || '');

  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit OTP' });
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const target = await resolveResetTarget(req.body?.identifier);
    const payload = await consumeOtp(target.phone, RESET_PURPOSE, code);
    if (payload?.userId && payload.userId !== target.id) {
      return res.status(400).json({ error: 'This code belongs to another account.' });
    }

    await setUserPassword(target.id, password);
    const user = (await recordLogin(target.id)) || publicUser(target);
    return res.json({
      token: signAppToken(user),
      user,
      source: 'reset',
      ...(await accessPayloadFor(user)),
    });
  } catch (err) {
    return failed(res, err, 'Could not reset the password');
  }
});

/* ────────────────────────── session + access ────────────────────────── */

/** GET /api/app-auth/me */
router.get('/me', requireUser, async (req, res) => {
  try {
    return res.json({ user: req.appUser, ...(await accessPayloadFor(req.appUser)) });
  } catch (err) {
    return failed(res, err, 'Could not load session');
  }
});

/** GET /api/app-auth/access — live gate state; the JWT is never trusted for this */
router.get('/access', requireUser, async (req, res) => {
  try {
    return res.json({ user: req.appUser, ...(await accessPayloadFor(req.appUser)) });
  } catch (err) {
    return failed(res, err, 'Could not load access');
  }
});

/** POST /api/app-auth/access/request — full details form for admin review */
router.post('/access/request', requireUser, async (req, res) => {
  try {
    const request = await createAccessRequest({
      user: req.appUser,
      fullName: req.body?.fullName ?? req.body?.name,
      phone: req.body?.phone,
      tradingViewId: req.body?.tradingViewId,
      email: req.body?.email,
      message: req.body?.message,
      note: req.body?.note,
      screenshot: req.body?.screenshot,
    });
    return res.status(201).json({
      request: { id: request.id, status: request.status, createdAt: request.createdAt },
      ...(await accessPayloadFor(req.appUser)),
    });
  } catch (err) {
    return failed(res, err, 'Could not submit access request');
  }
});

/* ────────────────────────── indicators library ────────────────────────── */

function publicIndicator(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    link: row.link,
    sortOrder: row.sortOrder,
    published: row.published,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    imageUrl: row.imageUrl,
  };
}

/**
 * Invite link visibility:
 * - Admin: always
 * - Unlocked + never requested TV access: show (legacy / browse)
 * - Unlocked + granted: show (after admin Approve)
 * - Pending / dismissed / locked workspace: hide
 */
function withInviteGate(pub, { isAdmin, unlocked, tvStatus }) {
  const next = { ...pub, tvAccessStatus: tvStatus || null };
  if (isAdmin) return next;
  const showLink = unlocked && (tvStatus === 'granted' || !tvStatus);
  if (!showLink) next.link = '';
  return next;
}

/** GET /api/app-auth/indicators — published library for signed-in members */
router.get('/indicators', requireUser, async (req, res) => {
  try {
    const access = accessStateFor(req.appUser);
    const isAdmin = req.appUser?.role === 'admin';
    const statusMap = isAdmin
      ? new Map()
      : await mapLatestTvAccessStatusByIndicator(req.appUser?.id);
    const indicators = await listPublishedIndicators();
    const rows = indicators.map((row) => {
      const pub = publicIndicator(row);
      const tvStatus = statusMap.get(row.id) || null;
      return withInviteGate(pub, {
        isAdmin,
        unlocked: access.unlocked,
        tvStatus,
      });
    });
    return res.json({
      indicators: rows,
      access: {
        unlocked: access.unlocked,
        isTrial: access.isTrial,
        daysLeft: access.daysLeft,
        reason: access.reason,
      },
    });
  } catch (err) {
    return failed(res, err, 'Could not load indicators');
  }
});

/** GET /api/app-auth/indicators/:id */
router.get('/indicators/:id', requireUser, async (req, res) => {
  try {
    const access = accessStateFor(req.appUser);
    const isAdmin = req.appUser?.role === 'admin';
    const row = await getIndicatorById(req.params.id, { publishedOnly: true });
    if (!row) return res.status(404).json({ error: 'Indicator not found' });
    const latest = isAdmin
      ? null
      : await getLatestTvAccessForUserIndicator(req.appUser?.id, row.id);
    const tvStatus = latest?.status || null;
    const pub = withInviteGate(publicIndicator(row), {
      isAdmin,
      unlocked: access.unlocked,
      tvStatus,
    });
    if (!access.unlocked && !isAdmin) {
      return res.status(403).json({
        error: 'Your demo ended — get access approved to open indicator links',
        indicator: pub,
        access: {
          unlocked: false,
          isTrial: access.isTrial,
          daysLeft: access.daysLeft,
          reason: access.reason,
        },
      });
    }
    return res.json({ indicator: pub, tvAccess: latest });
  } catch (err) {
    return failed(res, err, 'Could not load indicator');
  }
});

/**
 * GET /api/app-auth/tv-access/grants
 * Member inbox: approved TV invites with unlock links (for popup / notification).
 */
router.get('/tv-access/grants', requireUser, async (req, res) => {
  try {
    if (req.appUser?.role === 'admin') {
      return res.json({ grants: [] });
    }
    const requests = await listGrantedTvAccessForUser(req.appUser?.id, { limit: 30 });
    const grants = [];
    for (const request of requests) {
      const indicator = request.indicatorId
        ? await getIndicatorById(request.indicatorId, { publishedOnly: true })
        : null;
      // TV Approve means the invite is unlocked for this member — always return the link.
      const inviteLink = indicator?.link || '';
      grants.push({
        id: request.id,
        indicatorId: request.indicatorId,
        indicatorTitle: request.indicatorTitle || indicator?.title || 'Indicator',
        tradingViewId: request.tradingViewId,
        inviteLink,
        reviewedAt: request.reviewedAt,
        createdAt: request.createdAt,
      });
    }
    return res.json({ grants });
  } catch (err) {
    return failed(res, err, 'Could not load TradingView grants');
  }
});

/**
 * GET /api/app-auth/indicators/:id/tv-access
 * Member: current TV invite unlock status for this indicator.
 */
router.get('/indicators/:id/tv-access', requireUser, async (req, res) => {
  try {
    const access = accessStateFor(req.appUser);
    const isAdmin = req.appUser?.role === 'admin';
    const row = await getIndicatorById(req.params.id, { publishedOnly: true });
    if (!row) return res.status(404).json({ error: 'Indicator not found' });

    const latest = isAdmin
      ? null
      : await getLatestTvAccessForUserIndicator(req.appUser?.id, row.id);
    const tvStatus = latest?.status || null;
    const showLink = isAdmin || (access.unlocked && (tvStatus === 'granted' || !tvStatus));

    return res.json({
      ok: true,
      status: tvStatus,
      request: latest,
      inviteUnlocked: Boolean(showLink && row.link),
      inviteLink: showLink ? row.link || '' : '',
      access: {
        unlocked: access.unlocked,
        isTrial: access.isTrial,
        daysLeft: access.daysLeft,
        reason: access.reason,
      },
    });
  } catch (err) {
    return failed(res, err, 'Could not load TradingView access status');
  }
});

/**
 * POST /api/app-auth/indicators/:id/tv-access
 * Member submits TradingView username → in-app store (+ Google Sheet backup).
 */
router.post('/indicators/:id/tv-access', requireUser, async (req, res) => {
  try {
    const tradingViewId = String(req.body?.tradingViewId || req.body?.tvUsername || '')
      .trim()
      .replace(/^@/, '');
    if (!tradingViewId || tradingViewId.length < 2) {
      return res.status(400).json({ error: 'Enter your TradingView username' });
    }
    if (tradingViewId.length > 64) {
      return res.status(400).json({ error: 'TradingView username is too long' });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(tradingViewId)) {
      return res.status(400).json({
        error: 'Use your TradingView username only (letters, numbers, . _ -)',
      });
    }

    const row = await getIndicatorById(req.params.id, { publishedOnly: true });
    if (!row) return res.status(404).json({ error: 'Indicator not found' });

    const user = req.appUser;
    const request = await createTvAccessRequest({
      tradingViewId,
      indicatorId: row.id,
      indicatorTitle: row.title,
      user,
    });

    let sheetOk = false;
    let sheetError = null;
    if (isTvAccessSheetConfigured()) {
      try {
        await appendTvAccessRequest({
          tradingViewId,
          indicatorId: row.id,
          indicatorTitle: row.title,
          userId: user?.id,
          userName: user?.name,
          userEmail: user?.email,
          userMobile: user?.phone,
        });
        sheetOk = true;
      } catch (sheetErr) {
        sheetError = sheetErr instanceof Error ? sheetErr.message : 'Sheet sync failed';
        console.warn('[tv-access] sheet append failed after store write:', sheetError);
      }
    }

    const alreadyGranted = request?.status === 'granted';
    return res.json({
      ok: true,
      request,
      inviteLink: alreadyGranted ? row.link || '' : '',
      message: alreadyGranted
        ? 'Access already approved — open the invite link below.'
        : 'Request received. After the desk adds you on TradingView, your invite link unlocks here.',
      sheetConfigured: isTvAccessSheetConfigured(),
      sheetOk,
      sheetError,
    });
  } catch (err) {
    return failed(res, err, 'Could not submit TradingView access request');
  }
});

/** GET /api/app-auth/admin/indicators */
router.get('/admin/indicators', requireAdmin, async (_req, res) => {
  try {
    const indicators = await listAllIndicators();
    return res.json({ indicators: indicators.map(publicIndicator) });
  } catch (err) {
    return failed(res, err, 'Could not load indicators');
  }
});

/** POST /api/app-auth/admin/indicators */
router.post('/admin/indicators', requireAdmin, async (req, res) => {
  try {
    const indicator = await createIndicator({
      title: req.body?.title,
      description: req.body?.description,
      link: req.body?.link ?? req.body?.code,
      image: req.body?.image,
      sortOrder: req.body?.sortOrder,
      published: req.body?.published,
      createdBy: req.adminActor || 'admin',
    });
    return res.status(201).json({ indicator: publicIndicator(indicator) });
  } catch (err) {
    return failed(res, err, 'Could not create indicator');
  }
});

/** PATCH /api/app-auth/admin/indicators/:id */
router.patch('/admin/indicators/:id', requireAdmin, async (req, res) => {
  try {
    const indicator = await updateIndicator(req.params.id, {
      title: req.body?.title,
      description: req.body?.description,
      link: req.body?.link ?? req.body?.code,
      image: req.body?.image,
      sortOrder: req.body?.sortOrder,
      published: req.body?.published,
    });
    return res.json({ indicator: publicIndicator(indicator) });
  } catch (err) {
    return failed(res, err, 'Could not update indicator');
  }
});

/** DELETE /api/app-auth/admin/indicators/:id */
router.delete('/admin/indicators/:id', requireAdmin, async (req, res) => {
  try {
    await deleteIndicator(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return failed(res, err, 'Could not delete indicator');
  }
});

/** GET /api/app-auth/admin/knowledge — Analyse AI owner teachings */
router.get('/admin/knowledge', requireAdmin, async (_req, res) => {
  try {
    const documents = await listKnowledgeDocs();
    return res.json({ documents });
  } catch (err) {
    return failed(res, err, 'Could not load knowledge docs');
  }
});

/** POST /api/app-auth/admin/knowledge — upload PDF or paste text notes */
router.post('/admin/knowledge', requireAdmin, async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const pdfDataUrl = typeof req.body?.pdfDataUrl === 'string' ? req.body.pdfDataUrl : '';
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : '';
    const uploadedBy = req.adminActor || 'admin';

    let document;
    if (pdfDataUrl) {
      document = await createKnowledgeFromPdf({ title, filename, pdfDataUrl, uploadedBy });
    } else if (text.trim()) {
      document = await createKnowledgeFromText({ title, text, uploadedBy });
    } else {
      return res.status(400).json({ error: 'Provide a PDF (pdfDataUrl) or teaching text' });
    }
    return res.status(201).json({ document });
  } catch (err) {
    return failed(res, err, 'Could not save teaching');
  }
});

/** DELETE /api/app-auth/admin/knowledge/:id */
router.delete('/admin/knowledge/:id', requireAdmin, async (req, res) => {
  try {
    await deleteKnowledgeDoc(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return failed(res, err, 'Could not delete teaching');
  }
});

/* ── legacy accounts without a mobile number ── */

/** POST /api/app-auth/phone/start */
router.post('/phone/start', requireUser, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });

  try {
    const clash = await findAppUserByPhone(phone);
    if (clash && clash.id !== req.appUser.id) {
      return res.status(409).json({ error: 'This mobile number is already registered' });
    }

    const { code, expiresInSec } = await issueOtp(phone, 'add-phone', { userId: req.appUser.id });
    const sent = await sendOtpSms(phone, code);
    return res.json({
      sent: true,
      phone,
      expiresInSec,
      devMode: isDevSmsMode(),
      devCode: sent.devCode ?? null,
    });
  } catch (err) {
    return failed(res, err, 'Could not send OTP');
  }
});

/** POST /api/app-auth/phone/verify */
router.post('/phone/verify', requireUser, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit OTP' });
  }

  try {
    const payload = await consumeOtp(phone, 'add-phone', code);
    if (payload?.userId && payload.userId !== req.appUser.id) {
      return res.status(400).json({ error: 'OTP does not belong to this account' });
    }
    const user = await setUserPhone(req.appUser.id, phone);
    return res.json({ user, ...(await accessPayloadFor(user)) });
  } catch (err) {
    return failed(res, err, 'Verification failed');
  }
});

/* ────────────────────────── admin: users ────────────────────────── */

/** GET /api/app-auth/admin/users */
router.get('/admin/users', requireAdmin, async (_req, res) => {
  try {
    const users = await listAppUsers();
    return res.json({
      users: users.map((user) => ({ ...user, access: accessStateFor(user) })),
      pendingRequests: await pendingAccessRequestCount(),
    });
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
      phone: req.body?.phone,
      phoneVerified: Boolean(req.body?.phone),
      plan: req.body?.plan,
      role: req.body?.role === 'admin' ? 'admin' : 'user',
      createdBy: req.adminActor || 'admin',
      accessStatus: 'granted',
      accessDays: Number(req.body?.accessDays) || 0,
    });
    return res.status(201).json({
      user,
      message: 'Login created. Share email & password with the user privately.',
    });
  } catch (err) {
    return failed(res, err, 'Create failed');
  }
});

/** PATCH /api/app-auth/admin/users/:id — activate / deactivate / set role */
router.patch('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    let user = null;
    if (typeof req.body?.role === 'string') {
      user = await setAppUserRole(req.params.id, req.body.role);
    }
    if (typeof req.body?.active === 'boolean') {
      user = await setAppUserActive(req.params.id, req.body.active);
    }
    if (!user) {
      // Default: keep previous activate behaviour when body only has active-ish fields.
      user = await setAppUserActive(req.params.id, req.body?.active !== false);
    }
    return res.json({ user: { ...user, access: accessStateFor(user) } });
  } catch (err) {
    return failed(res, err, 'Update failed');
  }
});

/** POST /api/app-auth/admin/users/:id/access — grant days / lifetime / lock / block */
router.post('/admin/users/:id/access', requireAdmin, async (req, res) => {
  const status = String(req.body?.status || 'granted');
  if (!['trial', 'granted', 'locked', 'blocked'].includes(status)) {
    return res.status(400).json({ error: 'Unknown access status' });
  }

  try {
    const user = await setUserAccess(req.params.id, {
      status,
      days: status === 'granted' || status === 'trial' ? Number(req.body?.days) || null : null,
      planId: req.body?.planId || null,
    });
    return res.json({ user: { ...user, access: accessStateFor(user) } });
  } catch (err) {
    return failed(res, err, 'Update failed');
  }
});

/** POST /api/app-auth/admin/users/:id/verify-phone — manual safety net */
router.post('/admin/users/:id/verify-phone', requireAdmin, async (req, res) => {
  try {
    const user = req.body?.phone
      ? await setUserPhone(req.params.id, req.body.phone)
      : await setPhoneVerified(req.params.id, req.body?.verified !== false);
    return res.json({ user: { ...user, access: accessStateFor(user) } });
  } catch (err) {
    return failed(res, err, 'Update failed');
  }
});

/** POST /api/app-auth/admin/users/seen — clears the NEW badge */
router.post('/admin/users/seen', requireAdmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
    return res.json(await markUsersSeen(ids));
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

/* ────────────────────────── admin: access requests ────────────────────────── */

/** GET /api/app-auth/admin/access-requests?status=pending|approved|rejected|all */
router.get('/admin/access-requests', requireAdmin, async (req, res) => {
  try {
    const requests = await listAccessRequests({
      status: String(req.query?.status || 'pending'),
      limit: Math.min(200, Number(req.query?.limit) || 100),
    });
    return res.json({ requests, pendingCount: await pendingAccessRequestCount() });
  } catch (err) {
    return failed(res, err, 'Could not load requests');
  }
});

/* ────────────────────────── admin: TradingView access requests ────────────────────────── */

/** GET /api/app-auth/admin/tv-access-requests?status=pending|granted|dismissed|all */
router.get('/admin/tv-access-requests', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query?.status || 'pending');
    const requests = await listTvAccessRequests({
      status,
      limit: Math.min(200, Number(req.query?.limit) || 100),
    });
    const pendingCount = await pendingTvAccessRequestCount();
    const latestPending = await latestPendingTvAccessRequest();
    return res.json({ requests, pendingCount, latestPending });
  } catch (err) {
    return failed(res, err, 'Could not load TradingView access requests');
  }
});

/** POST /api/app-auth/admin/tv-access-requests/:id/granted */
router.post('/admin/tv-access-requests/:id/granted', requireAdmin, async (req, res) => {
  try {
    const result = await reviewTvAccessRequest(req.params.id, {
      status: 'granted',
      adminNote: req.body?.adminNote,
      reviewedBy: req.adminActor || 'admin',
    });
    const indicatorId = result?.request?.indicatorId;
    const indicator = indicatorId ? await getIndicatorById(indicatorId) : null;
    return res.json({
      ...result,
      inviteLink: indicator?.link || '',
    });
  } catch (err) {
    return failed(res, err, 'Could not mark as granted');
  }
});

/** POST /api/app-auth/admin/tv-access-requests/:id/dismiss */
router.post('/admin/tv-access-requests/:id/dismiss', requireAdmin, async (req, res) => {
  try {
    const result = await reviewTvAccessRequest(req.params.id, {
      status: 'dismissed',
      adminNote: req.body?.adminNote,
      reviewedBy: req.adminActor || 'admin',
    });
    return res.json(result);
  } catch (err) {
    return failed(res, err, 'Could not dismiss request');
  }
});

/** POST /api/app-auth/admin/tv-access-requests/approve-all — unlock all pending */
router.post('/admin/tv-access-requests/approve-all', requireAdmin, async (req, res) => {
  try {
    const result = await reviewAllPendingTvAccessRequests({
      status: 'granted',
      reviewedBy: req.adminActor || 'admin',
    });
    return res.json(result);
  } catch (err) {
    return failed(res, err, 'Could not approve all requests');
  }
});

/** DELETE /api/app-auth/admin/tv-access-requests/:id */
router.delete('/admin/tv-access-requests/:id', requireAdmin, async (req, res) => {
  try {
    const result = await deleteTvAccessRequest(req.params.id);
    return res.json(result);
  } catch (err) {
    return failed(res, err, 'Could not delete request');
  }
});

/** POST /api/app-auth/admin/access-requests/:id/approve — { days } (0 = lifetime) */
router.post('/admin/access-requests/:id/approve', requireAdmin, async (req, res) => {
  try {
    const popup = await getAccessPopup();
    const days =
      req.body?.days === 0 || req.body?.days === '0'
        ? 0
        : Number(req.body?.days) || popup.defaultGrantDays;

    const result = await reviewAccessRequest(req.params.id, {
      approve: true,
      days,
      adminNote: req.body?.adminNote,
      reviewedBy: req.adminActor || 'admin',
    });
    return res.json(result);
  } catch (err) {
    return failed(res, err, 'Approve failed');
  }
});

/** POST /api/app-auth/admin/access-requests/:id/reject */
router.post('/admin/access-requests/:id/reject', requireAdmin, async (req, res) => {
  try {
    const result = await reviewAccessRequest(req.params.id, {
      approve: false,
      adminNote: req.body?.adminNote,
      reviewedBy: req.adminActor || 'admin',
    });
    return res.json(result);
  } catch (err) {
    return failed(res, err, 'Reject failed');
  }
});

/* ────────────────────────── admin: settings ────────────────────────── */

/** GET /api/app-auth/admin/settings */
router.get('/admin/settings', requireAdmin, async (_req, res) => {
  try {
    const trialDays = await getConfiguredTrialDays();
    return res.json({
      popup: await getAccessPopup(),
      defaults: DEFAULT_ACCESS_POPUP,
      sms: { provider: smsProviderName(), devMode: isDevSmsMode() },
      trialDays,
    });
  } catch (err) {
    return failed(res, err, 'Could not load settings');
  }
});

/** PUT /api/app-auth/admin/settings */
router.put('/admin/settings', requireAdmin, async (req, res) => {
  try {
    const popup = await setAccessPopup(req.body?.popup || req.body, req.adminActor || 'admin');
    return res.json({ popup });
  } catch (err) {
    return failed(res, err, 'Save failed');
  }
});

/* ────────────────────────── subscription plans catalog ────────────────────────── */

/** GET /api/app-auth/plans — public catalog (enabled plans only) */
router.get('/plans', async (_req, res) => {
  try {
    const catalog = await getSubscriptionCatalog();
    return res.json(publicSubscriptionCatalog(catalog));
  } catch (err) {
    return failed(res, err, 'Could not load plans');
  }
});

/** GET /api/app-auth/admin/plans — full catalog including disabled */
router.get('/admin/plans', requireAdmin, async (_req, res) => {
  try {
    const catalog = await getSubscriptionCatalog();
    return res.json({
      ...catalog,
      defaults: DEFAULT_SUBSCRIPTION_CATALOG,
    });
  } catch (err) {
    return failed(res, err, 'Could not load plans');
  }
});

/** PUT /api/app-auth/admin/plans — save full catalog */
router.put('/admin/plans', requireAdmin, async (req, res) => {
  try {
    const catalog = await setSubscriptionCatalog(
      req.body?.catalog || req.body,
      req.adminActor || 'admin',
    );
    return res.json(catalog);
  } catch (err) {
    return failed(res, err, 'Could not save plans');
  }
});

export default router;
