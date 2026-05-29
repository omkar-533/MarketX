import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, PieChart, Activity, Wifi, Zap } from 'lucide-react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useAutoRefreshMeta } from '../context/AutoRefreshContext';
import type { StockHeatmapItem, SectorHeatmapItem, OIHeatmapStrike } from '../data/marketData';
import { SECTORS } from '../data/marketData';
import { LIVE_DATA_LABEL } from '../constants/brandLabels';
import {
  buildHeatmapSnapshot,
  fetchLiveHeatmap,
  refreshHeatmapOi,
  refreshHeatmapSectors,
  refreshHeatmapTabLive,
  type LiveHeatmapBundle,
} from '../services/heatmapLive';
import { subscribeMarketLive } from '../services/marketLiveStore';
import { API_SERVER_READY_EVENT, FYERS_MARKET_LIVE_EVENT } from '../services/apiAutoConnect';

type HeatmapTab = 'stocks' | 'sectors' | 'oi';

const OI_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'] as const;

const POS_RGB = '16, 185, 129';
const NEG_RGB = '239, 68, 68';

const HEATMAP_PRESETS = [
  { id: 'top50' as const, label: 'Nifty 50' },
  { id: 'all' as const, label: 'All Stocks' },
  { id: 'banking' as const, label: 'Nifty Bank' },
  { id: 'it' as const, label: 'Nifty IT' },
  { id: 'pharma' as const, label: 'Pharma' },
  { id: 'auto' as const, label: 'Auto' },
];

type HeatmapPreset = (typeof HEATMAP_PRESETS)[number]['id'];

/** Tile fill — stronger tint as |% move| grows (dark theme) */
function flatHeatColor(value: number, maxAbsMove: number): string {
  const max = Math.max(maxAbsMove, 0.01);
  const t = Math.min(1, Math.abs(value) / max);
  const alpha = 0.18 + t * 0.72;
  if (value > 0.02) return `rgba(${POS_RGB}, ${alpha})`;
  if (value < -0.02) return `rgba(${NEG_RGB}, ${alpha})`;
  return 'rgba(51, 65, 85, 0.55)';
}

function cellTextColor(value: number, maxAbsMove: number): string {
  const t = Math.abs(value) / Math.max(maxAbsMove, 0.01);
  if (t > 0.45) return '#f8fafc';
  if (t > 0.2) return '#e2e8f0';
  return '#94a3b8';
}

