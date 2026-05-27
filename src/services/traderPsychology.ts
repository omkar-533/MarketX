import type { User } from '../hooks/useAuth';

export interface PsychologyEntry {
  id: string;
  ownerId: string;
  date: string;
  beforeEmotion: string;
  afterEmotion: string;
  confidence: number;
  discipline: number;
  fearGreed: number;
  note: string;
}

const STORAGE_KEY = 'tradeflow_trader_psychology_v1';
const LEGACY_KEY = 'tradeflow_trading_psychology';

type PsychologyStore = Record<string, PsychologyEntry[]>;

function readStore(): PsychologyStore {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PsychologyStore;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return {};

  try {
    const entries = JSON.parse(legacy) as Omit<PsychologyEntry, 'ownerId'>[];
    if (!Array.isArray(entries) || !entries.length) return {};
    const migrated: PsychologyEntry[] = entries.map((e) => ({
      ...e,
      ownerId: 'legacy',
    }));
    const store: PsychologyStore = { legacy: migrated };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return store;
  } catch {
    return {};
  }
}

function writeStore(store: PsychologyStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent('tradeflow-psychology-updated'));
}

export function getOwnerKey(user: User | null): string {
  if (!user) return '';
  return user.id || user.email;
}

export function loadPsychologyForUser(user: User | null): PsychologyEntry[] {
  const key = getOwnerKey(user);
  if (!key) return [];
  const store = readStore();
  return store[key] ?? [];
}

export function savePsychologyForUser(user: User, entries: PsychologyEntry[]) {
  const key = getOwnerKey(user);
  if (!key) return;
  const store = readStore();
  store[key] = entries;
  writeStore(store);
}

export function addPsychologyEntry(
  user: User,
  partial: Omit<PsychologyEntry, 'id' | 'ownerId' | 'date'> & { date?: string },
): PsychologyEntry {
  const entry: PsychologyEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId: getOwnerKey(user),
    date: partial.date ?? new Date().toISOString(),
    beforeEmotion: partial.beforeEmotion.trim(),
    afterEmotion: partial.afterEmotion.trim(),
    confidence: partial.confidence,
    discipline: partial.discipline,
    fearGreed: partial.fearGreed,
    note: partial.note.trim(),
  };
  const next = [entry, ...loadPsychologyForUser(user)];
  savePsychologyForUser(user, next);
  return entry;
}

export function deletePsychologyEntry(user: User, id: string) {
  const next = loadPsychologyForUser(user).filter((e) => e.id !== id);
  savePsychologyForUser(user, next);
}

export function getPsychologyAverages(entries: PsychologyEntry[]) {
  if (!entries.length) {
    return { discipline: 78, confidence: 70, fearGreed: 50 };
  }
  const n = entries.length;
  return {
    discipline: Math.round(entries.reduce((s, e) => s + e.discipline, 0) / n),
    confidence: Math.round(entries.reduce((s, e) => s + e.confidence, 0) / n),
    fearGreed: Math.round(entries.reduce((s, e) => s + e.fearGreed, 0) / n),
  };
}

export function subscribePsychologyUpdates(callback: () => void) {
  const handler = () => callback();
  window.addEventListener('tradeflow-psychology-updated', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('tradeflow-psychology-updated', handler);
    window.removeEventListener('storage', handler);
  };
}
