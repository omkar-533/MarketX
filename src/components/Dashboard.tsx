import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Flame,
  TrendingDown,
  TrendingUp,
  Volume2,
  Zap,
} from 'lucide-react';
import { getMarketBreadth } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
  calculateMaxPain,
  getFuturesOIData,
  getGainers,
  getIndices,
  getLosers,
  getMostActive,
  getOIIntelligence,
  getOptionChain,
  getSectorHeatmapData,
  getSignals,
  type IndexData,
  type SectorHeatmapItem,
  type StockData,
} from '../data/marketData';

interface DashboardProps {
  onNavigate?: (tab: string) => void;
}

const HIDDEN_INDEX_SYMBOLS = new Set(['NIFTYNXT50']);

function sparklinePoints(base: number, current: number, len = 12): number[] {
  return Array.from({ length: len }, (_, i) =>
    Math.round((base + ((current - base) * i) / Math.max(len - 1, 1)) * 100) / 100,
  );
}

function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 64;
  const h = 28;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        fill="none"
        stroke={positive ? '#34d399' : '#f87171'}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

function IndexCard({ index, delay }: { index: IndexData; delay: number }) {
  const isPositive = index.change >= 0;
  const spark = useMemo(() => sparklinePoints(index.prevClose, index.price), [index.prevClose, index.price]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.04 }}
      className="app-card p-4 hover:border-[#d4af37]/25 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{index.symbol}</span>
          <p className="text-[9px] text-slate-600 truncate max-w-[100px]">{index.name}</p>
        </div>
        <MiniSparkline data={spark} positive={isPositive} />
      </div>
      <div className="text-xl font-bold text-white tabular-nums">
        {index.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className={`text-xs font-bold flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {isPositive ? '+' : ''}
          {index.changePercent.toFixed(2)}%
        </span>
        <span className="text-[10px] text-slate-500 tabular-nums">
          {isPositive ? '+' : ''}
          {index.change.toFixed(2)}
        </span>
      </div>
      <div className="mt-2 pt-2 border-t border-[#1a1f2e] flex justify-between text-[9px] text-slate-600">
        <span>
          H <span className="text-emerald-400/90">{index.high.toLocaleString('en-IN')}</span>
        </span>
        <span>
          L <span className="text-red-400/90">{index.low.toLocaleString('en-IN')}</span>
        </span>
        <span className="flex items-center gap-0.5">
          <Volume2 className="w-2.5 h-2.5" />
          {(index.volume / 1e6).toFixed(1)}M
        </span>
      </div>
    </motion.div>
  );
}

function StatPill({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const color =
    trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-[#d4af37]';
  return (
    <div className="px-3 py-2 rounded-lg bg-[#121520]/80 border border-[#1a1f2e] min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold truncate">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-slate-600 truncate">{sub}</div>}
    </div>
  );
}

function MoversPanel({
  stocks,
  type,
}: {
  stocks: StockData[];
  type: 'gainers' | 'losers' | 'active';
}) {
  const title = type === 'gainers' ? 'Top Gainers' : type === 'losers' ? 'Top Losers' : 'Most Active';
  const Icon = type === 'gainers' ? TrendingUp : type === 'losers' ? TrendingDown : Flame;
  const accent =
    type === 'gainers' ? 'text-emerald-400' : type === 'losers' ? 'text-red-400' : 'text-orange-400';

  return (
    <div className="app-card p-4 h-full">
      <h3 className={`text-xs font-bold mb-3 flex items-center gap-1.5 ${accent}`}>
        <Icon className="w-3.5 h-3.5" />
        {title}
      </h3>
      <div className="space-y-1">
        {stocks.slice(0, 6).map((stock, i) => (
          <div
            key={stock.symbol}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#121520] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-slate-600 w-4 font-bold">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-200">{stock.symbol}</div>
                <div className="text-[9px] text-slate-600 truncate">{stock.sector}</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-slate-200 tabular-nums">₹{stock.price.toLocaleString('en-IN')}</div>
              <div
                className={`text-[10px] font-semibold tabular-nums ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {stock.changePercent >= 0 ? '+' : ''}
                {stock.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectorStrip({ sectors }: { sectors: SectorHeatmapItem[] }) {
  return (
    <div className="app-card p-4">
      <h3 className="text-xs font-bold text-[#d4af37] mb-3 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" />
        Sector Performance
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sectors.slice(0, 8).map((s) => (
          <div
            key={s.sector}
            className="shrink-0 px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] min-w-[120px]"
          >
            <div className="text-[10px] text-slate-400 font-medium truncate">{s.sector}</div>
            <div
              className={`text-sm font-bold tabular-nums ${s.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {s.changePercent >= 0 ? '+' : ''}
              {s.changePercent.toFixed(2)}%
            </div>
            <div className="text-[9px] text-slate-600">
              {s.advancers}↑ {s.decliners}↓
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate: _onNavigate }: DashboardProps) {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [gainers, setGainers] = useState<StockData[]>([]);
  const [losers, setLosers] = useState<StockData[]>([]);
  const [active, setActive] = useState<StockData[]>([]);
  const [breadth, setBreadth] = useState(getMarketBreadth());
  const [sectors, setSectors] = useState<SectorHeatmapItem[]>([]);
  const [lastSync, setLastSync] = useState(new Date());

  const visibleIndices = useMemo(
    () => indices.filter((i) => !HIDDEN_INDEX_SYMBOLS.has(i.symbol)),
    [indices],
  );

  const oiSnap = useMemo(() => {
    const nifty = indices.find((i) => i.symbol === 'NIFTY');
    const spot = nifty?.price ?? 24580;
    const chain = getOptionChain('NIFTY', spot);
    const maxPain = calculateMaxPain(chain);
    const ceOi = chain.reduce((s, r) => s + r.ceOi, 0);
    const peOi = chain.reduce((s, r) => s + r.peOi, 0);
    const pcr = peOi / Math.max(ceOi, 1);
    const intel = getOIIntelligence('NIFTY');
    const fut = getFuturesOIData().find((f) => f.symbol === 'NIFTY');
    const signals = getSignals().filter((s) => s.signal !== 'HOLD').slice(0, 3);
    return { pcr, maxPain: maxPain.maxPainStrike, intel, fut, signals, ceOi, peOi };
  }, [indices, lastSync]);

  const refresh = useCallback(() => {
    setIndices(getIndices());
    setGainers(getGainers(6));
    setLosers(getLosers(6));
    setActive(getMostActive(6));
    setBreadth(getMarketBreadth());
    setSectors(getSectorHeatmapData());
    setLastSync(new Date());
  }, []);

  useAutoRefresh(refresh);

  const nifty = indices.find((i) => i.symbol === 'NIFTY');
  const bankNifty = indices.find((i) => i.symbol === 'BANKNIFTY');
  const pcrBias = oiSnap.pcr > 1.05 ? 'Bullish' : oiSnap.pcr < 0.95 ? 'Bearish' : 'Neutral';
  const sentimentScore = Math.round(
    50 +
      (nifty?.changePercent ?? 0) * 8 +
      (oiSnap.pcr > 1 ? 10 : -10) +
      (breadth.advances > breadth.declines ? 8 : -8),
  );
  const clampedSentiment = Math.max(0, Math.min(100, sentimentScore));

  return (
    <div className="space-y-4 pb-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-[#1a1f2e] bg-gradient-to-br from-[#121520] via-[#0b0e17] to-[#0a0c14] p-4 sm:p-5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#d4af37]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
                AI Powered Market Intelligent
              </span>
              <span className="text-[10px] text-slate-500">
                Updated {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            {nifty && (
              <div className="flex flex-wrap items-end gap-3 sm:gap-5">
                <div>
                  <div className="text-xs text-slate-500 font-medium">NIFTY 50</div>
                  <div className="text-3xl sm:text-4xl font-bold text-white tabular-nums tracking-tight">
                    {nifty.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div
                  className={`text-lg sm:text-xl font-bold tabular-nums ${nifty.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {nifty.change >= 0 ? '+' : ''}
                  {nifty.change.toFixed(2)} ({nifty.changePercent >= 0 ? '+' : ''}
                  {nifty.changePercent.toFixed(2)}%)
                </div>
                {bankNifty && (
                  <div className="text-sm text-slate-400">
                    BANK NIFTY{' '}
                    <span className={bankNifty.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {bankNifty.price.toLocaleString('en-IN')} ({bankNifty.changePercent >= 0 ? '+' : ''}
                      {bankNifty.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>
            )}
            {nifty && (
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
                <span>
                  O <span className="text-slate-300 font-medium tabular-nums">{nifty.open.toLocaleString('en-IN')}</span>
                </span>
                <span>
                  H <span className="text-emerald-400 font-medium tabular-nums">{nifty.high.toLocaleString('en-IN')}</span>
                </span>
                <span>
                  L <span className="text-red-400 font-medium tabular-nums">{nifty.low.toLocaleString('en-IN')}</span>
                </span>
                <span>
                  PC <span className="text-slate-300 font-medium tabular-nums">{nifty.prevClose.toLocaleString('en-IN')}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatPill label="PCR (OI)" value={oiSnap.pcr.toFixed(2)} sub={pcrBias} trend={oiSnap.pcr > 1 ? 'up' : 'down'} />
          <StatPill label="Max Pain" value={oiSnap.maxPain.toLocaleString('en-IN')} sub="NIFTY weekly" />
          <StatPill
            label="OI Bias"
            value={oiSnap.intel.marketBias}
            sub={oiSnap.intel.smartMoneySignal.slice(0, 28) + '…'}
          />
          <StatPill
            label="Futures"
            value={oiSnap.fut ? oiSnap.fut.futuresPrice.toLocaleString('en-IN') : '—'}
            sub={oiSnap.fut?.signal ?? '—'}
            trend={oiSnap.fut && oiSnap.fut.premiumDiscount >= 0 ? 'up' : 'down'}
          />
        </div>
      </div>

      {/* Indices */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {visibleIndices.map((index, i) => (
          <IndexCard key={index.symbol} index={index} delay={i} />
        ))}
      </div>

      {/* Sentiment + OI */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="app-card p-4">
          <h3 className="text-xs font-bold text-[#d4af37] mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Market Sentiment
          </h3>
          <div className="relative h-3 bg-[#1a1f2e] rounded-full overflow-hidden mb-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${clampedSentiment}%` }}
              className="h-full bg-gradient-to-r from-red-500 via-[#d4af37] to-emerald-500 rounded-full"
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-600 mb-3">
            <span>Bearish</span>
            <span>Neutral</span>
            <span>Bullish</span>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[#d4af37]">{clampedSentiment}%</div>
            <div className="text-[10px] text-slate-500">
              {clampedSentiment >= 60 ? 'Bullish' : clampedSentiment <= 40 ? 'Bearish' : 'Neutral'} composite
            </div>
          </div>
        </div>

        <div className="app-card p-4">
          <h3 className="text-xs font-bold text-[#d4af37] mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            OI Snapshot
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Total CE OI</span>
              <span className="text-red-300 font-bold tabular-nums">{(oiSnap.ceOi / 1e6).toFixed(2)}M</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total PE OI</span>
              <span className="text-emerald-300 font-bold tabular-nums">{(oiSnap.peOi / 1e6).toFixed(2)}M</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Support</span>
              <span className="text-slate-200 font-bold">{oiSnap.intel.strongestSupport.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Resistance</span>
              <span className="text-slate-200 font-bold">{oiSnap.intel.strongestResistance.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {oiSnap.signals.length > 0 && (
          <div className="app-card p-4">
            <h3 className="text-xs font-bold text-emerald-400 mb-2">Live Signals</h3>
            {oiSnap.signals.map((s) => (
              <div key={s.symbol} className="py-1.5 border-b border-[#1a1f2e] last:border-0">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-slate-200">{s.symbol}</span>
                  <span className={s.signal === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{s.signal}</span>
                </div>
                <div className="text-[10px] text-slate-600 truncate">{s.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SectorStrip sectors={sectors} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <MoversPanel stocks={gainers} type="gainers" />
        <MoversPanel stocks={losers} type="losers" />
        <MoversPanel stocks={active} type="active" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="app-card p-4">
          <h3 className="text-xs font-bold text-[#d4af37] mb-3 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            PCR Indicator
          </h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold text-[#d4af37] tabular-nums">{oiSnap.pcr.toFixed(2)}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                pcrBias === 'Bullish'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : pcrBias === 'Bearish'
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
              }`}
            >
              {pcrBias}
            </span>
          </div>
          <div className="h-2 bg-[#1a1f2e] rounded-full overflow-hidden flex mb-2">
            <div className="bg-red-500 h-full" style={{ width: '30%' }} />
            <div className="bg-[#d4af37] h-full" style={{ width: '20%' }} />
            <div className="bg-emerald-500 h-full" style={{ width: '50%' }} />
          </div>
          <p className="text-[9px] text-slate-600">PCR &gt; 1 often indicates put writing / bullish positioning</p>
        </div>

        <div className="app-card p-4">
          <h3 className="text-xs font-bold text-[#d4af37] mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Market Breadth
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Advances', value: breadth.advances, total: breadth.advances + breadth.declines + breadth.unchanged, color: 'bg-emerald-500' },
              { label: 'Declines', value: breadth.declines, total: breadth.advances + breadth.declines + breadth.unchanged, color: 'bg-red-500' },
              { label: 'Unchanged', value: breadth.unchanged, total: breadth.advances + breadth.declines + breadth.unchanged, color: 'bg-slate-500' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-[10px] text-slate-600 mb-1">
                  <span>{item.label}</span>
                  <span className="text-slate-400 tabular-nums">{item.value}</span>
                </div>
                <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.value / item.total) * 100}%` }}
                    className={`${item.color} h-full rounded-full`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-[#1a1f2e] grid grid-cols-2 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-emerald-400">{breadth.newHighs}</div>
              <div className="text-[9px] text-slate-600">New Highs</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-400">{breadth.newLows}</div>
              <div className="text-[9px] text-slate-600">New Lows</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-center text-slate-500">
            A/D Ratio <span className="text-[#d4af37] font-bold">{breadth.advanceDeclineRatio.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
