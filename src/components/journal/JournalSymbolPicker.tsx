import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import {
  getJournalSymbolSelection,
  getUniverseCounts,
  refreshMarketSymbols,
  searchJournalSymbols,
  type JournalSymbolSelection,
  type SymbolTab,
} from '../../services/equitySymbolService';

interface JournalSymbolPickerProps {
  selectedSymbol: string;
  onSelect: (selection: JournalSymbolSelection) => void;
}

function fmtPrice(p: number) {
  return p >= 1000 ? p.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : p.toFixed(2);
}

function exchangeBadge(exchange: JournalSymbolSelection['exchange']) {
  if (exchange === 'NSE') return 'bg-emerald-500/20 text-emerald-300';
  if (exchange === 'BSE') return 'bg-amber-500/20 text-amber-300';
  if (exchange === 'INDEX') return 'bg-violet-500/20 text-violet-300';
  return 'bg-blue-500/20 text-blue-300';
}

export default function JournalSymbolPicker({ selectedSymbol, onSelect }: JournalSymbolPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SymbolTab>('all');
  const [search, setSearch] = useState('');
  const [manualSymbol, setManualSymbol] = useState('');
  const [tick, setTick] = useState(0);
  const counts = useMemo(() => getUniverseCounts(), [tick]);

  const load = () => {
    refreshMarketSymbols();
    setTick((t) => t + 1);
  };

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const list = useMemo(
    () => searchJournalSymbols(search, tab, 100),
    [search, tab, tick],
  );

  const selected =
    getJournalSymbolSelection(selectedSymbol) ??
    list.find((i) => i.symbol === selectedSymbol) ??
    null;

  const applyManual = () => {
    const sym = (manualSymbol || search).trim().toUpperCase();
    if (!sym) return;
    const sel = getJournalSymbolSelection(sym);
    if (sel) {
      onSelect(sel);
      setOpen(false);
      setSearch('');
      setManualSymbol('');
    }
  };

  const tabs: { id: SymbolTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'index', label: 'Indices' },
    { id: 'nse', label: `NSE (${counts.nse})` },
    { id: 'bse', label: `BSE (${counts.bse})` },
    { id: 'fno', label: 'F&O' },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 min-w-[200px] px-3 py-2 rounded-lg bg-[#172033] border border-[#24324b] hover:border-[#d4af37]/50 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white truncate">{selected?.symbol ?? (selectedSymbol || 'Select symbol')}</div>
          <div className="text-[10px] text-slate-500 truncate">{selected?.name ?? 'NSE / BSE / Indices'}</div>
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
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-1 z-[100] w-[min(480px,calc(100vw-2rem))] rounded-xl border border-[#24324b] bg-[#0d1728] shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-[#24324b] space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyManual();
                      }
                    }}
                    placeholder="Search NSE / BSE symbol or company..."
                    className="w-full pl-8 pr-2 py-2 rounded-lg bg-[#0a0f1a] border border-[#24324b] text-xs text-white"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-1 flex-wrap">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-2 py-1 rounded text-[10px] font-bold ${
                      tab === t.id ? 'bg-[#d4af37] text-[#0a0f1a]' : 'bg-[#172033] text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualSymbol}
                  onChange={(e) => setManualSymbol(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && applyManual()}
                  placeholder="Manual symbol (any NSE/BSE)"
                  className="flex-1 rounded-lg bg-[#0a0f1a] border border-[#24324b] px-2 py-1.5 text-[10px] text-white"
                />
                <button
                  type="button"
                  onClick={applyManual}
                  className="shrink-0 rounded-lg bg-[#d4af37] px-3 py-1.5 text-[10px] font-bold text-[#0a0f1a]"
                >
                  Use
                </button>
              </div>

              <p className="text-[9px] text-slate-500">
                {list.length} results · NSE {counts.nse} + BSE {counts.bse} stocks · Qty enter manually in form
              </p>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {list.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-500">No match. Type symbol above and press Use / Enter.</p>
              ) : (
                list.map((item) => {
                  const isSel = item.symbol === selectedSymbol;
                  const up = item.changePercent >= 0;
                  return (
                    <button
                      key={`${item.exchange}-${item.symbol}`}
                      type="button"
                      onClick={() => {
                        onSelect(item);
                        setOpen(false);
                        setSearch('');
                        setManualSymbol('');
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 border-b border-[#172033] hover:bg-[#111b2d] text-left ${
                        isSel ? 'bg-[#d4af37]/10 border-l-2 border-l-[#d4af37]' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white">{item.symbol}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded uppercase ${exchangeBadge(item.exchange)}`}>
                            {item.exchange}
                          </span>
                          {item.isFno && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-300">F&O</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{item.name}</div>
                        <div className="text-[9px] text-slate-600">
                          {item.sector}
                          {item.isFno ? ` · F&O lot ${item.lotSize}` : ' · Cash equity (qty in shares)'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-white">{fmtPrice(item.price)}</div>
                        <div
                          className={`text-[10px] font-bold flex items-center justify-end gap-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {up ? '+' : ''}
                          {item.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
