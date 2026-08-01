import { getAdminClient, storeError } from './supabaseAdmin.mjs';
import { readJsonFile, writeJsonFile } from './jsonStore.mjs';

const TABLE = 'app_settings';
const FILE = 'app-settings.json';

export const ACCESS_POPUP_KEY = 'access_popup';

export const DEFAULT_ACCESS_POPUP = {
  enabled: true,
  title: 'Request access',
  message:
    'Please fill in your name, mobile number, and TradingView ID. Our team will review your request and get back to you within 24 hours.',
  url: '',
  buttonLabel: 'Submit request',
  whatsapp: '',
  defaultGrantDays: 30,
};

async function readSetting(key) {
  const db = getAdminClient();
  if (!db) {
    const raw = readJsonFile(FILE, {});
    return raw?.[key] ?? null;
  }

  const { data, error } = await db.from(TABLE).select('value').eq('key', key).maybeSingle();
  if (error) throw storeError(error);
  return data?.value ?? null;
}

async function writeSetting(key, value, updatedBy) {
  const db = getAdminClient();
  if (!db) {
    const raw = readJsonFile(FILE, {});
    writeJsonFile(FILE, { ...raw, [key]: value });
    return value;
  }

  const { error } = await db.from(TABLE).upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    },
    { onConflict: 'key' },
  );
  if (error) throw storeError(error);
  return value;
}

function looksLikeLegacyPopupCopy(message, buttonLabel, url) {
  const text = `${message || ''} ${buttonLabel || ''} ${url || ''}`.toLowerCase();
  return Boolean(
    url?.trim() ||
      /screenshot|upload a clear|help \/ instructions|open link|google\.form|forms\.gle|client id \/ note|no payment step|payment gateway/i.test(
        text,
      ),
  );
}

function sanitizePopup(input) {
  const merged = { ...DEFAULT_ACCESS_POPUP, ...(input || {}) };
  const days = Number(merged.defaultGrantDays);
  const legacy = looksLikeLegacyPopupCopy(merged.message, merged.buttonLabel, merged.url);
  return {
    enabled: merged.enabled !== false,
    title: String(
      legacy ? DEFAULT_ACCESS_POPUP.title : merged.title || DEFAULT_ACCESS_POPUP.title,
    ).slice(0, 120),
    message: String(
      legacy ? DEFAULT_ACCESS_POPUP.message : merged.message || DEFAULT_ACCESS_POPUP.message,
    ).slice(0, 600),
    // External help links are retired — access is an in-app form now.
    url: '',
    buttonLabel: DEFAULT_ACCESS_POPUP.buttonLabel,
    whatsapp: String(merged.whatsapp || '').trim().slice(0, 40),
    defaultGrantDays: Number.isFinite(days) && days > 0 ? Math.min(3650, Math.round(days)) : 30,
  };
}

export async function getAccessPopup() {
  return sanitizePopup(await readSetting(ACCESS_POPUP_KEY));
}

export async function setAccessPopup(patch, updatedBy) {
  const next = sanitizePopup({ ...(await getAccessPopup()), ...(patch || {}) });
  await writeSetting(ACCESS_POPUP_KEY, next, updatedBy);
  return next;
}

/** What a signed-in (non-admin) user is allowed to see. */
export function publicAccessPopup(popup) {
  return {
    enabled: popup.enabled,
    title: popup.title,
    message: popup.message,
    url: popup.url,
    buttonLabel: popup.buttonLabel,
    whatsapp: popup.whatsapp,
  };
}

/* ────────────────────────── subscription plans catalog ────────────────────────── */

export const SUBSCRIPTION_PLANS_KEY = 'subscription_plans';

const PLAN_IDS = ['trial', 'monthly', 'quarterly', 'yearly'];

const ENV_TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 3);

