import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  getFyersCachedQuote,
  onFyersMarketTicks,
  startFyersSocketClient,
  subscribeFyersMarketSymbols,
  unsubscribeFyersMarketSymbols,
} from '../../services/fyersSocketClient';
import { fetchMarketQuotes } from '../../services/marketApiService';
import { apiSymbolFromTv, tradingViewSymbolLabel } from '../../utils/tradingViewSymbols';
import { searchTerminalSymbols } from '../../services/terminalSymbolCatalog';

type QuoteRow = {
  price: number;
  change: number;
  changePercent: number;
};

export type TerminalWatchlistProps = {
  symbols: string[];
  activeSymbol: string;
  onSelect: (tvSymbol: string) => void;
  onAdd: (tvSymbol: string) => void;
  onRemove: (tvSymbol: string) => void;
};

export default function TerminalWatchlist({
  symbols,
  activeSymbol,
  onSelect,
  onAdd,
  onRemove,
}: TerminalWatchlistProps) {
  const [quotes, setQuotes] = useState<Record<string, QuoteRow>>({});
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const apiSymbols = useMemo(
    () => [...new Set(symbols.map((s) => apiSymbolFromTv(s)))],
    [symbols],
  );

  useEffect(() => {
    if (!apiSymbols.length) return;
    startFyersSocketClient();
    subscribeFyersMarketSymbols(apiSymbols);

    const seed: Record<string, QuoteRow> = {};
    for (const sym of apiSymbols) {
      const c = getFyersCachedQuote(sym);
      if (c?.price) {
        seed[sym] = {
          price: c.price,
          change: c.change ?? 0,
          changePercent: c.changePercent ?? 0,
        };
      }
    }
    if (Object.keys(seed).length) setQuotes((prev) => ({ ...prev, ...seed }));

    const unsub = onFyersMarketTicks((payload) => {
      setQuotes((prev) => {
        const next = { ...prev };
        for (const q of payload.quotes) {
          const key = String(q.symbol || '')
            .toUpperCase()
            .replace(/^NSE:|^BSE:|^MCX:/, '');
          if (!apiSymbols.includes(key) && !apiSymbols.includes(q.symbol.toUpperCase())) continue;
          const dest = apiSymbols.find((s) => s === key || s === q.symbol.toUpperCase()) || key;
          next[dest] = {
            price: q.price,
            change: q.change ?? 0,
            changePercent: q.changePercent ?? 0,
          };
        }
        return next;
      });
    });

    const poll = window.setInterval(() => {
      if (document.hidden) return;
      void fetchMarketQuotes(apiSymbols).then((res) => {
        if (!res?.quotes?.length) return;
        setQuotes((prev) => {
          const next = { ...prev };
          for (const q of res.quotes) {
            const key = String(q.symbol || '')
              .toUpperCase()
              .replace(/^NSE:|^BSE:|^MCX:/, '');
            next[key] = {
              price: q.price,
              change: q.change ?? 0,
              changePercent: q.changePercent ?? 0,
            };
          }
          return next;
        });
      });
    }, 5_000);

    return () => {
      unsub();
      unsubscribeFyersMarketSymbols(apiSymbols);
      window.clearInterval(poll);
    };
  }, [apiSymbols]);

  const addHits = useMemo(() => searchTerminalSymbols(query, 8), [query]);

  return (
    <aside className="wolf-term__watch" aria-label="Watchlist">
      <div className="wolf-term__watch-head">
        <b>Watchlist</b>
        <button
          type="button"
          className="wolf-term__watch-add"
          onClick={() => setAdding((v) => !v)}
          title="Add symbol"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {adding ? (
        <div className="wolf-term__watch-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add symbol…"
            autoFocus
            spellCheck={false}
          />
          <div className="wolf-term__watch-hits">
            {addHits.map((h) => (
              <button
                key={h.tvSymbol}
                type="button"
                disabled={symbols.includes(h.tvSymbol)}
                onClick={() => {
                  onAdd(h.tvSymbol);
                  setQuery('');
                  setAdding(false);
                }}
              >
                <b>{h.label}</b>
                <span>{h.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="wolf-term__watch-list">
        {symbols.map((tv) => {
          const api = apiSymbolFromTv(tv);
          const q = quotes[api];
          const active = tv === activeSymbol;
          const up = (q?.changePercent ?? 0) >= 0;
          return (
            <li key={tv} className={active ? 'on' : ''}>
              <button type="button" className="wolf-term__watch-row" onClick={() => onSelect(tv)}>
                <span className="wolf-term__watch-sym">{tradingViewSymbolLabel(tv)}</span>
                <span className={`wolf-term__watch-px ${up ? 'up' : 'down'}`}>
                  {q?.price != null ? q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
                </span>
                <span className={`wolf-term__watch-chg ${up ? 'up' : 'down'}`}>
                  {q
                    ? `${up ? '+' : ''}${(q.changePercent ?? 0).toFixed(2)}%`
                    : '—'}
                </span>
              </button>
              <button
                type="button"
                className="wolf-term__watch-x"
                title="Remove"
                onClick={() => onRemove(tv)}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
