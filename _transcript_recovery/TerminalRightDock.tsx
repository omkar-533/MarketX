import {
  Bell,
  CalendarDays,
  Layers,
  ListOrdered,
  MessageSquare,
  Newspaper,
  PanelRight,
  Sparkles,
  Table2,
} from 'lucide-react';
import TerminalWatchlist from './TerminalWatchlist';

export type RightPanel = 'watchlist' | 'alerts' | 'data' | 'news' | 'calendar' | 'ideas' | null;

const DOCK: {
  id: Exclude<RightPanel, null>;
  label: string;
  Icon: typeof ListOrdered;
}[] = [
  { id: 'watchlist', label: 'Watchlist', Icon: ListOrdered },
  { id: 'alerts', label: 'Alerts', Icon: Bell },
  { id: 'data', label: 'Data window', Icon: Table2 },
  { id: 'news', label: 'News', Icon: Newspaper },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'ideas', label: 'Ideas', Icon: Sparkles },
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

export default function TerminalRightDock({
  panel,
  onPanelChange,
  symbols,
  activeSymbol,
  onSelect,
  onAdd,
  onRemove,
}: TerminalRightDockProps) {
  const toggle = (id: Exclude<RightPanel, null>) => {
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
              <p>Coming in a later phase — panel chrome is ready.</p>
            </div>
          )}
        </div>
      ) : null}

      <nav className="wolf-term__dock" aria-label="Terminal panels">
        {DOCK.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`wolf-term__dock-btn ${panel === id ? 'on' : ''}`}
            title={label}
            aria-label={label}
            aria-pressed={panel === id}
            onClick={() => toggle(id)}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span className="wolf-term__dock-spacer" />
        <button
          type="button"
          className="wolf-term__dock-btn"
          title="Object tree"
          aria-label="Object tree"
          disabled
        >
          <Layers className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`wolf-term__dock-btn ${panel ? 'on' : ''}`}
          title={panel ? 'Collapse panel' : 'Open watchlist'}
          onClick={() => onPanelChange(panel ? null : 'watchlist')}
        >
          <PanelRight className="h-4 w-4" />
        </button>
        <button type="button" className="wolf-term__dock-btn" title="Chat" disabled>
          <MessageSquare className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}
