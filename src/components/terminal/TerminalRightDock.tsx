import {
  Bell,
  CalendarDays,
  ListOrdered,
  Newspaper,
  PanelRight,
  Sparkles,
  Table2,
} from 'lucide-react';
import type { TerminalRightPanel } from '../../services/terminalState';
import TerminalWatchlist from './TerminalWatchlist';

export type RightPanel = TerminalRightPanel;

const DOCK: {
  id: Exclude<RightPanel, null>;
  label: string;
  Icon: typeof ListOrdered;
  ready: boolean;
}[] = [
  { id: 'watchlist', label: 'Watchlist', Icon: ListOrdered, ready: true },
  { id: 'alerts', label: 'Alerts', Icon: Bell, ready: false },
  { id: 'data', label: 'Data Window', Icon: Table2, ready: false },
  { id: 'news', label: 'News', Icon: Newspaper, ready: false },
  { id: 'calendar', label: 'Economic Calendar', Icon: CalendarDays, ready: false },
  { id: 'ideas', label: 'Ideas', Icon: Sparkles, ready: false },
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

/** Right icon rail — TradingView layout; only ready panels open content. */
export default function TerminalRightDock({
  panel,
  onPanelChange,
  symbols,
  activeSymbol,
  onSelect,
  onAdd,
  onRemove,
}: TerminalRightDockProps) {
  const toggle = (id: Exclude<RightPanel, null>, ready: boolean) => {
    if (!ready) return;
    onPanelChange(panel === id ? null : id);
  };

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
          ) : (
            <div className="wolf-term__panel-placeholder">
              <b>{DOCK.find((d) => d.id === panel)?.label}</b>
              <p>Panel scaffolding ready — data wiring next.</p>
            </div>
          )}
        </div>
      ) : null}

      <nav className="wolf-term__dock" aria-label="Terminal panels">
        {DOCK.map(({ id, label, Icon, ready }) => (
          <button
            key={id}
            type="button"
            className={`wolf-term__dock-btn ${panel === id ? 'on' : ''}`}
            title={ready ? label : `${label} (soon)`}
            aria-label={label}
            aria-pressed={panel === id}
            disabled={!ready}
            onClick={() => toggle(id, ready)}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span className="wolf-term__dock-spacer" />
        <button
          type="button"
          className={`wolf-term__dock-btn ${panel ? 'on' : ''}`}
          title={panel ? 'Collapse panel' : 'Open watchlist'}
          onClick={() => onPanelChange(panel ? null : 'watchlist')}
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}
