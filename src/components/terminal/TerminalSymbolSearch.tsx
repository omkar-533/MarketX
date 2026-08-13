import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  searchTerminalSymbols,
  terminalCategoryCounts,
  type TerminalSymbolCategory,
  type TerminalSymbolHit,
} from '../../services/terminalSymbolCatalog';
import { parseTradingViewInput, tradingViewSymbolLabel } from '../../utils/tradingViewSymbols';

const TABS: { id: TerminalSymbolCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'futures', label: 'Futures' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'indices', label: 'Indices' },
  { id: 'options', label: 'Options' },
];

export type TerminalSymbolSearchProps = {
  open: boolean;
  activeSymbol: string;
  onClose: () => void;
  onPick: (tvSymbol: string) => void;
};

export default function TerminalSymbolSearch({
  open,
  activeSymbol,
  onClose,
  onPick,
}: TerminalSymbolSearchProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TerminalSymbolCategory>('all');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => terminalCategoryCounts(), []);

  const hits = useMemo(
    () => searchTerminalSymbols(query, 80, category),
    [query, category],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCategory('all');
    setHighlight(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, category]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pick = (hit: TerminalSymbolHit) => {
    onPick(hit.tvSymbol);
    onClose();
  };

  const submitRaw = () => {
    const raw = query.trim();
    if (!raw) return;
    if (hits[highlight]) {
      pick(hits[highlight]);
      return;
    }
    onPick(parseTradingViewInput(raw));
    onClose();
  };

  const activeLabel = tradingViewSymbolLabel(activeSymbol).toUpperCase();

  return (
    <div
      className="wolf-term__sym-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="wolf-term__sym-modal"
        role="dialog"
        aria-label="Symbol search"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wolf-term__sym-head">
          <b>Search symbol</b>
          <button type="button" className="wolf-term__icon-btn" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="wolf-term__sym-search"
          onSubmit={(e) => {
            e.preventDefault();
            submitRaw();
          }}
        >
          <Search className="h-4 w-4" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, Math.max(0, hits.length - 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(0, h - 1));
              }
            }}
            placeholder="Symbol or company name"
            spellCheck={false}
            autoComplete="off"
          />
        </form>

        <div className="wolf-term__sym-tabs" role="tablist" aria-label="Asset class">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={category === tab.id}
              className={category === tab.id ? 'on' : ''}
              title={
                tab.id === 'bonds' || tab.id === 'economy'
                  ? 'Coming soon'
                  : `${counts[tab.id].toLocaleString()} symbols`
              }
              onClick={() => setCategory(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="wolf-term__sym-list" role="listbox">
          {hits.length === 0 ? (
            <div className="wolf-term__sym-empty">
              No match — press Enter to open <b>{query.trim() || 'raw symbol'}</b>
            </div>
          ) : (
            hits.map((hit, i) => {
              const on = i === highlight || hit.label.toUpperCase() === activeLabel;
              return (
                <button
                  key={`${hit.group}-${hit.tvSymbol}-${hit.label}`}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`wolf-term__sym-row ${on ? 'on' : ''}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(hit)}
                >
                  <span className="wolf-term__sym-ico" data-ex={hit.exchange} aria-hidden>
                    {hit.label.slice(0, 1)}
                  </span>
                  <span className="wolf-term__sym-ticker">
                    <b>{hit.label}</b>
                    <em>{hit.name}</em>
                  </span>
                  <span className="wolf-term__sym-meta">
                    <span className="wolf-term__sym-type">{hit.typeLabel}</span>
                    <span className="wolf-term__sym-ex">{hit.exchange}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
