/**
 * Terminal right-dock notifications (TradingView-style activity feed).
 */

export type TerminalNotificationKind = 'alert' | 'screener' | 'news' | 'system' | 'calendar';

export type TerminalNotification = {
  id: string;
  kind: TerminalNotificationKind;
  title: string;
  body: string;
  symbol?: string;
  createdAt: string;
  read: boolean;
};

const KEY = 'wolf.terminal.notifications';
export const TERMINAL_NOTIFICATIONS_CHANGED = 'wolf:terminal-notifications-changed';

function emit() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TERMINAL_NOTIFICATIONS_CHANGED));
}

function read(): TerminalNotification[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TerminalNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(next: TerminalNotification[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, 120)));
  } catch {
    /* quota */
  }
  emit();
}

export function listTerminalNotifications(): TerminalNotification[] {
  return read();
}

export function unreadTerminalNotificationCount(): number {
  return read().filter((n) => !n.read).length;
}

export function pushTerminalNotification(
  input: Omit<TerminalNotification, 'id' | 'createdAt' | 'read'> & { read?: boolean },
): TerminalNotification {
  const row: TerminalNotification = {
    id: `tn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    read: input.read ?? false,
    kind: input.kind,
    title: input.title,
    body: input.body,
    symbol: input.symbol,
  };
  write([row, ...read()]);
  return row;
}

export function markTerminalNotificationRead(id: string): void {
  write(read().map((n) => (n.id === id ? { ...n, read: true } : n)));
}

export function markAllTerminalNotificationsRead(): void {
  write(read().map((n) => ({ ...n, read: true })));
}

export function clearTerminalNotifications(): void {
  write([]);
}