function shortStockName(name: string): string {
  return name
    .replace(/\s+(Limited|Ltd\.?|Industries|India|Corp\.?|Corporation)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatHeatPct(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 10 ? 1 : 2;
  return `${value > 0 ? '' : value < 0 ? '-' : ''}${abs.toFixed(digits)}%`;
}

function textOnBg(change: number, maxAbs = 4): string {
  return Math.abs(change) >= maxAbs * 0.5 ? '#f8fafc' : '#0a0e1a';
}

function oiChangeColor(value: number): string {
  if (value >= 8) return '#7c3aed';
  if (value >= 4) return '#a855f7';
  if (value >= 1.5) return '#c084fc';
  if (value > 0) return '#ddd6fe';
  if (value <= -8) return '#b45309';
  if (value <= -4) return '#d97706';
  if (value <= -1.5) return '#fbbf24';
  return '#fde68a';
}

function GridHeatmapCell({
  title,
  changePercent,
  maxAbsMove,
  onHover,
  onLeave,
}: {
  title: string;
  changePercent: number;
  maxAbsMove: number;
  onHover?: () => void;
  onLeave?: () => void;
}) {
  const bg = flatHeatColor(changePercent, maxAbsMove);
  const fg = cellTextColor(changePercent, maxAbsMove);
  const pct = formatHeatPct(changePercent);

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      title={`${title} · ${pct}`}
      className="flex flex-col items-center justify-center min-h-[72px] px-2 py-3 text-center bg-dark-elevated border border-dark-border/60 transition-all hover:border-gold/40 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
      style={{ backgroundColor: bg }}
    >
      <span
        className="text-[12px] font-bold leading-tight line-clamp-2 w-full"
        style={{ color: fg }}
      >
        {title}
      </span>
      <span className="text-[12px] font-black tabular-nums mt-1" style={{ color: fg }}>
        {pct}
      </span>
    </button>
  );
}

function OiStrikeRow({
  row,
  maxTotalOi,
  onHover,
  onLeave,
}: {
  row: OIHeatmapStrike;
  maxTotalOi: number;
  onHover?: () => void;
  onLeave?: () => void;
}) {
  const barPct = (row.totalOi / maxTotalOi) * 100;
  return (
    <tr
      className={`${row.isAtm ? 'bg-gold/5' : ''} hover:bg-dark-elevated/50 cursor-default`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <td className="px-2 py-1.5 text-xs font-bold text-slate-300 tabular-nums whitespace-nowrap">
        {row.strike.toLocaleString('en-IN')}
        {row.isAtm && (
          <span className="ml-1.5 text-[9px] font-bold text-gold uppercase">ATM</span>
        )}
      </td>
      <td
        className="px-2 py-1.5 text-center text-[10px] font-bold tabular-nums"
        style={{ backgroundColor: oiChangeColor(row.ceOiChgPct), color: textOnBg(row.ceOiChgPct, 4) }}
      >
        {row.ceOiChgPct > 0 ? '+' : ''}
        {row.ceOiChgPct}%
      </td>
      <td
        className="px-2 py-1.5 text-center text-[10px] font-bold tabular-nums"
        style={{ backgroundColor: oiChangeColor(row.peOiChgPct), color: textOnBg(row.peOiChgPct, 4) }}
      >
        {row.peOiChgPct > 0 ? '+' : ''}
        {row.peOiChgPct}%
      </td>
      <td className="px-2 py-1.5 min-w-[100px]">
        <div className="h-1.5 rounded-full bg-dark-border overflow-hidden">
          <div
            className="h-full bg-gold/70 rounded-full transition-all duration-500"
            style={{ width: `${barPct}%` }}
          />
        </div>
        <span className="text-[9px] text-slate-600 tabular-nums">
          {(row.totalOi / 100000).toFixed(1)}L OI
        </span>
      </td>
    </tr>
  );
}

export default function MarketHeatmap() {
  const [tab, setTab] = useState<HeatmapTab>('stocks');
  const [preset, setPreset] = useState<HeatmapPreset>('top50');
  const [sectorFilter, setSectorFilter] = useState('All');
  const [oiSymbol, setOiSymbol] = useState<(typeof OI_SYMBOLS)[number]>('NIFTY');
  const [bundle, setBundle] = useState<LiveHeatmapBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<StockHeatmapItem | SectorHeatmapItem | OIHeatmapStrike | null>(null);
  const { lastAt } = useAutoRefreshMeta();

  const applySnapshot = useCallback(
    (snap: LiveHeatmapBundle) => {
      setBundle(snap);
      setLoading(false);
    },
    [],
  );

  const refreshFull = useCallback(async () => {
    try {
      const data = await fetchLiveHeatmap(oiSymbol, { forceOi: true });
      applySnapshot(data);
    } catch {
      applySnapshot(buildHeatmapSnapshot(oiSymbol));
    }
  }, [oiSymbol, applySnapshot]);

  const refreshFast = useCallback(() => {
    applySnapshot(buildHeatmapSnapshot(oiSymbol));
  }, [oiSymbol, applySnapshot]);

  const applyLiveSnapshot = useCallback(() => {
    applySnapshot(buildHeatmapSnapshot(oiSymbol));
  }, [oiSymbol, applySnapshot]);

  const refreshTabLive = useCallback(async () => {
    if (tab === 'stocks') return;
    try {
      await refreshHeatmapTabLive(tab, oiSymbol);
      applyLiveSnapshot();
    } catch {
      refreshFast();
    }
  }, [tab, oiSymbol, applyLiveSnapshot, refreshFast]);

  useEffect(() => {
    setLoading(true);
    void refreshFull();
  }, [oiSymbol, refreshFull]);

  useEffect(() => {
    void refreshTabLive();
  }, [tab, oiSymbol, refreshTabLive]);

  useAutoRefresh(() => {
    if (tab === 'stocks') {
      void refreshFull();
      return;
    }
    if (tab === 'sectors') {
      void refreshHeatmapSectors().then(applyLiveSnapshot).catch(refreshFast);
      return;
    }
    void refreshHeatmapOi(oiSymbol).then(applyLiveSnapshot).catch(refreshFast);
  });

  useEffect(() => subscribeMarketLive(refreshFast), [refreshFast]);

  useEffect(() => {
    const onConnected = () => void refreshFull();
    window.addEventListener(FYERS_MARKET_LIVE_EVENT, onConnected);
    window.addEventListener(API_SERVER_READY_EVENT, onConnected);
    return () => {
      window.removeEventListener(FYERS_MARKET_LIVE_EVENT, onConnected);
      window.removeEventListener(API_SERVER_READY_EVENT, onConnected);
    };
  }, [refreshFull]);

  useEffect(() => {
    if (tab !== 'oi') return;
    const id = window.setInterval(() => {
      void refreshHeatmapOi(oiSymbol).then(applyLiveSnapshot);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [tab, oiSymbol, applyLiveSnapshot]);

  const stocks = bundle?.stocks ?? [];
  const sectors = bundle?.sectors ?? [];
  const oi = bundle?.oi;

  const presetStocks = useMemo(() => {
    let list = [...stocks];
    if (preset === 'top50') {
      list = [...list].sort((a, b) => b.marketCap - a.marketCap).slice(0, 50);
    } else if (preset === 'banking') {
      list = list.filter((s) => s.sector === 'Banking' || s.sector === 'NBFC');
    } else if (preset === 'it') {
      list = list.filter((s) => s.sector === 'IT');
    } else if (preset === 'pharma') {
      list = list.filter((s) => s.sector === 'Pharma');
    } else if (preset === 'auto') {
      list = list.filter((s) => s.sector === 'Auto');
    }
    if (sectorFilter !== 'All') {
      list = list.filter((s) => s.sector === sectorFilter);
    }
    return list;
  }, [stocks, preset, sectorFilter]);

  const sortedStocks = useMemo(
    () => [...presetStocks].sort((a, b) => b.changePercent - a.changePercent),
    [presetStocks],
  );

  const sortedSectors = useMemo(
    () => [...sectors].sort((a, b) => b.changePercent - a.changePercent),
    [sectors],
  );

  const maxStockAbsMove = useMemo(
    () => Math.max(...sortedStocks.map((s) => Math.abs(s.changePercent)), 0.01),
    [sortedStocks],
  );

  const maxSectorAbsMove = useMemo(
    () => Math.max(...sortedSectors.map((s) => Math.abs(s.changePercent)), 0.01),
    [sortedSectors],
  );

  const stockStats = useMemo(() => {
    const adv = stocks.filter((s) => s.changePercent > 0).length;
    const dec = stocks.filter((s) => s.changePercent < 0).length;
    const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
    return {
      adv,
      dec,
      top: sorted[0],
      bottom: sorted[sorted.length - 1],
    };
  }, [stocks]);

  const maxOiTotal = useMemo(
    () => Math.max(...(oi?.strikes.map((s) => s.totalOi) ?? [1])),
    [oi],
  );

  const lastSync = bundle?.fetchedAt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) ?? '—';
  const livePulse = lastAt > 0;
  const isLive = Boolean(bundle?.live);
  const quoteCount = bundle?.quoteCount ?? 0;
  const oiStrikeCount = bundle?.oiStrikeCount ?? oi?.strikes.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Market Heatmap
          </h2>
          <p className="text-sm text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
            <Wifi className={`w-3.5 h-3.5 ${isLive && livePulse ? 'text-emerald-500' : 'text-slate-500'}`} />
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                isLive
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              {isLive ? LIVE_DATA_LABEL : 'Waiting for live feed'}
            </span>
            <span>
              {quoteCount} F&amp;O LTP
              {tab === 'sectors' ? ` · ${sectors.length} sectors` : ''}
              {tab === 'oi' ? ` · ${oiStrikeCount} OI strikes` : ''}
              {' · '}
              {lastSync}
              {loading && <span className="text-amber-400/80"> · updating…</span>}
            </span>
          </p>
        </div>
        {tab === 'stocks' && (
          <div className="flex flex-wrap gap-1 p-1 app-card max-w-fit">
            {HEATMAP_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  preset === p.id ? 'bg-gold text-dark-surface' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-2 p-1 app-card max-w-fit">
        {(
          [
            { id: 'stocks' as const, label: 'Stocks', icon: PieChart },
            { id: 'sectors' as const, label: 'Sectors', icon: Layers },
            { id: 'oi' as const, label: 'OI Heatmap', icon: Activity },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === id ? 'bg-gold text-dark-surface' : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Summary row — context per tab */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tab === 'stocks' && (
          <>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Advancing</span>
              <span className="text-lg font-bold text-emerald-400">{stockStats.adv} stocks</span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Declining</span>
              <span className="text-lg font-bold text-red-400">{stockStats.dec} stocks</span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Top gainer</span>
              <span className="text-sm font-bold text-emerald-400">
                {stockStats.top?.symbol} (+{stockStats.top?.changePercent}%)
              </span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Top loser</span>
              <span className="text-sm font-bold text-red-400">
                {stockStats.bottom?.symbol} ({stockStats.bottom?.changePercent}%)
              </span>
            </div>
          </>
        )}
        {tab === 'sectors' && (
          <>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Sectors</span>
              <span className="text-lg font-bold text-slate-200">{sectors.length}</span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Best sector</span>
              <span className="text-sm font-bold text-emerald-400">
                {[...sectors].sort((a, b) => b.changePercent - a.changePercent)[0]?.sector ?? '—'}
              </span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Weakest sector</span>
              <span className="text-sm font-bold text-red-400">
                {[...sectors].sort((a, b) => a.changePercent - b.changePercent)[0]?.sector ?? '—'}
              </span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Coverage</span>
              <span className="text-lg font-bold text-gold">{stocks.length} stocks</span>
            </div>
          </>
        )}
        {tab === 'oi' && oi && (
          <>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Spot</span>
              <span className="text-lg font-bold text-slate-200 tabular-nums">
                {oi.spotPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">PCR</span>
              <span className="text-lg font-bold text-gold tabular-nums">{oi.pcr}</span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Total CE OI</span>
              <span className="text-sm font-bold text-red-400 tabular-nums">
                {(oi.totalCeOi / 100000).toFixed(1)}L
              </span>
            </div>
            <div className="app-card p-3">
              <span className="text-[10px] text-slate-600 block font-bold uppercase">Total PE OI</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">
                {(oi.totalPeOi / 100000).toFixed(1)}L
              </span>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {tab === 'stocks' && (
          <div className="flex flex-wrap gap-1 p-1 app-card">
            {SECTORS.slice(0, 8).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSectorFilter(s)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all ${
                  sectorFilter === s ? 'bg-gold text-dark-surface' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {tab === 'oi' && (
          <div className="flex gap-1 p-1 app-card">
            {OI_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setOiSymbol(sym)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  oiSymbol === sym ? 'bg-gold text-dark-surface' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 app-card p-2">
        <span className="text-[9px] text-slate-600 font-bold uppercase">
          {tab === 'oi' ? 'OI change %' : 'Price change %'}
        </span>
        {tab === 'oi' ? (
          <div className="flex-1 flex h-1.5 rounded-full overflow-hidden min-w-[120px]">
            {['#b45309', '#fbbf24', '#fde68a', '#ddd6fe', '#c084fc', '#7c3aed'].map((c) => (
              <div key={c} className="flex-1" style={{ background: c }} />
            ))}
          </div>
        ) : (
          <div
            className="flex-1 flex h-1.5 rounded-full overflow-hidden min-w-[120px]"
            style={{
              background: `linear-gradient(90deg, rgba(${NEG_RGB},0.9), rgba(${NEG_RGB},0.25), rgba(51,65,85,0.5), rgba(${POS_RGB},0.25), rgba(${POS_RGB},0.9))`,
            }}
          />
        )}
        <div className="flex gap-3 text-[9px] text-slate-500 font-bold">
          <span className="text-red-400">Losers</span>
          <span className="text-slate-600">F&amp;O · sorted by %</span>
          <span className="text-emerald-400">Gainers</span>
        </div>
      </div>

      {/* Heatmap body — 3-column grid */}
      <div className="app-card p-1 min-h-[420px] overflow-hidden">
        {!isLive && !loading && (
          <p className="text-xs text-amber-300/90 px-3 py-2 border-b border-dark-border">
            Connect TradeX Live in Profile — showing last cached quotes until feed connects.
          </p>
        )}
        <AnimatePresence mode="wait">
          {tab === 'stocks' && (
            <motion.div
              key="stocks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-dark-border"
            >
              {sortedStocks.map((item) => (
                <GridHeatmapCell
                  key={item.symbol}
                  title={shortStockName(item.name)}
                  changePercent={item.changePercent}
                  maxAbsMove={maxStockAbsMove}
                  onHover={() => setHovered(item)}
                  onLeave={() => setHovered(null)}
                />
              ))}
            </motion.div>
          )}

          {tab === 'sectors' && (
            <motion.div
              key="sectors"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-dark-border"
            >
              {sortedSectors.map((item) => (
                <GridHeatmapCell
                  key={item.sector}
                  title={item.sector}
                  changePercent={item.changePercent}
                  maxAbsMove={maxSectorAbsMove}
                  onHover={() => setHovered(item)}
                  onLeave={() => setHovered(null)}
                />
              ))}
            </motion.div>
          )}

          {tab === 'oi' && oi && (
            <motion.div
              key="oi"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-x-auto"
            >
              <table className="w-full min-w-[480px] border-collapse">
                <thead>
                  <tr className="border-b border-dark-border text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="text-left px-2 py-2">Strike</th>
                    <th className="text-center px-2 py-2 text-red-400">CE OI Δ%</th>
                    <th className="text-center px-2 py-2 text-emerald-400">PE OI Δ%</th>
                    <th className="text-left px-2 py-2">Total OI</th>
                  </tr>
                </thead>
                <tbody>
                  {oi.strikes.map((row) => (
                    <OiStrikeRow
                      key={row.strike}
                      row={row}
                      maxTotalOi={maxOiTotal}
                      onHover={() => setHovered(row)}
                      onLeave={() => setHovered(null)}
                    />
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && 'symbol' in hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-8 right-8 z-[80] app-card-elevated p-4 w-64 shadow-2xl border-gold/30"
          >
            <div className="flex justify-between mb-2">
              <span className="text-gold font-bold">{hovered.symbol}</span>
              <span className="text-[10px] bg-dark-elevated px-2 py-0.5 rounded text-slate-500">
                {hovered.sector}
              </span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Price</span>
                <span className="text-slate-200 font-bold tabular-nums">₹{hovered.price.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Change</span>
                <span className={hovered.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {hovered.changePercent > 0 ? '+' : ''}
                  {hovered.changePercent}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mkt cap</span>
                <span className="text-slate-300">₹{(hovered.marketCap / 1000).toFixed(0)}K Cr</span>
              </div>
            </div>
          </motion.div>
        )}
        {hovered && 'stockCount' in hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-8 right-8 z-[80] app-card-elevated p-4 w-64 shadow-2xl border-gold/30"
          >
            <span className="text-gold font-bold text-lg">{hovered.sector}</span>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Weighted chg</span>
                <span className={hovered.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {hovered.changePercent > 0 ? '+' : ''}
                  {hovered.changePercent}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Stocks</span>
                <span className="text-slate-200">{hovered.stockCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Adv / Dec</span>
                <span>
                  <span className="text-emerald-400">{hovered.advancers}</span>
                  <span className="text-slate-600"> / </span>
                  <span className="text-red-400">{hovered.decliners}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Top / Bottom</span>
                <span className="text-slate-300">
                  {hovered.topGainer} / {hovered.topLoser}
                </span>
              </div>
            </div>
          </motion.div>
        )}
        {hovered && 'strike' in hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-8 right-8 z-[80] app-card-elevated p-4 w-64 shadow-2xl border-gold/30"
          >
            <div className="flex justify-between mb-2">
              <span className="text-gold font-bold">Strike {hovered.strike}</span>
              {hovered.isAtm && (
                <span className="text-[9px] font-bold text-gold uppercase">ATM</span>
              )}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">CE OI Δ</span>
                <span className="text-red-400">
                  {hovered.ceOiChgPct > 0 ? '+' : ''}
                  {hovered.ceOiChgPct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PE OI Δ</span>
                <span className="text-emerald-400">
                  {hovered.peOiChgPct > 0 ? '+' : ''}
                  {hovered.peOiChgPct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total OI</span>
                <span className="text-slate-200 tabular-nums">
                  {(hovered.totalOi / 100000).toFixed(2)}L
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
