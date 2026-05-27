import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import {
  createManualGlobalInstrument,
  formatGlobalSymbol,
  getGlobalInstrument,
  searchGlobalInstruments,
  type GlobalInstrumentSelection,
  type GlobalMarket,
} from '../../services/globalInstrumentService';

interface GlobalInstrumentPickerProps {
  market: GlobalMarket;
  selectedSymbol: string;
  onSelect: (selection: GlobalInstrumentSelection) => void;
}

function marketBadge(market: GlobalMarket) {
  return market === 'crypto'
    ? 'bg-orange-500/20 text-orange-300'
    : 'bg-cyan-500/20 text-cyan-300';
}

export default function GlobalInstrumentPicker({
  market,
  selectedSymbol,
  onSelect,
}: GlobalInstrumentPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState('');

  const list = useMemo(() => searchGlobalInstruments(market, search, 60), [market, search]);

  const selected =
    getGlobalInstrument(market, selectedSymbol) ??
    (selectedSymbol ? createManualGlobalInstrument(market, selectedSymbol) : null);

  const applyManual = () => {
    const raw = (manual || search).trim();
    if (!raw) return;
    const sel = createManualGlobalInstrument(market, raw);
    onSelect(sel);
    setOpen(false);
    setSearch('');
    setManual('');
  };

  const title = market === 'crypto' ? 'Crypto' : 'Forex';
  const hint =
    market === 'crypto'
      ? 'BTC/USDT, ETHUSDT, or any pair — qty in coins'
      : 'EUR/USD, XAU/USD — optional standard lots (100k units)';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 min-w-[200px] px-3 py-2 rounded-lg bg-[#172033] border border-[#24324b] hover:border-[#d4af37]/50 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white truncate">
            {selected?.symbol ?? (selectedSymbol || `Select ${title} pair`)}
          </div>
          <div className="text-[10px] text-slate-500 truncate">{selected?.name ?? hint}</div>
        </div>
        <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase shrink-0 ${marketBadge(market)}`}>
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-1 z-50 w-[min(480px,calc(100vw-2rem))] rounded-xl border border-[#24324b] bg-[#0d1728] shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-[#24324b] space-y-2">
              <div className="relative">
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
                  placeholder={market === 'crypto' ? 'Search BTC, ETH, SOL…' : 'Search EUR/USD, Gold, USD/INR…'}
                  className="w-full pl-8 pr-2 py-2 rounded-lg bg-[#0a0f1a] border border-[#24324b] text-xs text-white"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyManual()}
                  placeholder={market === 'crypto' ? 'Custom pair e.g. PEPE/USDT' : 'Custom e.g. EURUSD or XAUUSD'}
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
                Type any symbol — {formatGlobalSymbol('EURUSD', 'forex')} style auto-format · P&amp;L enter manually below
              </p>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {list.map((item) => {
                const isSel = item.symbol === selected?.symbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                      setSearch('');
                      setManual('');
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 border-b border-[#172033] hover:bg-[#111b2d] text-left ${
                      isSel ? 'bg-[#d4af37]/10 border-l-2 border-l-[#d4af37]' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{item.symbol}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded uppercase ${marketBadge(market)}`}>
                          {item.quoteCurrency}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{item.name}</div>
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
