import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Layers,
  PieChart,
  Activity,
  Wifi,
} from 'lucide-react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useAutoRefreshMeta } from '../context/AutoRefreshContext';
import { SECTORS } from '../data/marketData';
import type { StockHeatmapItem, SectorHeatmapItem, OIHeatmapStrike } from '../data/marketData';
import { fetchLiveHeatmap, type LiveHeatmapBundle } from '../services/heatmapLive';

type HeatmapTab = 'stocks' | 'sectors' | 'oi';

const OI_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'] as const;
function changeColor(value: number, strong = 3): string {
  if (value >= strong) return '#00c853';
  if (value >= strong / 2) return '#00e676';
  if (value >= strong / 6) return '#69f0ae';
  if (value > 0) return '#b9f6ca';
  if (value <= -strong) return '#d50000';
  if (value <= -strong / 2) return '#ff1744';
  if (value <= -strong / 6) return '#ff5252';
  return '#ff8a80';
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

function textOnBg(change: number, strong = 1.5): string {
  return Math.abs(change) >= strong ? '#ffffff' : '#0a0e1a';
}

function TreemapCell({
  label,
  sublabel,
  changePercent,
  sizeWeight,
  maxWeight,
  onHover,
  onLeave,
}: {
  label: string;
  sublabel?: string;
  changePercent: number;
  sizeWeight: number;
  maxWeight: number;
  onHover?: () => void;
  onLeave?: () => void;
}) {
  const width = Math.max(72, (sizeWeight / maxWeight) * 280);
  const height = Math.max(56, width * 0.65);

  return (
    <motion.div
      layout
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="relative rounded-lg p-2 flex flex-col items-center justify-center cursor-pointer overflow-hidden group shadow-md shrink-0"
      style={{
        backgroundColor: changeColor(changePercent),
        flex: `1 1 ${width}px`,
        minHeight: height,
      }}
    >
      <span className="text-xs font-black tracking-tight" style={{ color: textOnBg(changePercent) }}>
        {label}
      </span>
      {sublabel && (
        <span className="text-[9px] font-medium opacity-80 mt-0.5" style={{ color: textOnBg(changePercent) }}>
          {sublabel}
        </span>
      )}
      <span className="text-[10px] font-bold mt-0.5" style={{ color: textOnBg(changePercent) }}>
        {changePercent > 0 ? '+' : ''}
        {changePercent}%
      </span>
      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
    </motion.div>
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
  const [sectorFilter, setSectorFilter] = useState('All');
  const [oiSymbol, setOiSymbol] = useState<(typeof OI_SYMBOLS)[number]>('NIFTY');
  const [bundle, setBundle] = useState<LiveHeatmapBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<StockHeatmapItem | SectorHeatmapItem | OIHeatmapStrike | null>(null);
  const { lastAt } = useAutoRefreshMeta();

  const refresh = useCallback(async () => {
    const data = await fetchLiveHeatmap(oiSymbol);
    setBundle(data);
    setLoading(false);
  }, [oiSymbol]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [oiSymbol, refresh]);

  useAutoRefresh(() => {
    void refresh();
  });

  const stocks = bundle?.stocks ?? [];
  const sectors = bundle?.sectors ?? [];
  const oi = bundle?.oi;

  const filteredStocks = useMemo(
    () => (sectorFilter === 'All' ? stocks : stocks.filter((s) => s.sector === sectorFilter)),
    [stocks, sectorFilter],
  );

  const maxStockCap = useMemo(
    () => Math.max(...filteredStocks.map((s) => s.marketCap), 1),
    [filteredStocks],
  );
  const maxSectorCap = useMemo(() => Math.max(...sectors.map((s) => s.marketCap), 1), [sectors]);

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Market Heatmap
          </h2>
          <p className="text-sm text-slate-500 flex items-center gap-2 mt-0.5">
            <Wifi className={`w-3.5 h-3.5 ${livePulse ? 'text-emerald-500' : 'text-slate-500'}`} />
            Last sync {lastSync}
            {loading && <span className="text-amber-400/80"> · updating…</span>}
          </p>
        </div>
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
          <div className="flex-1 flex h-1.5 rounded-full overflow-hidden min-w-[120px]">
            {['#d50000', '#ff1744', '#ff5252', '#ff8a80', '#b9f6ca', '#69f0ae', '#00e676', '#00c853'].map((c) => (
              <div key={c} className="flex-1" style={{ background: c }} />
            ))}
          </div>
        )}
        <div className="flex gap-3 text-[9px] text-slate-500 font-bold">
          <span className="text-red-400">Bearish</span>
          <span className="text-emerald-400">Bullish</span>
        </div>
      </div>

      {/* Heatmap body */}
      <div className="app-card p-2 sm:p-3 min-h-[420px]">
        <AnimatePresence mode="wait">
          {tab === 'stocks' && (
            <motion.div
              key="stocks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap gap-1 w-full content-start"
            >
              {filteredStocks
                .sort((a, b) => b.marketCap - a.marketCap)
                .map((item) => (
                  <TreemapCell
                    key={item.symbol}
                    label={item.symbol}
                    sublabel={item.sector}
                    changePercent={item.changePercent}
                    sizeWeight={item.marketCap}
                    maxWeight={maxStockCap}
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
              className="flex flex-wrap gap-1 w-full content-start"
            >
              {sectors.map((item) => (
                <TreemapCell
                  key={item.sector}
                  label={item.sector}
                  sublabel={`${item.stockCount} stocks`}
                  changePercent={item.changePercent}
                  sizeWeight={item.marketCap}
                  maxWeight={maxSectorCap}
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
