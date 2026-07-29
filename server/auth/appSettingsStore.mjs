import { getAdminClient, storeError } from './supabaseAdmin.mjs';
import { readJsonFile, writeJsonFile } from './jsonStore.mjs';

const TABLE = 'app_settings';
const FILE = 'app-settings.json';

export const ACCESS_POPUP_KEY = 'access_popup';

export const DEFAULT_ACCESS_POPUP = {
  enabled: true,
  title: 'Request access',
  message:
    'Upload a clear screenshot for the desk. After the admin approves it, Indicators, Analyse AI, and Journal unlock automatically — no payment step required here.',
  url: '',
  buttonLabel: 'Help / instructions',
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

function sanitizePopup(input) {
  const merged = { ...DEFAULT_ACCESS_POPUP, ...(input || {}) };
  const days = Number(merged.defaultGrantDays);
  return {
    enabled: merged.enabled !== false,
    title: String(merged.title || DEFAULT_ACCESS_POPUP.title).slice(0, 120),
    message: String(merged.message || DEFAULT_ACCESS_POPUP.message).slice(0, 600),
    url: String(merged.url || '').trim().slice(0, 500),
    buttonLabel: String(merged.buttonLabel || DEFAULT_ACCESS_POPUP.buttonLabel).slice(0, 40),
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
