/**
 * Promo codes — stored in app_settings (same pattern as plans).
 * Redeem grants access via setUserAccess (days / planId).
 */

import { readSetting, writeSetting } from './appSettingsStore.mjs';
import { randomUUID } from 'crypto';

export const PROMO_CODES_KEY = 'promo_codes';

const PLAN_IDS = new Set(['1day', 'trial', 'monthly', 'quarterly', 'yearly']);

/** Access length follows the tagged plan — no separate “days” knob needed. */
export const PLAN_ACCESS_DAYS = {
  '1day': 1,
  trial: 3,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

function clampStr(value, fallback, max) {
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  return s.slice(0, max);
}

/** Normalize user-facing codes: trim, upper, strip spaces/dashes. */
export function normalizePromoCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
}

function sanitizePromoCode(input, { preserveId = true } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const code = normalizePromoCode(src.code);
  if (!code || code.length < 3) {
    throw Object.assign(new Error('Promo code must be at least 3 characters'), { status: 400 });
  }
  if (code.length > 32) {
    throw Object.assign(new Error('Promo code is too long'), { status: 400 });
  }

  const planRaw = String(src.planId || '').trim().toLowerCase();
  const planId = PLAN_IDS.has(planRaw) ? planRaw : null;

  // Plan wins: 1 day=1, 3-day trial=3, Monthly=30, 3 Months=90, Yearly=365. No plan → lifetime (0).
  let grantDays = 0;
  if (planId) {
    grantDays = PLAN_ACCESS_DAYS[planId];
  } else {
    const grantDaysRaw = Number(src.grantDays);
    if (Number.isFinite(grantDaysRaw) && grantDaysRaw > 0) {
      grantDays = Math.min(3650, Math.round(grantDaysRaw));
    }
  }

  const maxRaw = src.maxRedemptions;
  let maxRedemptions = null;
  if (maxRaw !== null && maxRaw !== undefined && maxRaw !== '') {
    const n = Number(maxRaw);
    if (Number.isFinite(n) && n > 0) maxRedemptions = Math.min(100_000, Math.round(n));
  }

  const usedCount = Math.max(0, Math.round(Number(src.usedCount) || 0));

  const discountRaw = Number(src.discountPercent);
  let discountPercent = 0;
  if (Number.isFinite(discountRaw) && discountRaw > 0) {
    discountPercent = Math.min(100, Math.round(discountRaw));
  }

  let expiresAt = null;
  if (src.expiresAt) {
    const t = Date.parse(String(src.expiresAt));
    if (Number.isFinite(t)) expiresAt = new Date(t).toISOString();
  }

  const redeemedBy = Array.isArray(src.redeemedBy)
    ? src.redeemedBy.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 50_000)
    : [];

  return {
    id: preserveId && src.id ? String(src.id) : randomUUID(),
    code,
    label: clampStr(src.label, '', 80),
    grantDays,
    planId,
    discountPercent,
    maxRedemptions,
    usedCount,
    expiresAt,
    enabled: src.enabled !== false,
    createdAt: src.createdAt || new Date().toISOString(),
    createdBy: clampStr(src.createdBy, 'admin', 80),
    redeemedBy,
  };
}

function sanitizeStore(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const list = Array.isArray(raw.codes) ? raw.codes : [];
  const codes = [];
  const seen = new Set();
  for (const item of list) {
    try {
      const next = sanitizePromoCode(item);
      if (seen.has(next.code)) continue;
      seen.add(next.code);
      codes.push(next);
    } catch {
      /* skip corrupt rows */
    }
  }
  return { codes };
}

export async function getPromoCodesStore() {
  try {
    return sanitizeStore(await readSetting(PROMO_CODES_KEY));
  } catch (err) {
    console.warn('[promoCodes] read failed, using empty store', err?.message || err);
    return { codes: [] };
  }
}

async function writePromoCodesStore(store, updatedBy) {
  const next = sanitizeStore(store);
  try {
    await writeSetting(PROMO_CODES_KEY, next, updatedBy);
  } catch (err) {
    console.error('[promoCodes] write failed', err?.message || err);
    throw Object.assign(new Error('Could not save promo codes — try again'), { status: 503 });
  }
  return next;
}

/** Admin list — strip heavy redemption ids for UI (keep counts). */
export function publicAdminPromoList(store) {
  return {
    codes: (store.codes || []).map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
      grantDays: c.grantDays,
      planId: c.planId,
      discountPercent: c.discountPercent || 0,
      maxRedemptions: c.maxRedemptions,
      usedCount: c.usedCount,
      expiresAt: c.expiresAt,
      enabled: c.enabled,
      createdAt: c.createdAt,
      createdBy: c.createdBy,
    })),
  };
}

export async function createPromoCode(input, createdBy = 'admin') {
  const store = await getPromoCodesStore();
  const next = sanitizePromoCode(
    { ...input, usedCount: 0, redeemedBy: [], createdAt: new Date().toISOString(), createdBy },
    { preserveId: false },
  );
  if (store.codes.some((c) => c.code === next.code)) {
    throw Object.assign(new Error('That promo code already exists'), { status: 409 });
  }
  store.codes.unshift(next);
  await writePromoCodesStore(store, createdBy);
  return next;
}

