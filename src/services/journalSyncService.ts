import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User } from '@/hooks/useAuth';
import type { TradeRecord } from '@/types/journal';

const CLOUD_TABLE = 'journal_sync';
const LEGACY_GLOBAL_KEY = 'tradeflow_journal_store_v2';
const LEGACY_GLOBAL_KEY_OLD = 'tradeflow_journal_store';
const LOCAL_PREFIX = 'tradeflow_journal_store_v3_';

export type SyncResult = {
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

function readJsonTrades(raw: string | null): TradeRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TradeRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJsonTrades(key: string, trades: TradeRecord[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(trades));
    return true;
  } catch {
    try {
      const withoutScreenshots = trades.map((t) => ({ ...t, screenshot: undefined }));
      localStorage.setItem(key, JSON.stringify(withoutScreenshots));
      return true;
    } catch {
      return false;
    }
  }
}

export function loadLocalTrades(user: User | null): TradeRecord[] {
  const key = userStorageKey(user);
  const current = readJsonTrades(localStorage.getItem(key));
  if (current.length > 0) return current;

  const legacy = readJsonTrades(localStorage.getItem(LEGACY_GLOBAL_KEY));
  const legacyOld = legacy.length ? legacy : readJsonTrades(localStorage.getItem(LEGACY_GLOBAL_KEY_OLD));

  if (!legacyOld.length || !user) return legacyOld;

  const migrated = legacyOld.filter(
    (t) =>
      t.ownerId === user.id ||
      t.ownerId === user.email ||
      t.ownerEmail?.toLowerCase() === user.email?.toLowerCase(),
  );

  if (migrated.length > 0) {
    saveJsonTrades(key, migrated);
  }

  return migrated;
}

export function persistLocalTrades(user: User | null, trades: TradeRecord[]): boolean {
  return saveJsonTrades(userStorageKey(user), trades);
}

export function mergeTradeLists(local: TradeRecord[], remote: TradeRecord[]): TradeRecord[] {
  const map = new Map<string, TradeRecord>();

  for (const trade of remote) {
    map.set(trade.id, trade);
  }

  for (const trade of local) {
    const existing = map.get(trade.id);
    if (!existing) {
      map.set(trade.id, trade);
      continue;
    }
    const localAt = new Date(trade.updatedAt || trade.createdAt).getTime();
    const remoteAt = new Date(existing.updatedAt || existing.createdAt).getTime();
    map.set(trade.id, localAt >= remoteAt ? trade : existing);
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export async function pullCloudTrades(user: User): Promise<TradeRecord[] | null> {
  if (!canCloudSync(user)) return null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('trades, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116' || error.code === '42P01') return null;
    console.warn('Journal cloud pull:', error.message);
    return null;
  }

  if (!data?.trades) return [];
  return Array.isArray(data.trades) ? (data.trades as TradeRecord[]) : [];
}

export async function pushCloudTrades(user: User, trades: TradeRecord[]): Promise<SyncResult> {
  if (!canCloudSync(user)) {
    return { ok: true, message: 'Saved locally', source: 'local' };
  }

  const payload = trades.map((t) => ({
    ...t,
    screenshot: undefined,
  }));

  const supabase = getSupabase();
  if (!supabase) return { ok: true, message: 'Saved locally', source: 'local' };

  const { error } = await supabase.from(CLOUD_TABLE).upsert(
    {
      user_id: user.id,
      trades: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    return { ok: false, message: `Cloud sync failed: ${error.message}`, source: 'local' };
  }

  return { ok: true, message: 'Saved to cloud', source: 'cloud' };
}

export async function autoSyncJournal(
  user: User | null,
  trades: TradeRecord[],
): Promise<SyncResult> {
  if (!user) {
    return { ok: false, message: 'Login required to sync' };
  }

  const saved = persistLocalTrades(user, trades);
  if (!saved) {
    return { ok: false, message: 'Local save failed (storage full?)' };
  }

  const cloud = await pushCloudTrades(user, trades);
  if (cloud.ok && cloud.source === 'cloud') {
    return {
      ok: true,
      message: `Synced • ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
      source: 'cloud',
    };
  }

  return {
    ok: saved,
    message: `Saved locally • ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
    source: 'local',
  };
}

export async function hydrateJournalFromCloud(user: User | null): Promise<TradeRecord[]> {
  const local = loadLocalTrades(user);
  if (!user || !canCloudSync(user)) return local;

  const remote = await pullCloudTrades(user);
  if (remote === null) return local;

  const merged = remote.length ? mergeTradeLists(local, remote) : local;
  persistLocalTrades(user, merged);
  return merged;
}