export const DEFAULT_SUBSCRIPTION_CATALOG = {
  trialDays: Number.isFinite(ENV_TRIAL_DAYS) && ENV_TRIAL_DAYS > 0 ? Math.round(ENV_TRIAL_DAYS) : 3,
  plans: [
    {
      id: 'trial',
      name: 'Free Trial',
      price: 0,
      period: `${Number.isFinite(ENV_TRIAL_DAYS) && ENV_TRIAL_DAYS > 0 ? Math.round(ENV_TRIAL_DAYS) : 3} days free`,
      tagline:
        'Try the desk for a few days — core Wolf AI, Indicators browse, and Journal basics.',
      badge: 'Start here',
      cta: 'Start free trial',
      note: 'No card required · instant access',
      featured: true,
      enabled: true,
      features: [
        'Wolf AI — limited daily questions',
        'Indicators — browse & open invite links',
        'Trading Journal — log up to 20 trades',
        'Trial access · no card needed',
        'Email support only',
      ],
    },
    {
      id: 'monthly',
      name: 'Monthly',
      price: 2999,
      period: 'per month',
      tagline: 'Full access to Wolf AI, Indicators, and Trading Journal — cancel anytime.',
      cta: 'Choose monthly',
      note: 'Cancel anytime from profile',
      featured: false,
      enabled: true,
      features: [
        'Wolf AI — full copilot access',
        'Indicators — browse & open invite links',
        'Trading Journal — unlimited trade logs',
        'All 3 modules unlocked',
        'Standard WhatsApp support',
      ],
    },
    {
      id: 'quarterly',
      name: '3 Months',
      price: 5999,
      period: 'per 3 months',
      equivalent: '≈ ₹2,000 / month',
      tagline:
        'Better rate for 3 months — deeper AI usage, full Indicators library, and journal analytics.',
      badge: 'Best balance',
      save: 'Save ₹2,998',
      cta: 'Choose 3 months',
      note: 'Billed once for 3 months',
      featured: false,
      enabled: true,
      features: [
        'Everything in Monthly',
        'Wolf AI — higher daily limit',
        'Indicators — full library + new drops first',
        'Trading Journal — P&L analytics & tags',
        'Priority WhatsApp support',
      ],
    },
    {
      id: 'yearly',
      name: 'Yearly',
      price: 14999,
      period: 'per year',
      equivalent: '≈ ₹1,250 / month',
      tagline: 'Best value year — max Wolf AI, full Indicators vault, and advanced journal reviews.',
      badge: 'Best value',
      save: 'Save ₹20,989',
      cta: 'Choose yearly',
      note: 'Billed once for 12 months',
      featured: false,
      enabled: true,
      features: [
        'Everything in 3 Months',
        'Wolf AI — highest limits + priority replies',
        'Indicators — full vault + priority invite links',
        'Trading Journal — advanced reviews & exports',
        'VIP WhatsApp support · fastest response',
      ],
    },
  ],
};

function clampStr(value, fallback, max) {
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  return s.slice(0, max);
}

function sanitizeFeatures(input, fallback) {
  const list = Array.isArray(input) ? input : fallback;
  const cleaned = list
    .map((f) => String(f || '').trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 12);
  return cleaned.length ? cleaned : [...fallback];
}

function sanitizePlan(input, defaults) {
  const src = { ...defaults, ...(input || {}) };
  const price = Number(src.price);
  const plan = {
    id: defaults.id,
    name: clampStr(src.name, defaults.name, 60),
    price: Number.isFinite(price) && price >= 0 ? Math.min(10_000_000, Math.round(price)) : defaults.price,
    period: clampStr(src.period, defaults.period, 60),
    tagline: clampStr(src.tagline, defaults.tagline, 280),
    cta: clampStr(src.cta, defaults.cta, 80),
    note: clampStr(src.note, defaults.note, 120),
    featured: src.featured === true,
    enabled: src.enabled !== false,
    features: sanitizeFeatures(src.features, defaults.features),
  };
  const equivalent = String(src.equivalent || '').trim().slice(0, 60);
  const badge = String(src.badge || '').trim().slice(0, 40);
  const save = String(src.save || '').trim().slice(0, 40);
  if (equivalent) plan.equivalent = equivalent;
  if (badge) plan.badge = badge;
  if (save) plan.save = save;
  return plan;
}

export function sanitizeSubscriptionCatalog(input) {
  const defaults = DEFAULT_SUBSCRIPTION_CATALOG;
  const raw = input && typeof input === 'object' ? input : {};
  const days = Number(raw.trialDays);
  const trialDays =
    Number.isFinite(days) && days > 0 ? Math.min(90, Math.round(days)) : defaults.trialDays;

  const byId = new Map(
    (Array.isArray(raw.plans) ? raw.plans : []).map((p) => [String(p?.id || ''), p]),
  );

  const plans = PLAN_IDS.map((id) => {
    const def = defaults.plans.find((p) => p.id === id);
    return sanitizePlan(byId.get(id), def);
  });

  // At most one featured plan (prefer first marked featured among enabled).
  let featuredIdx = plans.findIndex((p) => p.featured && p.enabled);
  if (featuredIdx < 0) featuredIdx = plans.findIndex((p) => p.enabled);
  if (featuredIdx < 0) featuredIdx = 0;
  plans.forEach((p, i) => {
    p.featured = i === featuredIdx;
  });

  return { trialDays, plans };
}

export async function getSubscriptionCatalog() {
  return sanitizeSubscriptionCatalog(await readSetting(SUBSCRIPTION_PLANS_KEY));
}

export async function setSubscriptionCatalog(input, updatedBy) {
  const next = sanitizeSubscriptionCatalog(input);
  await writeSetting(SUBSCRIPTION_PLANS_KEY, next, updatedBy);
  return next;
}

/** Public payload — only enabled plans. */
export function publicSubscriptionCatalog(catalog) {
  const clean = sanitizeSubscriptionCatalog(catalog);
  return {
    trialDays: clean.trialDays,
    plans: clean.plans.filter((p) => p.enabled),
  };
}

export async function getConfiguredTrialDays() {
  const catalog = await getSubscriptionCatalog();
  return catalog.trialDays;
}
