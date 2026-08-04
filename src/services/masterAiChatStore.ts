/** Multi-chat history for Wolf AI — localStorage, no server. */

import { sanitizeLevels, type ChartLevel } from '../utils/chartAnnotations';
import { TV_STUDY_PRESETS, TV_TIMEFRAMES, type TvInterval } from '../utils/tradingViewSymbols';

/** A live chart pinned into the conversation. */
export interface ChatChartAttachment {
  symbol: string;
  interval: TvInterval;
  study: string;
  /** Areas of interest Wolf AI marked up alongside its answer. */
  levels?: ChartLevel[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'trafi';
  text: string;
  timestamp: Date;
  imageUrl?: string;
  chart?: ChatChartAttachment;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChatSession extends ChatSessionMeta {
  messages: ChatMessage[];
}

interface StoredMessage {
  id: string;
  role: 'user' | 'trafi';
  text: string;
  timestamp?: string;
  chart?: ChatChartAttachment;
}

interface StoredSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: StoredMessage[];
}

interface ChatStore {
  activeId: string;
  sessions: StoredSession[];
}

const LEGACY_KEY = 'master_ai_chat_memory_v1';
const STORE_KEY = 'master_ai_chat_sessions_v2';
const MSG_MAX = 40;
const SESSION_MAX = 40;

function newId(prefix = 'chat'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(text: string): string {
  return String(text || '')
    .replace(/\bGemini(?:’s|'s)?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 4000);
}

function hydrateChart(chart: unknown): ChatChartAttachment | undefined {
  if (!chart || typeof chart !== 'object') return undefined;
  const { symbol, interval, study, levels } = chart as Partial<ChatChartAttachment>;
  if (typeof symbol !== 'string' || !symbol.trim()) return undefined;
  const restored = sanitizeLevels(levels);
  return {
    symbol: symbol.trim().toUpperCase().slice(0, 40),
    interval: TV_TIMEFRAMES.some((tf) => tf.id === interval) ? (interval as TvInterval) : '15',
    study: TV_STUDY_PRESETS.some((s) => s.id === study) ? (study as string) : 'none',
    ...(restored.length ? { levels: restored } : {}),
  };
}

function hydrateMessage(m: StoredMessage): ChatMessage | null {
  if (!m || (m.role !== 'user' && m.role !== 'trafi') || typeof m.text !== 'string') return null;
  const text = cleanText(m.text);
  const chart = hydrateChart(m.chart);
  // Chart cards carry no text of their own.
  if (!text && !chart) return null;
  return {
    id: m.id || newId('msg'),
    role: m.role,
    text,
    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
    ...(chart ? { chart } : {}),
  };
}

function dehydrateMessages(msgs: ChatMessage[]): StoredMessage[] {
  return msgs
    .filter((m) => m.id !== 'welcome')
    .slice(-MSG_MAX)
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text.slice(0, 4000),
      timestamp: m.timestamp.toISOString(),
      ...(m.chart ? { chart: m.chart } : {}),
    }));
}

export function makeWelcomeMessage(text: string): ChatMessage {
  return {
    id: 'welcome',
    role: 'trafi',
    text,
    timestamp: new Date(),
  };
}

export function titleFromMessages(msgs: ChatMessage[]): string {
  const firstUser = msgs.find((m) => m.role === 'user' && m.id !== 'welcome' && m.text.trim());
  if (!firstUser) return 'New chat';
  const t = firstUser.text.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

function hasRealTurns(msgs: ChatMessage[]): boolean {
  return msgs.some((m) => m.id !== 'welcome' && m.role === 'user' && m.text.trim().length > 0);
}

function readRawStore(): ChatStore | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatStore;
    if (!parsed?.activeId || !Array.isArray(parsed.sessions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(store: ChatStore) {
  if (typeof window === 'undefined') return;
  try {
    const slim: ChatStore = {
      activeId: store.activeId,
      sessions: store.sessions.slice(0, SESSION_MAX).map((s) => ({
        id: s.id,
        title: s.title.slice(0, 80),
        updatedAt: s.updatedAt,
        messages: (s.messages || []).slice(-MSG_MAX),
      })),
    };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(slim));
  } catch {
    /* quota / private mode */
  }
}

function migrateLegacy(welcome: ChatMessage): ChatStore {
  let messages: ChatMessage[] = [welcome];
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredMessage[];
      if (Array.isArray(parsed) && parsed.length) {
        const restored = parsed.map(hydrateMessage).filter(Boolean) as ChatMessage[];
        if (restored.length) messages = restored;
      }
    }
  } catch {
    /* ignore */
  }
  const id = newId();
  const store: ChatStore = {
    activeId: id,
    sessions: [
      {
        id,
        title: titleFromMessages(messages),
        updatedAt: new Date().toISOString(),
        messages: dehydrateMessages(messages),
      },
    ],
  };
  writeStore(store);
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return store;
}

function ensureStore(welcome: ChatMessage): ChatStore {
  const existing = readRawStore();
  if (existing && existing.sessions.length > 0) {
    if (!existing.sessions.some((s) => s.id === existing.activeId)) {
      existing.activeId = existing.sessions[0].id;
    }
    return existing;
  }
  if (typeof window !== 'undefined' && window.localStorage.getItem(LEGACY_KEY)) {
    return migrateLegacy(welcome);
  }
  const id = newId();
  const store: ChatStore = {
    activeId: id,
    sessions: [
      {
        id,
        title: 'New chat',
        updatedAt: new Date().toISOString(),
        messages: [],
      },
    ],
  };
  writeStore(store);
  return store;
}

function sessionMessages(session: StoredSession | undefined, welcome: ChatMessage): ChatMessage[] {
  if (!session?.messages?.length) return [welcome];
  const restored = session.messages.map(hydrateMessage).filter(Boolean) as ChatMessage[];
  return restored.length ? restored : [welcome];
}

/** Load active chat messages + session list for UI. */
export function loadActiveChat(welcomeText: string): {
  activeId: string;
  messages: ChatMessage[];
  sessions: ChatSessionMeta[];
} {
  const welcome = makeWelcomeMessage(welcomeText);
  const store = ensureStore(welcome);
  const active = store.sessions.find((s) => s.id === store.activeId) ?? store.sessions[0];
  return {
    activeId: active.id,
    messages: sessionMessages(active, welcome),
    sessions: listMeta(store),
  };
}

function listMeta(store: ChatStore): ChatSessionMeta[] {
  return [...store.sessions]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((s) => ({
      id: s.id,
      title: s.title || 'New chat',
      updatedAt: s.updatedAt,
    }));
}

/** Persist current thread into the active session. */
export function persistActiveChat(
  activeId: string,
  messages: ChatMessage[],
): ChatSessionMeta[] {
  const welcome = makeWelcomeMessage('');
  const store = ensureStore(welcome);
  const idx = store.sessions.findIndex((s) => s.id === activeId);
  const payload: StoredSession = {
    id: activeId,
    title: titleFromMessages(messages),
    updatedAt: new Date().toISOString(),
    messages: dehydrateMessages(messages),
  };
  if (idx >= 0) store.sessions[idx] = payload;
  else store.sessions.unshift(payload);
  store.activeId = activeId;
  // Drop empty "New chat" shells except the active one
  store.sessions = store.sessions.filter(
    (s) => s.id === activeId || (s.messages && s.messages.some((m) => m.role === 'user')),
  );
  writeStore(store);
  return listMeta(store);
}

/**
 * Start a fresh chat disconnected from previous context.
 * Saves the current thread first if it has user turns.
 */
export function startNewChat(
  activeId: string,
  currentMessages: ChatMessage[],
  welcomeText: string,
): { activeId: string; messages: ChatMessage[]; sessions: ChatSessionMeta[] } {
  const welcome = makeWelcomeMessage(welcomeText);
  const store = ensureStore(welcome);

  if (hasRealTurns(currentMessages)) {
    const idx = store.sessions.findIndex((s) => s.id === activeId);
    const saved: StoredSession = {
      id: activeId,
      title: titleFromMessages(currentMessages),
      updatedAt: new Date().toISOString(),
      messages: dehydrateMessages(currentMessages),
    };
    if (idx >= 0) store.sessions[idx] = saved;
    else store.sessions.unshift(saved);
  } else {
    // Replace empty shell instead of stacking blank chats
    store.sessions = store.sessions.filter((s) => s.id !== activeId);
  }

  const id = newId();
  store.activeId = id;
  store.sessions.unshift({
    id,
    title: 'New chat',
    updatedAt: new Date().toISOString(),
    messages: [],
  });
  store.sessions = store.sessions.slice(0, SESSION_MAX);
  writeStore(store);

  return {
    activeId: id,
    messages: [welcome],
    sessions: listMeta(store),
  };
}

/** Switch to an older chat — persists current first. */
export function switchChat(
  fromId: string,
  currentMessages: ChatMessage[],
  toId: string,
  welcomeText: string,
): { activeId: string; messages: ChatMessage[]; sessions: ChatSessionMeta[] } | null {
  const welcome = makeWelcomeMessage(welcomeText);
  const store = ensureStore(welcome);
  const target = store.sessions.find((s) => s.id === toId);
  if (!target) return null;

  if (fromId !== toId) {
    if (hasRealTurns(currentMessages)) {
      const idx = store.sessions.findIndex((s) => s.id === fromId);
      const saved: StoredSession = {
        id: fromId,
        title: titleFromMessages(currentMessages),
        updatedAt: new Date().toISOString(),
        messages: dehydrateMessages(currentMessages),
      };
      if (idx >= 0) store.sessions[idx] = saved;
      else store.sessions.unshift(saved);
    } else {
      store.sessions = store.sessions.filter((s) => s.id !== fromId);
    }
  }

  store.activeId = toId;
  writeStore(store);

  return {
    activeId: toId,
    messages: sessionMessages(target, welcome),
    sessions: listMeta(store),
  };
}

export function deleteChat(
  activeId: string,
  deleteId: string,
  welcomeText: string,
): { activeId: string; messages: ChatMessage[]; sessions: ChatSessionMeta[] } {
  const welcome = makeWelcomeMessage(welcomeText);
  const store = ensureStore(welcome);
  store.sessions = store.sessions.filter((s) => s.id !== deleteId);

  if (store.sessions.length === 0) {
    const id = newId();
    store.activeId = id;
    store.sessions = [
      {
        id,
        title: 'New chat',
        updatedAt: new Date().toISOString(),
        messages: [],
      },
    ];
    writeStore(store);
    return { activeId: id, messages: [welcome], sessions: listMeta(store) };
  }

  if (activeId === deleteId) {
    const next = store.sessions[0];
    store.activeId = next.id;
    writeStore(store);
    return {
      activeId: next.id,
      messages: sessionMessages(next, welcome),
      sessions: listMeta(store),
    };
  }

  writeStore(store);
  const active = store.sessions.find((s) => s.id === activeId) ?? store.sessions[0];
  return {
    activeId: active.id,
    messages: sessionMessages(active, welcome),
    sessions: listMeta(store),
  };
}

export function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}
