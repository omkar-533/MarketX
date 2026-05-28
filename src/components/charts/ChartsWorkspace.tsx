import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickChart,
  Database,
  LayoutGrid,
  LineChart,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import {
  CHART_DATA_SOURCES,
  CHART_INDICATORS,
  CHART_TIMEFRAMES,
  CHART_TYPES,
} from '../../config/chartConfig';
import type { ChartDataSource, ChartIndicator, ChartTimeframe, ChartType } from '../../types/chart';
import { invalidateChartCache, prewarmChartCache } from '../../services/chart/chartDataService';
import ChartPanels from './ChartPanels';
import LiveQuoteBadge from './LiveQuoteBadge';
import SymbolSidebar from './SymbolSidebar';

type LayoutMode = 'single' | 'dual';

const WATCHLIST_KEY = 'tradeflow_chart_watchlist';

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 24) : ['NIFTY'];
  } catch {
    return ['NIFTY', 'BANKNIFTY'];
  }
}

export default function ChartsWorkspace() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [secondarySymbol, setSecondarySymbol] = useState('BANKNIFTY');
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('15m');
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [dataSource, setDataSource] = useState<ChartDataSource>('platform');
  const [indicators, setIndicators] = useState<ChartIndicator[]>(['ema20']);
  const [search, setSearch] = useState('');
  const [symbolTab, setSymbolTab] = useState<'all' | 'index' | 'stock'>('all');
  const [layout, setLayout] = useState<LayoutMode>('single');
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const chartStageRef = useRef<HTMLDivElement>(null);

  const chartPanelProps = useMemo(
    () => ({
      symbol,
      secondarySymbol,
      layout,
      timeframe,
      chartType,
      indicators,
      dataSource,
      fullscreen,
    }),
    [symbol, secondarySymbol, layout, timeframe, chartType, indicators, dataSource, fullscreen],
  );

  useEffect(() => {
    const next = watchlist.find((s) => s !== symbol) ?? 'BANKNIFTY';
    setSecondarySymbol(next);
  }, [watchlist, symbol]);

  useEffect(() => {
    prewarmChartCache(['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS'], timeframe);
  }, [timeframe]);

  useEffect(() => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (!fullscreen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  const selectSymbol = useCallback((sym: string) => {
    setSymbol(sym.toUpperCase());
    setSearch('');
    if (fullscreen) setSidebarOpen(false);
  }, [fullscreen]);

  const toggleWatchlist = useCallback((sym: string) => {
    setWatchlist((prev) => {
      if (prev.includes(sym)) return prev.filter((s) => s !== sym);
      return [sym, ...prev].slice(0, 24);
    });
  }, []);

  const toggleIndicator = (id: ChartIndicator) => {
    setIndicators((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <select
        value={dataSource}
        onChange={(e) => {
          setDataSource(e.target.value as ChartDataSource);
          invalidateChartCache();
        }}
        className="tf-field text-xs rounded-lg border px-2 py-1.5"
        title="Data source"
      >
        {CHART_DATA_SOURCES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        value={chartType}
        onChange={(e) => setChartType(e.target.value as ChartType)}
        className="tf-field text-xs rounded-lg border px-2 py-1.5"
      >
        {CHART_TYPES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-dark-elevated border border-dark-border overflow-x-auto max-w-[min(100%,480px)]">
        {CHART_TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            type="button"
            onClick={() => setTimeframe(tf.id)}
            className={`px-2 py-1 text-[10px] font-bold rounded whitespace-nowrap ${
              timeframe === tf.id ? 'bg-gold text-dark-surface' : 'text-dark-muted hover:text-slate-200'
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <div className="hidden lg:flex flex-wrap gap-1 max-w-[280px]">
        {CHART_INDICATORS.map((ind) => (
          <button
            key={ind.id}
            type="button"
            onClick={() => toggleIndicator(ind.id)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
              indicators.includes(ind.id)
                ? 'bg-gold/15 border-gold/40 text-gold'
                : 'border-dark-border text-dark-muted'
            }`}
          >
            {ind.label}
          </button>
        ))}
      </div>
      <select
        className="lg:hidden tf-field text-xs rounded-lg border px-2 py-1.5"
        value={indicators[0] ?? ''}
        onChange={(e) => setIndicators(e.target.value ? [e.target.value as ChartIndicator] : [])}
      >
        <option value="">Indicators…</option>
        {CHART_INDICATORS.map((ind) => (
          <option key={ind.id} value={ind.id}>
            {ind.label}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setLayout('single')}
          className={`p-2 rounded-lg border ${layout === 'single' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-dark-border text-dark-muted'}`}
        >
          <LineChart className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setLayout('dual')}
          className={`p-2 rounded-lg border ${layout === 'dual' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-dark-border text-dark-muted'}`}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
      </div>
      {!fullscreen && (
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="p-2 rounded-lg border border-dark-border text-dark-muted hover:text-gold"
        >
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setFullscreen((f) => {
            if (!f) setSidebarOpen(false);
            return !f;
          });
        }}
        className="p-2 rounded-lg border border-gold/40 bg-gold/10 text-gold"
      >
        {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
    </div>
  );

  const workspaceInner = (
    <div className={`flex flex-1 min-h-0 gap-2 ${fullscreen ? 'h-full' : ''}`}>
      <SymbolSidebar
        open={sidebarOpen}
        fullscreen={fullscreen}
        symbol={symbol}
        search={search}
        symbolTab={symbolTab}
        watchlist={watchlist}
        onSearchChange={setSearch}
        onSearchEnter={(s) => selectSymbol(s)}
        onTabChange={setSymbolTab}
        onSelect={selectSymbol}
        onToggleWatchlist={toggleWatchlist}
      />
      <div className={`flex flex-col flex-1 min-h-0 min-w-0 ${fullscreen && sidebarOpen ? 'ml-56' : ''}`}>
        <ChartPanels {...chartPanelProps} />
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-dark-bg">
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-2 py-2 border-b border-dark-border bg-dark-surface">
          <CandlestickChart className="w-5 h-5 text-gold" />
          <span className="text-sm font-bold text-gold">{symbol}</span>
          <LiveQuoteBadge symbol={symbol} />
          <button type="button" onClick={() => setSidebarOpen((o) => !o)} className="text-[10px] px-2 py-1 border border-dark-border rounded">
            Symbols
          </button>
          <div className="flex-1" />
          {toolbar}
          <button type="button" onClick={() => setFullscreen(false)} className="p-2 text-dark-muted hover:text-red-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div ref={chartStageRef} className="flex-1 min-h-0 p-1">
          {workspaceInner}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-h-[calc(100vh-5rem)]">
      <div className="shrink-0 app-card p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center">
            <CandlestickChart className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gold">Pro Charts</h2>
            <p className="text-[11px] text-dark-muted flex items-center gap-1">
              <Database className="w-3 h-3" />
              Real NSE prices on TradeX Live · your charts, your journal
            </p>
          </div>
        </div>
        {toolbar}
      </div>
      <div ref={chartStageRef} className="flex flex-1 flex-col min-h-[calc(100vh-10rem)]">
        {workspaceInner}
      </div>
      {dataSource === 'broker' && (
        <p className="text-[10px] text-center text-amber-400/90 px-4">
          External chart feed: optional env config — until then TradeX live feed is used.
        </p>
      )}
    </div>
  );
}
