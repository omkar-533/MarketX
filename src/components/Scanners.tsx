import { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Search, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { User } from '../hooks/useAuth';
import {
  getScreenerFeedStatus,
  refreshScreenerFeedAsync,
  type ScreenerMarketRow,
} from '../services/screenerDataService';
import { getCachedScreenerRows, subscribeScreenerFeed } from '../services/screenerLiveService';
import { subscribeMarketLive } from '../services/marketLiveStore';
import {
  groupReadyMadeByCategory,
  runAllReadyMadeScreeners,
  type ReadyMadeBias,
  type ReadyMadeHit,
} from '../services/readyMadeScreeners';
import { sanitizeDisplayMessage } from '../constants/brandLabels';

interface ScannersProps {
  user: User | null;
}

function biasTone(bias: ReadyMadeBias) {
  if (bias === 'bullish') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
  if (bias === 'bearish') return 'text-red-400 bg-red-500/10 border-red-500/25';
  return 'text-slate-300 bg-slate-500/10 border-slate-500/25';
}

function BiasIcon({ bias }: { bias: ReadyMadeBias }) {
  if (bias === 'bullish') return <TrendingUp className="w-3.5 h-3.5" />;
  if (bias === 'bearish') return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

function feedLabel(mode?: string, label?: string, loading?: boolean): string {
  if (loading) return 'Updating market feed…';
  if (mode === 'live') return 'Live market feed';
  if (mode === 'mixed') return 'Partial live feed';
  if (mode === 'loading') return 'Connecting to market feed…';
  const cleaned = sanitizeDisplayMessage(label || '');
  if (!cleaned || /npm|Wolf Trade|APMI server|run dev/i.test(cleaned)) {
    return 'Market feed unavailable — reconnecting…';
  }
  return cleaned;
}

function StockRow({ stock }: { stock: ReadyMadeHit }) {
  const change = Number.isFinite(stock.changePercent) ? stock.changePercent : 0;
  const price = Number.isFinite(stock.price) ? stock.price : 0;
  const up = change >= 0;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[#1a1f2e] last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-100 truncate">{stock.symbol}</div>
        <div className="text-[11px] text-slate-500 truncate">{stock.name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums text-slate-200">
          ₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </div>
        <div className={`text-[11px] font-bold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '+' : ''}
          {change.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

export default function Scanners(_props: ScannersProps) {
  const [stocks, setStocks] = useState<ScreenerMarketRow[]>(() => getCachedScreenerRows());
  const [loading, setLoading] = useState(() => getCachedScreenerRows().length === 0);
  const [status, setStatus] = useState(getScreenerFeedStatus);
  const [query, setQuery] = useState('');

  const applyRows = (rows: ScreenerMarketRow[]) => {
    setStocks(rows);
    setStatus(getScreenerFeedStatus());
    if (rows.length) setLoading(false);
  };

  const refresh = async (opts?: { forceOhlc?: boolean }) => {
    setLoading(true);
    try {
      await refreshScreenerFeedAsync(opts);
      applyRows(getCachedScreenerRows());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh({ forceOhlc: true });
    return subscribeScreenerFeed(() => applyRows(getCachedScreenerRows()));
  }, []);

  useEffect(() => subscribeMarketLive(() => setStatus(getScreenerFeedStatus())), []);

  useAutoRefresh(() => {
    void refresh();
  });

  const grouped = useMemo(() => {
    const all = runAllReadyMadeScreeners(stocks, 8);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (r) =>
            r.def.title.toLowerCase().includes(q) ||
            r.def.categoryLabel.toLowerCase().includes(q) ||
            r.def.description.toLowerCase().includes(q) ||
            r.stocks.some((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)),
        )
      : all;
    return groupReadyMadeByCategory(filtered);
  }, [stocks, query]);

  const techCount = stocks.filter((r) => r.hasRealTechnicals).length;
  const matchScans = grouped.reduce(
    (n, g) => n + g.screeners.reduce((m, s) => m + (s.stocks.length > 0 ? 1 : 0), 0),
    0,
  );
  const label = feedLabel(status.mode, status.message, loading);

  return (
    <div className="w-full pb-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#d4af37]">Stock Screeners</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live F&amp;O scans — momentum, breakout, intraday, options, volume, and more.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span
              className={`inline-flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded border ${
                status.mode === 'live'
                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                  : status.mode === 'mixed'
                    ? 'border-gold/30 text-gold bg-gold/10'
                    : 'border-slate-600 text-slate-500'
              }`}
            >
              <Activity className="w-3 h-3" />
              {label}
            </span>
            {stocks.length > 0 && <span>· {stocks.length.toLocaleString('en-IN')} symbols</span>}
            {techCount > 0 && <span>· {techCount} with indicators</span>}
            {matchScans > 0 && <span>· {matchScans} scans with matches</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scan or stock…"
              className="pl-8 pr-3 py-2 rounded-lg bg-[#0b0e17] border border-[#1a1f2e] text-sm text-slate-200 w-[220px] focus:outline-none focus:border-[#d4af37]/40"
            />
          </div>
          <button
            type="button"
            onClick={() => void refresh({ forceOhlc: true })}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1a1f2e] bg-[#121520] text-xs font-bold text-slate-300 hover:border-[#d4af37]/40 hover:text-[#d4af37] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {grouped.length > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap gap-2 py-2 mb-4 bg-[#0a0e17]/95 backdrop-blur-sm border-b border-[#1a1f2e]/80">
          {grouped.map((section) => (
            <button
              key={section.category}
              type="button"
              onClick={() => {
                document.getElementById(`rm-${section.category}`)?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              }}
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border border-[#1a1f2e] bg-[#121520] text-slate-400 hover:text-[#d4af37] hover:border-[#d4af37]/40"
            >
              {section.categoryLabel.replace(' Screeners', '')}
            </button>
          ))}
        </div>
      )}

      {stocks.length === 0 && !loading ? (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#0b0e17] p-10 text-center">
          <p className="text-sm text-slate-300 font-medium">Market data is reconnecting</p>
          <p className="text-[12px] text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
            Scans will populate once the live feed is available. Tap Refresh to retry.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((section) => (
            <section key={section.category} id={`rm-${section.category}`} className="space-y-3 scroll-mt-28">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white tracking-wide">{section.categoryLabel}</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-[#d4af37]/40 to-transparent" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">
                  {section.screeners.length} scans
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {section.screeners.map(({ def, stocks: hits }) => (
                  <article
                    key={def.id}
                    className="rounded-xl border border-[#1a1f2e] bg-[#0b0e17] p-4 hover:border-[#d4af37]/25 transition-colors flex flex-col min-h-[260px]"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-bold text-slate-100 leading-snug">{def.title}</h3>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${biasTone(def.bias)}`}
                      >
                        <BiasIcon bias={def.bias} />
                        {def.bias}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-3">{def.description}</p>

                    <div className="flex-1">
                      {hits.length === 0 ? (
                        <div className="h-full min-h-[100px] flex items-center justify-center text-center px-2">
                          <p className="text-[11px] text-slate-600">No matches on the current market tape.</p>
                        </div>
                      ) : (
                        hits.map((stock) => <StockRow key={stock.symbol} stock={stock} />)
                      )}
                    </div>

                    {hits.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#1a1f2e] text-[10px] text-slate-600 flex justify-between">
                        <span>Top {hits.length}</span>
                        <span>Vol× {(hits[0]?.volumeRatio ?? 0).toFixed(2)}</span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
