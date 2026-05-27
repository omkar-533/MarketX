import { memo, useMemo } from 'react';
import { Search, Star } from 'lucide-react';
import { FNO_UNIVERSE } from '../../data/fnoUniverse';

const SIDEBAR_CAP = 120;

type SymbolSidebarProps = {
  open: boolean;
  fullscreen: boolean;
  symbol: string;
  search: string;
  symbolTab: 'all' | 'index' | 'stock';
  watchlist: string[];
  onSearchChange: (v: string) => void;
  onSearchEnter: (sym: string) => void;
  onTabChange: (t: 'all' | 'index' | 'stock') => void;
  onSelect: (sym: string) => void;
  onToggleWatchlist: (sym: string) => void;
};

function SymbolSidebar({
  open,
  fullscreen,
  symbol,
  search,
  symbolTab,
  watchlist,
  onSearchChange,
  onSearchEnter,
  onTabChange,
  onSelect,
  onToggleWatchlist,
}: SymbolSidebarProps) {
  const filteredSymbols = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = FNO_UNIVERSE.filter((inst) => {
      if (symbolTab === 'index' && inst.type !== 'index') return false;
      if (symbolTab === 'stock' && inst.type !== 'stock') return false;
      if (!q) return true;
      return (
        inst.symbol.toLowerCase().includes(q) ||
        inst.name.toLowerCase().includes(q) ||
        inst.sector.toLowerCase().includes(q)
      );
    });
    return q ? list : list.slice(0, SIDEBAR_CAP);
  }, [search, symbolTab]);

  if (!open) return null;

  return (
    <aside
      className={`shrink-0 flex flex-col border-dark-border bg-dark-surface overflow-hidden ${
        fullscreen ? 'w-56 border-r absolute left-0 top-11 bottom-0 z-20 shadow-xl' : 'w-56 xl:w-64 rounded-xl border'
      }`}
    >
      <div className="p-2 border-b border-dark-border space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-muted" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim()) onSearchEnter(search.trim());
            }}
            placeholder="Symbol…"
            className="tf-field w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'index', 'stock'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTabChange(t)}
              className={`flex-1 py-1 text-[10px] font-bold rounded ${
                symbolTab === t ? 'bg-gold text-dark-surface' : 'bg-dark-elevated text-dark-muted'
              }`}
            >
              {t === 'all' ? 'All' : t === 'index' ? 'Idx' : 'Stk'}
            </button>
          ))}
        </div>
        {!search.trim() && symbolTab === 'all' && (
          <p className="text-[9px] text-dark-muted">Top {SIDEBAR_CAP} — search for more</p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredSymbols.map((inst) => (
          <div
            key={inst.symbol}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(inst.symbol)}
            className={`flex items-center gap-2 px-2 py-2 border-b border-dark-border/50 cursor-pointer hover:bg-dark-elevated ${
              symbol === inst.symbol ? 'bg-gold/10 border-l-2 border-l-gold' : ''
            }`}
          >
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-slate-100">{inst.symbol}</span>
              <p className="text-[9px] text-dark-muted truncate">{inst.name}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleWatchlist(inst.symbol);
              }}
            >
              <Star
                className={`w-3.5 h-3.5 ${watchlist.includes(inst.symbol) ? 'fill-gold text-gold' : 'text-slate-600'}`}
              />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default memo(SymbolSidebar);
