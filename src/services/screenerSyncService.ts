import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User } from '@/hooks/useAuth';
import type { SavedScreener } from '@/types/screener';

const CLOUD_TABLE = 'screener_sync';
const LEGACY_GLOBAL_KEY = 'trafi_saved_scans';
const LOCAL_PREFIX = 'tradeflow_screener_store_v1_';

export type ScreenerSyncResult = {
  ok: boolean;
  message: string;
  source?: 'local' | 'cloud' | 'merged';
};

function userStorageKey(user: User | null): string {
  if (!user) return `${LOCAL_PREFIX}guest`;
  return `${LOCAL_PREFIX}${user.id || user.email}`;
}

export function canCloudSync(user: User | null): boolean {
  if (!isSupabaseConfigured || !user?.id || !user.email) return false;
  return !user.id.startsWith('admin_');
}

function readJsonScreeners(raw: string | null): SavedScreener[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedScreener[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJsonScreeners(key: string, screeners: SavedScreener[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(screeners));
    return true;
  } catch {
    return false;
  }
}

function migrateLegacyGlobal(user: User | null): SavedScreener[] {
  const legacy = readJsonScreeners(localStorage.getItem(LEGACY_GLOBAL_KEY));
  if (!legacy.length || !user) return legacy;
  return legacy.map((s) => ({
    ...s,
    ownerId: user.id,
    createdAt: s.createdAt ?? s.updatedAt ?? new Date().toISOString(),
  }));
}

export function loadLocalScreeners(user: User | null): SavedScreener[] {
  const key = userStorageKey(user);
  const current = readJsonScreeners(localStorage.getItem(key));
  if (current.length > 0) return current;

  const migrated = migrateLegacyGlobal(user);
  if (migrated.length > 0) {
    saveJsonScreeners(key, migrated);
    localStorage.removeItem(LEGACY_GLOBAL_KEY);
  }
  return migrated;
}

export function persistLocalScreeners(user: User | null, screeners: SavedScreener[]): boolean {
  return saveJsonScreeners(userStorageKey(user), screeners);
}

export function mergeScreenerLists(local: SavedScreener[], remote: SavedScreener[]): SavedScreener[] {
  const map = new Map<string, SavedScreener>();

  for (const s of remote) {
    map.set(s.id, s);
  }

  for (const s of local) {
    const existing = map.get(s.id);
    if (!existing) {
      map.set(s.id, s);
      continue;
    }
    const localAt = new Date(s.updatedAt).getTime();
    const remoteAt = new Date(existing.updatedAt).getTime();
    map.set(s.id, localAt >= remoteAt ? s : existing);
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function pullCloudScreeners(user: User): Promise<SavedScreener[] | null> {
  if (!canCloudSync(user)) return null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('screeners, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116' || error.code === '42P01') return null;
    console.warn('Screener cloud pull:', error.message);
    return null;
  }

  if (!data?.screeners) return [];
  return Array.isArray(data.screeners) ? (data.screeners as SavedScreener[]) : [];
}

export async function pushCloudScreeners(
  user: User,
  screeners: SavedScreener[],
): Promise<ScreenerSyncResult> {
  if (!canCloudSync(user)) {
    return { ok: true, message: 'Saved on this device', source: 'local' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: true, message: 'Saved on this device', source: 'local' };

  const { error } = await supabase.from(CLOUD_TABLE).upsert(
    {
      user_id: user.id,
      screeners,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    return { ok: false, message: `Cloud save failed: ${error.message}`, source: 'local' };
  }

  return { ok: true, message: 'Saved to your account', source: 'cloud' };
}

export async function autoSyncScreeners(
  user: User | null,
  screeners: SavedScreener[],
): Promise<ScreenerSyncResult> {
  if (!user) {
    persistLocalScreeners(null, screeners);
    return { ok: true, message: 'Saved locally — login to sync across devices', source: 'local' };
  }

  const stamped = screeners.map((s) => ({
    ...s,
    ownerId: user.id,
  }));

  const saved = persistLocalScreeners(user, stamped);
  if (!saved) {
    return { ok: false, message: 'Could not save (storage full?)' };
  }

  const cloud = await pushCloudScreeners(user, stamped);
  return cloud;
}

export async function hydrateScreenerFromCloud(user: User | null): Promise<SavedScreener[]> {
  const local = loadLocalScreeners(user);
  if (!user || !canCloudSync(user)) return local;

  const remote = await pullCloudScreeners(user);
  if (remote === null) return local;

  const merged = remote.length ? mergeScreenerLists(local, remote) : local;
  persistLocalScreeners(user, merged);
  return merged;
}
