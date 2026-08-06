import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Trash2 } from 'lucide-react';
import {
  clearTerminalNotifications,
  listTerminalNotifications,
  markAllTerminalNotificationsRead,
  markTerminalNotificationRead,
  TERMINAL_NOTIFICATIONS_CHANGED,
  type TerminalNotification,
} from '../../services/terminalNotifications';
import { tradingViewSymbolLabel } from '../../utils/tradingViewSymbols';
import TerminalPanelChrome from './TerminalPanelChrome';

export type TerminalNotificationsPanelProps = {
  onSelect: (tvSymbol: string) => void;
  onClose: () => void;
};

const KIND_LABEL: Record<TerminalNotification['kind'], string> = {
  alert: 'Alert',
  screener: 'Screener',
  news: 'News',
  system: 'System',
  calendar: 'Calendar',
};

export default function TerminalNotificationsPanel({
  onSelect,
  onClose,
}: TerminalNotificationsPanelProps) {
  const [rows, setRows] = useState<TerminalNotification[]>(() => listTerminalNotifications());

  const refresh = useCallback(() => setRows(listTerminalNotifications()), []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(TERMINAL_NOTIFICATIONS_CHANGED, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(TERMINAL_NOTIFICATIONS_CHANGED, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  return (
    <TerminalPanelChrome
      title="Notifications"
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            className="wolf-term__rp-icon-btn"
            title="Mark all read"
            onClick={() => {
              markAllTerminalNotificationsRead();
              refresh();
            }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="wolf-term__rp-icon-btn"
            title="Clear all"
            onClick={() => {
              clearTerminalNotifications();
              refresh();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      }
    >
      <ul className="wolf-term__rp-list">
        {rows.length ? (
          rows.map((n) => (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              <button
                type="button"
                className="wolf-term__rp-row"
                onClick={() => {
                  markTerminalNotificationRead(n.id);
                  refresh();
                  if (n.symbol) onSelect(n.symbol);
                }}
              >
                <span className="wolf-term__rp-row-main">
                  <b>
                    {!n.read ? <i className="wolf-term__dot" /> : null}
                    <i className="wolf-term__pill wolf-term__pill--muted">{KIND_LABEL[n.kind]}</i>
                    {n.title}
                  </b>
                  <em>
                    {n.body}
                    {n.symbol ? ` · ${tradingViewSymbolLabel(n.symbol)}` : ''}
                  </em>
                </span>
                <span className="wolf-term__rp-row-meta">
                  {new Date(n.createdAt).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </button>
            </li>
          ))
        ) : (
          <div className="wolf-term__rp-empty">
            No notifications yet. Alerts, screeners, and news will land here.
          </div>
        )}
      </ul>
    </TerminalPanelChrome>
  );
}
