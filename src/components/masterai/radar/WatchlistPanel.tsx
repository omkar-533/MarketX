import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Bookmark, Search, Sparkles, Trash2 } from 'lucide-react';
import WatchlistLimitPopup from './WatchlistLimitPopup';
import {
  addSymbolToWatchlist,
  loadLastResults,
  loadWatchlist,
  removeFromWatchlist,
  WATCHLIST_LIMIT,
} from '../../../services/radar/radarStore';
import { requestOpenLiveWolf } from '../../../services/live/liveBridge';
import {
  searchTerminalSymbols,
  type TerminalSymbolHit,
} from '../../../services/terminalSymbolCatalog';
import type { WatchlistItem } from '../../../services/radar/radarTypes';
import AppLink from '../../AppLink';
import { liveWolfQuery } from '../../../utils/appNav';

type Props = {
  onAnalyze: () => void;
  onOpenRadar: () => void;
};

const INDIAN_EXCHANGES = new Set(['NSE', 'BSE']);
const MAX_SUGGESTIONS = 60;

function isIndianEquity(hit: TerminalSymbolHit) {
  return INDIAN_EXCHANGES.has(String(hit.exchange || '').toUpperCase());
}

/** Searchable picker that appends a plain symbol to the watchlist. */
function AddSymbolBox({
  count,
  onAdd,
}: {
  count: number;
  onAdd: (symbol: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(
    () => searchTerminalSymbols(query, MAX_SUGGESTIONS, 'stocks').filter(isIndianEquity),
    [query],
  );

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (hit: TerminalSymbolHit) => {
    onAdd(hit.label);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(hits[Math.min(highlight, hits.length - 1)]);
    }
  };

  return (
    <div className="wolf-watch-add" ref={boxRef}>
      <div className="wolf-watch-add__field">
        <Search size={15} />
        <input
          type="text"
          value={query}
          placeholder="Add to watchlist — type a stock name"
          aria-label="Add a stock to the watchlist"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <span className="wolf-watch-add__count">
          {count}/{WATCHLIST_LIMIT}
        </span>
      </div>

      {open ? (
        <div className="wolf-watch-add__menu" role="listbox">
          {hits.length ? (
            hits.map((hit, i) => (
              <button
                key={hit.tvSymbol}
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`wolf-watch-add__row${i === highlight ? ' is-on' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(hit)}
              >
                <span className="wolf-watch-add__sym">{hit.label}</span>
                <span className="wolf-watch-add__name">{hit.name}</span>
                <span className="wolf-watch-add__exch">{hit.exchange}</span>
              </button>
            ))
          ) : (
            <p className="wolf-watch-add__none">No stock matches “{query}”</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function WatchlistPanel({ onAnalyze, onOpenRadar }: Props) {
  const [items, setItems] = useState<WatchlistItem[]>(() => loadWatchlist());
  const [limitHit, setLimitHit] = useState(false);

  const add = (symbol: string) => {
    const res = addSymbolToWatchlist(symbol);
    if (res.limitReached) {
      setLimitHit(true);
      return;
    }
    setItems(res.items);
  };

  /**
   * Always hand the symbol to Live Wolf, which starts its own session on arrival.
   * A manually added name has no scan behind it, so seeding is best-effort only.
   */
  const analyze = (item: WatchlistItem) => {
    const cached = loadLastResults().find((r) => r.symbol === item.symbol || r.id === item.resultId);
    requestOpenLiveWolf({
      symbol: item.symbol,
      exchange: cached?.exchange || 'NSE',
      timeframe: cached?.timeframe || '5m',
      seedResult: cached || null,
    });
    onAnalyze();
  };

  const header = (
    <header className="wolf-radar-desk__header">
      <div className="wolf-radar-desk__brand">
        <div className="wolf-radar-desk__title-row">
          <Bookmark size={18} className="text-gold" />
          <h1>WATCHLIST</h1>
        </div>
        <p className="wolf-radar-desk__subtitle">
          {items.length ? `${items.length} symbols under watch` : 'Nothing under watch yet'}
        </p>
      </div>
      <AddSymbolBox count={items.length} onAdd={add} />
    </header>
  );

  const limitPopup = limitHit ? <WatchlistLimitPopup onClose={() => setLimitHit(false)} /> : null;

  if (!items.length) {
    return (
      <div className="wolf-radar-desk wolf-radar-desk--panel">
        {header}
        <div className="wolf-radar-desk__empty">
          <p>Watchlist is empty</p>
          <span>Search a stock above, or scan the market and keep only the charts worth your attention.</span>
          <AppLink to="wolf-radar" className="wolf-radar-desk__scan-btn" onActivate={onOpenRadar}>
            OPEN WOLF RADAR
          </AppLink>
        </div>
        {limitPopup}
      </div>
    );
  }

  return (
    <div className="wolf-radar-desk wolf-radar-desk--panel">
      {header}

      <div className="wolf-radar-desk__cards">
        {items.map((item) => (
          <article key={item.symbol} className="wolf-radar-desk__card">
            <div className="wolf-radar-desk__card-main" style={{ cursor: 'default' }}>
              <div className="wolf-radar-desk__card-top">
                <div>
                  <h3>{item.symbol}</h3>
                  <span className="price">
                    {item.setupType || 'Watching'}
                    {item.status ? ` · ${item.status}` : ''}
                  </span>
                </div>
                {typeof item.score === 'number' && (
                  <div className="score">
                    <b>{item.score}</b>
                    <small>/100</small>
                  </div>
                )}
              </div>
              <time>
                Added {new Date(item.addedAt).toLocaleString('en-IN')}
                {item.lastDetectedAt
                  ? ` · Last detected ${new Date(item.lastDetectedAt).toLocaleTimeString('en-IN')}`
                  : ''}
              </time>
            </div>
            <div className="wolf-radar-desk__card-actions">
              <AppLink
                to="live-wolf"
                query={liveWolfQuery({ symbol: item.symbol })}
                className="primary"
                onActivate={() => analyze(item)}
              >
                <Sparkles size={14} /> ANALYZE
              </AppLink>
              <button
                type="button"
                className="ghost"
                onClick={() => setItems(removeFromWatchlist(item.symbol))}
              >
                <Trash2 size={14} /> REMOVE
              </button>
            </div>
          </article>
        ))}
      </div>

      {limitPopup}
    </div>
  );
}
