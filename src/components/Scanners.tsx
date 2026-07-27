import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
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
  ensureTimeframeBars,
  SCAN_TIMEFRAMES,
  subscribeTimeframeFeed,
  timeframeCoverage,
  type ScanTimeframe,
} from '../services/screenerTimeframeFeed';
import {
  runTradefinderScan,
  TRADEFINDER_SCREENERS,
  type ScanHit,
  type TradefinderScreener,
} from '../services/tradefinderScreeners';
import { sanitizeDisplayMessage } from '../constants/brandLabels';

interface ScannersProps {
  user: User | null;
}

/** Sensible defaults — swing/day cards start slower, pulse/clock start faster. */
const DEFAULT_TF: Record<string, ScanTimeframe> = {
  'insider-strategy': '15m',
  'swing-spectrum': '1h',
  'option-clock': '5m',
  'option-apex': '15m',
  'market-pulse': '5m',
};

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

function HitRow({ hit }: { hit: ScanHit }) {
  const up = hit.direction === 'bullish';
  const change = Number.isFinite(hit.changePercent) ? hit.changePercent : 0;
  const price = Number.isFinite(hit.price) ? hit.price : 0;

  return (
    <div className="py-2 border-b border-[#1a1f2e] last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <span
            className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded ${
              up ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
            }`}
            title={up ? 'Bullish' : 'Bearish'}
          >
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-100 truncate">{hit.symbol}</div>
            <div className="text-[11px] text-slate-500 truncate">{hit.name}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold tabular-nums text-slate-200">
            ₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div
            className={`text-[11px] font-bold tabular-nums ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full bg-[#151a26] overflow-hidden">
          <div
            className={`h-full rounded-full ${up ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
            style={{ width: `${Math.max(6, Math.min(100, hit.strength))}%` }}
          />
        </div>
        <span className="text-[10px] font-bold tabular-nums text-slate-500 w-7 text-right">
          {hit.strength}
        </span>
      </div>
    </div>
  );
}

function TimeframeChips({
  value,
  onChange,
}: {
  value: ScanTimeframe;
  onChange: (tf: ScanTimeframe) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SCAN_TIMEFRAMES.map((tf) => (
        <button
          key={tf.id}
          type="button"
          onClick={() => onChange(tf.id)}
          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors border ${
            value === tf.id
              ? 'border-[#d4af37]/40 bg-[#d4af37]/15 text-[#d4af37]'
              : 'border-[#1a1f2e] bg-[#121520] text-slate-500 hover:text-slate-200 hover:border-slate-600'
          }`}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}

function ScreenerCard({
  screener,
  hits,
  timeframe,
  coverage,
  onTimeframeChange,
}: {
  screener: TradefinderScreener;
  hits: ScanHit[];
  timeframe: ScanTimeframe;
  coverage: number;
  onTimeframeChange: (tf: ScanTimeframe) => void;
}) {
  const tfLabel = SCAN_TIMEFRAMES.find((t) => t.id === timeframe)?.label ?? timeframe;

  return (
    <article className="rounded-xl border border-[#1a1f2e] bg-[#0b0e17] p-4 hover:border-[#d4af37]/25 transition-colors flex flex-col min-h-[320px]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h2 className="text-sm font-bold text-slate-100 leading-snug">{screener.name}</h2>
      </div>
      <p className="text-[11px] text-slate-500">{screener.tagline}</p>
      <ul className="mt-2 mb-3 space-y-0.5">
        {screener.points.map((point) => (
          <li key={point} className="text-[10px] text-slate-600 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[#d4af37]/50" />
            {point}
          </li>
        ))}
      </ul>

      <div className="mb-3 pb-3 border-b border-[#1a1f2e]">
        <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-1.5">
          Timeframe
        </div>
        <TimeframeChips value={timeframe} onChange={onTimeframeChange} />
      </div>

      <div className="flex-1">
        {hits.length === 0 ? (
          <div className="h-full min-h-[110px] flex items-center justify-center text-center px-2">
            <p className="text-[11px] text-slate-600">
              {coverage === 0
                ? `Loading ${tfLabel} candles…`
                : `No setups on ${tfLabel} right now.`}
            </p>
          </div>
        ) : (
          hits.map((hit) => <HitRow key={hit.symbol} hit={hit} />)
        )}
      </div>

      {hits.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[#1a1f2e] text-[10px] text-slate-600 flex justify-between">
          <span>
            Top {hits.length} · {tfLabel}
          </span>
          <span>Strength {hits[0]?.strength ?? 0}</span>
        </div>
      )}
    </article>
  );
}

export default function Scanners(_props: ScannersProps) {
  const [stocks, setStocks] = useState<ScreenerMarketRow[]>(() => getCachedScreenerRows());
  const [loading, setLoading] = useState(() => getCachedScreenerRows().length === 0);
  const [status, setStatus] = useState(getScreenerFeedStatus);
  const [query, setQuery] = useState('');
  const [candleTick, setCandleTick] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [timeframes, setTimeframes] = useState<Record<string, ScanTimeframe>>(() =>
    Object.fromEntries(TRADEFINDER_SCREENERS.map((s) => [s.id, DEFAULT_TF[s.id] ?? '15m'])),
  );

  const activeTimeframes = useMemo(
    () => [...new Set(Object.values(timeframes))] as ScanTimeframe[],
    [timeframes],
  );

  const loadCandles = useCallback(
    async (rows: ScreenerMarketRow[], tfs: ScanTimeframe[], force: boolean) => {
      if (!rows.length || !tfs.length) return;
      setScanning(true);
      try {
        await Promise.all(tfs.map((tf) => ensureTimeframeBars(rows, tf, { force })));
        setCandleTick((n) => n + 1);
      } finally {
        setScanning(false);
      }
    },
    [],
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      setLoading(true);
      try {
        await refreshScreenerFeedAsync({ forceOhlc: opts?.force });
        const rows = getCachedScreenerRows();
        setStocks(rows);
        setStatus(getScreenerFeedStatus());
        const tfs = [...new Set(Object.values(timeframes))] as ScanTimeframe[];
        await loadCandles(rows, tfs, Boolean(opts?.force));
      } finally {
        setLoading(false);
      }
    },
    [loadCandles, timeframes],
  );

  useEffect(() => {
    void refresh({ force: true });
    return subscribeScreenerFeed(() => {
      setStocks(getCachedScreenerRows());
      setStatus(getScreenerFeedStatus());
    });
    // Mount once — later refreshes come from auto-refresh / button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => subscribeTimeframeFeed(() => setCandleTick((n) => n + 1)), []);
  useEffect(() => subscribeMarketLive(() => setStatus(getScreenerFeedStatus())), []);

  // Whenever a card switches candle size, fetch that history (other cards keep theirs).
  useEffect(() => {
    void loadCandles(getCachedScreenerRows(), activeTimeframes, false);
  }, [activeTimeframes, loadCandles]);

  useAutoRefresh(() => {
    void refresh();
  });

  const setCardTimeframe = (screenerId: string, tf: ScanTimeframe) => {
    setTimeframes((prev) => (prev[screenerId] === tf ? prev : { ...prev, [screenerId]: tf }));
  };

  const cards = useMemo(() => {
    void candleTick;
    const q = query.trim().toLowerCase();

    return TRADEFINDER_SCREENERS.map((screener) => {
      const tf = timeframes[screener.id] ?? '15m';
      const result = runTradefinderScan(stocks, screener.id, tf, 8);
      const hits = result?.hits ?? [];
      const filteredHits = q
        ? hits.filter(
            (h) =>
              h.symbol.toLowerCase().includes(q) ||
              h.name.toLowerCase().includes(q) ||
              screener.name.toLowerCase().includes(q),
          )
        : hits;

      return {
        screener,
        timeframe: tf,
        hits: filteredHits,
        coverage: timeframeCoverage(tf),
        visible: !q || filteredHits.length > 0 || screener.name.toLowerCase().includes(q),
      };
    }).filter((c) => c.visible);
  }, [stocks, timeframes, query, candleTick]);

  const totalHits = cards.reduce((n, c) => n + c.hits.length, 0);
  const label = feedLabel(status.mode, status.message, loading);
  const busy = loading || scanning;

  return (
    <div className="w-full pb-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#d4af37]">Scanners</h1>
          <p className="text-sm text-slate-500 mt-1">
            Five live scans — each card has its own candle size (5 min, 15 min, 1 hr, 1 day).
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
            {totalHits > 0 && <span>· {totalHits} matches</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scan or stock…"
              className="pl-8 pr-3 py-2 rounded-lg bg-[#0b0e17] border border-[#1a1f2e] text-sm text-slate-200 w-[200px] focus:outline-none focus:border-[#d4af37]/40"
            />
          </div>
          <button
            type="button"
            onClick={() => void refresh({ force: true })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1a1f2e] bg-[#121520] text-xs font-bold text-slate-300 hover:border-[#d4af37]/40 hover:text-[#d4af37] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {stocks.length === 0 && !loading ? (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#0b0e17] p-10 text-center">
          <p className="text-sm text-slate-300 font-medium">Market data is reconnecting</p>
          <p className="text-[12px] text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
            Scans will populate once the live feed is available. Tap Refresh to retry.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map(({ screener, hits, timeframe, coverage }) => (
            <ScreenerCard
              key={screener.id}
              screener={screener}
              hits={hits}
              timeframe={timeframe}
              coverage={coverage}
              onTimeframeChange={(tf) => setCardTimeframe(screener.id, tf)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