export async function updatePromoCode(id, patch, updatedBy = 'admin') {
  const store = await getPromoCodesStore();
  const idx = store.codes.findIndex((c) => c.id === id);
  if (idx < 0) {
    throw Object.assign(new Error('Promo code not found'), { status: 404 });
  }
  const prev = store.codes[idx];
  const merged = {
    ...prev,
    ...patch,
    id: prev.id,
    usedCount: prev.usedCount,
    redeemedBy: prev.redeemedBy,
    createdAt: prev.createdAt,
    createdBy: prev.createdBy,
  };
  if (patch.code != null) merged.code = normalizePromoCode(patch.code);
  const next = sanitizePromoCode(merged);
  if (store.codes.some((c, i) => i !== idx && c.code === next.code)) {
    throw Object.assign(new Error('That promo code already exists'), { status: 409 });
  }
  // Preserve redemption history from prev after sanitize rebuild
  next.usedCount = prev.usedCount;
  next.redeemedBy = prev.redeemedBy;
  store.codes[idx] = next;
  await writePromoCodesStore(store, updatedBy);
  return next;
}

export async function deletePromoCode(id, updatedBy = 'admin') {
  const store = await getPromoCodesStore();
  const nextCodes = store.codes.filter((c) => c.id !== id);
  if (nextCodes.length === store.codes.length) {
    throw Object.assign(new Error('Promo code not found'), { status: 404 });
  }
  await writePromoCodesStore({ codes: nextCodes }, updatedBy);
  return { ok: true };
}

/**
 * Validate a promo without consuming it (signup gate).
 * Returns the same shape as redeemPromoCode.
 */
export async function peekPromoCode(rawCode) {
  const code = normalizePromoCode(rawCode);
  if (!code) {
    throw Object.assign(new Error('Promo code is compulsory — enter a valid code to sign up'), {
      status: 400,
    });
  }

  const store = await getPromoCodesStore();
  const promo = store.codes.find((c) => c.code === code);
  if (!promo) {
    throw Object.assign(new Error('Invalid promo code'), { status: 404 });
  }
  if (!promo.enabled) {
    throw Object.assign(new Error('This promo code is disabled'), { status: 400 });
  }
  if (promo.expiresAt && Date.parse(promo.expiresAt) < Date.now()) {
    throw Object.assign(new Error('This promo code has expired'), { status: 400 });
  }
  if (promo.maxRedemptions != null && promo.usedCount >= promo.maxRedemptions) {
    throw Object.assign(new Error('This promo code has reached its limit'), { status: 400 });
  }

  return {
    promo: {
      code: promo.code,
      label: promo.label,
      grantDays: promo.grantDays,
      planId: promo.planId,
      discountPercent: promo.discountPercent || 0,
    },
    grantDays: promo.grantDays,
    planId: promo.planId,
    discountPercent: promo.discountPercent || 0,
  };
}

/**
 * Apply a promo for a signed-in user.
 * Returns { promo, grantDays, planId } — caller runs setUserAccess.
 */
export async function redeemPromoCode(rawCode, userId) {
  const code = normalizePromoCode(rawCode);
  if (!code) {
    throw Object.assign(new Error('Enter a promo code'), { status: 400 });
  }
  const uid = String(userId || '').trim();
  if (!uid) {
    throw Object.assign(new Error('Sign in to redeem a promo code'), { status: 401 });
  }

  const store = await getPromoCodesStore();
  const idx = store.codes.findIndex((c) => c.code === code);
  if (idx < 0) {
    throw Object.assign(new Error('Invalid promo code'), { status: 404 });
  }
  const promo = store.codes[idx];
  if (!promo.enabled) {
    throw Object.assign(new Error('This promo code is disabled'), { status: 400 });
  }
  if (promo.expiresAt && Date.parse(promo.expiresAt) < Date.now()) {
    throw Object.assign(new Error('This promo code has expired'), { status: 400 });
  }
  if (promo.maxRedemptions != null && promo.usedCount >= promo.maxRedemptions) {
    throw Object.assign(new Error('This promo code has reached its limit'), { status: 400 });
  }
  if (promo.redeemedBy.includes(uid)) {
    throw Object.assign(new Error('You already used this promo code'), { status: 409 });
  }

  promo.redeemedBy.push(uid);
  promo.usedCount = (promo.usedCount || 0) + 1;
  store.codes[idx] = promo;
  await writePromoCodesStore(store, `user:${uid}`);

  return {
    promo: {
      code: promo.code,
      label: promo.label,
      grantDays: promo.grantDays,
      planId: promo.planId,
      discountPercent: promo.discountPercent || 0,
    },
    grantDays: promo.grantDays,
    planId: promo.planId,
    discountPercent: promo.discountPercent || 0,
  };
}
