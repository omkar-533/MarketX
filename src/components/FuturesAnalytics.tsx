import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Calendar, Loader2, RefreshCw } from 'lucide-react';
import { useChartLiveTick } from '../hooks/useChartLiveTick';
import { lookbackDaysForRange, type FuturesChartBar, type FuturesRangeId } from '../services/futuresOiChart';
import {
  loadFuturesAnalyticsSeries,
  type FuturesDataMeta,
  type FuturesPeriod,
} from '../services/futuresOiLiveService';
import type { LiveSymbolQuote } from '../services/symbolLiveService';
import SymbolMarketPicker from './strategy/SymbolMarketPicker';
import FuturesOiTradeXCharts from './futures/FuturesOiTradeXCharts';

const RANGES: FuturesRangeId[] = ['1m', '3m', '6m', 'YTD', '1y', 'All'];
const PERIODS: { id: FuturesPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
];

const CHART_SLOT_H = 720;

function defaultEndDate() {
  return new Date().toISOString().split('T')[0];
}

function defaultStartForRange(range: FuturesRangeId, end: string) {
  const lookback = lookbackDaysForRange(range);
  if (lookback <= 0) return '2020-01-01';
  const d = new Date(end);
  d.setDate(d.getDate() - lookback);
  return d.toISOString().split('T')[0];
}

export default function FuturesAnalytics() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [period, setPeriod] = useState<FuturesPeriod>('daily');
  const [timeRange, setTimeRange] = useState<FuturesRangeId>('6m');
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [startDate, setStartDate] = useState(() => defaultStartForRange('6m', defaultEndDate()));
  const [chartBars, setChartBars] = useState<FuturesChartBar[]>([]);
  const [meta, setMeta] = useState<FuturesDataMeta | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadKey = useMemo(
    () => `${symbol}|${period}|${startDate}|${endDate}`,
    [symbol, period, startDate, endDate],
  );
  const loadedKeyRef = useRef('');

  const fetchData = useCallback(
    async (opts?: { showLoader?: boolean; force?: boolean }) => {
      if (opts?.force) loadedKeyRef.current = '';
      if (opts?.showLoader) setInitialLoading(true);
      try {
        const { bars, meta: m } = await loadFuturesAnalyticsSeries(symbol, period, startDate, endDate);
        setChartBars(bars);
        setMeta(m);
        loadedKeyRef.current = loadKey;
      } finally {
        setInitialLoading(false);
      }
    },
    [symbol, period, startDate, endDate, loadKey],
  );

  useEffect(() => {
    if (loadedKeyRef.current !== loadKey) {
      void fetchData({ showLoader: true });
    }
  }, [loadKey, fetchData]);

  useChartLiveTick(
    () => {
      if (loadedKeyRef.current === loadKey) {
        void fetchData({ showLoader: false });
      }
    },
    8000,
    true,
  );

  const handleRangeClick = (range: FuturesRangeId) => {
    setTimeRange(range);
    const end = defaultEndDate();
    setEndDate(end);
    setStartDate(defaultStartForRange(range, end));
  };

  const handleSymbol = (quote: LiveSymbolQuote) => {
    setSymbol(quote.symbol);
  };

  return (
    <div className="flex flex-col gap-3 min-h-[calc(100vh-4rem)]">
      <div className="app-card p-4 border-gold/20 shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-gold" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gold">Futures Analytics</h2>
              <p className="text-[11px] text-dark-muted truncate">
                Real OHLC · volume · OI buildup — TradeX-style view
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SymbolMarketPicker selectedSymbol={symbol} onSelect={handleSymbol} />
            <div className="flex items-center gap-1.5 tf-field rounded-lg border px-2 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-dark-muted shrink-0" />
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setTimeRange('All');
                }}
                className="bg-transparent text-[11px] w-[108px] focus:outline-none"
              />
              <span className="text-dark-muted text-[10px]">—</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setTimeRange('All');
                }}
                className="bg-transparent text-[11px] w-[108px] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-dark-border">
          <span className="text-[10px] font-bold text-dark-muted uppercase mr-1">Period</span>
          <div className="flex gap-1 p-0.5 rounded-lg bg-dark-elevated border border-dark-border">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                  period === p.id
                    ? 'bg-gold text-dark-surface'
                    : 'text-dark-muted hover:text-gold hover:bg-gold/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <span className="text-[10px] font-bold text-dark-muted uppercase mx-1 hidden sm:inline">
            Range
          </span>
          <div className="flex flex-wrap gap-1">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => handleRangeClick(range)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-colors ${
                  timeRange === range
                    ? 'bg-gold/15 border-gold/40 text-gold'
                    : 'border-dark-border text-dark-muted hover:border-gold/30'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {meta && (
          <div
            className={`mt-3 px-3 py-2 rounded-lg text-[11px] border flex flex-wrap items-center gap-2 ${
              meta.live
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : chartBars.length
                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'
                  : 'bg-red-500/10 border-red-500/25 text-red-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.live ? 'bg-emerald-400 animate-pulse' : chartBars.length ? 'bg-amber-400' : 'bg-red-400'}`}
            />
            <span className="flex-1 min-w-0">{meta.message}</span>
            <span className="opacity-60 text-[10px]">
              Price {meta.priceSource} · OI {meta.oiSource} · Vol {meta.volumeSource}
            </span>
            <button
              type="button"
              onClick={() => void fetchData({ showLoader: true, force: true })}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md border border-dark-border text-[10px] font-bold text-gold hover:bg-gold/10"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="app-card p-0 overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="relative shrink-0" style={{ minHeight: CHART_SLOT_H }}>
          {initialLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-dark-surface/80 backdrop-blur-[2px]">
              <Loader2 className="w-7 h-7 text-gold animate-spin" />
            </div>
          )}
          <FuturesOiTradeXCharts bars={chartBars} symbol={symbol} />
        </div>

        <p className="text-center text-[10px] text-dark-muted py-2 border-t border-dark-border shrink-0">
          {chartBars.length} {period} bars · live refresh every 8s
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
        {[
          { label: 'Long Buildup', color: 'bg-emerald-500', desc: 'Price ↑ + OI ↑' },
          { label: 'Short Buildup', color: 'bg-red-500', desc: 'Price ↓ + OI ↑' },
          { label: 'Long Unwinding', color: 'bg-amber-500', desc: 'Price ↓ + OI ↓' },
          { label: 'Short Covering', color: 'bg-lime-500', desc: 'Price ↑ + OI ↓' },
        ].map((item) => (
          <div key={item.label} className="app-card px-3 py-2 flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${item.color}`} />
            <div>
              <div className="text-[10px] font-bold text-slate-200">{item.label}</div>
              <div className="text-[9px] text-dark-muted">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
