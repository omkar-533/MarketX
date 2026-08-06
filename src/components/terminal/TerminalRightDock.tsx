import { useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarDays,
  ListOrdered,
  Newspaper,
  Radar,
} from 'lucide-react';
import type { TerminalRightPanel } from '../../services/terminalState';
import { listChartPriceAlerts, CHART_ALERTS_CHANGED_EVENT } from '../../services/chart/chartContextActions';
import {
  TERMINAL_NOTIFICATIONS_CHANGED,
  unreadTerminalNotificationCount,
} from '../../services/terminalNotifications';
import TerminalWatchlist from './TerminalWatchlist';
import TerminalAlertsPanel from './TerminalAlertsPanel';
import TerminalScreenersPanel from './TerminalScreenersPanel';
import TerminalCalendarPanel from './TerminalCalendarPanel';
import TerminalNewsPanel from './TerminalNewsPanel';
import TerminalNotificationsPanel from './TerminalNotificationsPanel';

export type RightPanel = TerminalRightPanel;

const DOCK: {
  id: Exclude<RightPanel, null>;
  label: string;
  short: string;
  Icon: typeof ListOrdered;
}[] = [
  { id: 'watchlist', label: 'Watchlist', short: 'List', Icon: ListOrdered },
  { id: 'alerts', label: 'Alerts', short: 'Alerts', Icon: Bell },
  { id: 'screeners', label: 'Screeners', short: 'Scan', Icon: Radar },
  { id: 'calendar', label: 'Calendar', short: 'Cal', Icon: CalendarDays },
  { id: 'news', label: 'News', short: 'News', Icon: Newspaper },
  { id: 'notifications', label: 'Notifications', short: 'Inbox', Icon: BellRing },
];

export type TerminalRightDockProps = {
  panel: RightPanel;
  onPanelChange: (panel: RightPanel) => void;
  symbols: string[];
  activeSymbol: string;
  onSelect: (tvSymbol: string) => void;
  onAdd: (tvSymbol: string) => void;
  onRemove: (tvSymbol: string) => void;
};

/** Right icon rail — TradingView-style multi-panel dock. */
export default function TerminalRightDock({
  panel,
  onPanelChange,
  symbols,
  activeSymbol,
  onSelect,
  onAdd,
  onRemove,
}: TerminalRightDockProps) {
  const [alertCount, setAlertCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      setAlertCount(listChartPriceAlerts().length);
      setNotifCount(unreadTerminalNotificationCount());
    };
    sync();
    window.addEventListener(CHART_ALERTS_CHANGED_EVENT, sync);
    window.addEventListener(TERMINAL_NOTIFICATIONS_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHART_ALERTS_CHANGED_EVENT, sync);
      window.removeEventListener(TERMINAL_NOTIFICATIONS_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = (id: Exclude<RightPanel, null>) => {
    onPanelChange(panel === id ? null : id);
  };

  const close = () => onPanelChange(null);

  return (
    <div className="wolf-term__right">
      {panel ? (
        <div className="wolf-term__panel">
          {panel === 'watchlist' ? (
            <TerminalWatchlist
              symbols={symbols}
              activeSymbol={activeSymbol}
              onSelect={onSelect}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ) : null}
          {panel === 'alerts' ? (
            <TerminalAlertsPanel activeSymbol={activeSymbol} onSelect={onSelect} onClose={close} />
          ) : null}
          {panel === 'screeners' ? (
            <TerminalScreenersPanel onSelect={onSelect} onClose={close} />
          ) : null}
          {panel === 'calendar' ? (
            <TerminalCalendarPanel onSelect={onSelect} onClose={close} />
          ) : null}
          {panel === 'news' ? <TerminalNewsPanel onClose={close} /> : null}
          {panel === 'notifications' ? (
            <TerminalNotificationsPanel onSelect={onSelect} onClose={close} />
          ) : null}
        </div>
      ) : null}

      <nav className="wolf-term__dock" aria-label="Terminal panels">
        {DOCK.map(({ id, label, short, Icon }) => {
          const badge =
            id === 'alerts' ? alertCount : id === 'notifications' ? notifCount : 0;
          return (
            <button
              key={id}
              type="button"
              className={`wolf-term__dock-btn ${panel === id ? 'on' : ''}`}
              title={label}
              aria-label={label}
              aria-pressed={panel === id}
              onClick={() => toggle(id)}
            >
              <span className="wolf-term__dock-ico">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {badge > 0 ? (
                  <em className="wolf-term__dock-badge">{badge > 9 ? '9+' : badge}</em>
                ) : null}
              </span>
              <span className="wolf-term__dock-label">{short}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
