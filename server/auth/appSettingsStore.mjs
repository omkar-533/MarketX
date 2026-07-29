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
