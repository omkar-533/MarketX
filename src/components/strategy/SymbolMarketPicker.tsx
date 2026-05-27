import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import {
  getFnoLiveQuotes,
  searchFnoSymbols,
  type LiveSymbolQuote,
} from '../../services/symbolLiveService';

type TabId = 'all' | 'index' | 'stock';

interface SymbolMarketPickerProps {
  selectedSymbol: string;
  onSelect: (quote: LiveSymbolQuote) => void;
}

function fmtPrice(p: number) {
  return p >= 1000 ? p.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : p.toFixed(2);
}

export default function SymbolMarketPicker({ selectedSymbol, onSelect }: SymbolMarketPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [quotes, setQuotes] = useState<LiveSymbolQuote[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setQuotes(getFnoLiveQuotes());
  };

  const handleRefresh = () => {
    setRefreshing(true);
    load();
    window.setTimeout(() => setRefreshing(false), 400);
  };

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const list = useMemo(() => {
    const type = tab === 'all' ? undefined : tab === 'index' ? 'index' : 'stock';
    let items = search.trim() ? searchFnoSymbols(search, type) : quotes;
    if (tab === 'index') items = items.filter((i) => i.type === 'index');
    if (tab === 'stock') items = items.filter((i) => i.type === 'stock');
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || i.sector.toLowerCase().includes(q),
      );
    }
    return items.sort((a, b) => {
      if (a.symbol === selectedSymbol) return -1;
      if (b.symbol === selectedSymbol) return 1;
      return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    });
  }, [quotes, search, tab, selectedSymbol]);

  const selected = quotes.find((q) => q.symbol === selectedSymbol) ?? list[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 min-w-[200px] px-3 py-2 rounded-lg bg-[#172033] border border-[#24324b] hover:border-[#d4af37]/50 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white truncate">{selected?.symbol ?? selectedSymbol}</div>
          <div className="text-[10px] text-slate-500 truncate">{selected?.name ?? 'Select symbol'}</div>
        </div>
        {selected && (
          <span className={`text-xs font-bold shrink-0 ${selected.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtPrice(selected.price)}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-1 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-[#24324b] bg-[#0d1728] shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-[#24324b] space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search index / FNO stock..."
                    className="w-full pl-8 pr-2 py-2 rounded-lg bg-[#0a0f1a] border border-[#24324b] text-xs text-white"
                    autoFocus
                  />
                </div>
                <button type="button" onClick={handleRefresh} className="p-2 rounded-lg bg-[#172033] text-[#d4af37] hover:bg-[#24324b]" title="Refresh live">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="flex gap-1">
                {([
                  { id: 'all' as TabId, label: 'All FNO' },
                  { id: 'index' as TabId, label: 'Indices' },
                  { id: 'stock' as TabId, label: 'FNO Stocks' },
                ]).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex-1 py-1 rounded text-[10px] font-bold ${
                      tab === t.id ? 'bg-[#d4af37] text-[#0a0f1a]' : 'bg-[#172033] text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-slate-500">{list.length} symbols</p>
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {list.map((item) => {
                const isSel = item.symbol === selectedSymbol;
                const up = item.changePercent >= 0;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setSearch('');
                      if (item.symbol !== selectedSymbol) {
                        onSelect(item);
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 border-b border-[#172033] hover:bg-[#111b2d] text-left ${
                      isSel ? 'bg-[#d4af37]/10 border-l-2 border-l-[#d4af37]' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{item.symbol}</span>
                        <span
                          className={`text-[8px] px-1 py-0.5 rounded uppercase ${
                            item.type === 'index' ? 'bg-violet-500/20 text-violet-300' : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {item.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{item.name}</div>
                      <div className="text-[9px] text-slate-600">{item.sector} · Lot {item.lotSize}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-white">{fmtPrice(item.price)}</div>
                      <div className={`text-[10px] font-bold flex items-center justify-end gap-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {up ? '+' : ''}
                        {item.changePercent.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
