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
  const w = 72;
  const h = 26;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="shrink-0 opacity-90">
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.03 }}
      className="app-card p-3.5 h-full hover:border-[#d4af37]/25 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{index.symbol}</span>
          <p className="text-[9px] text-slate-600 truncate">{index.name}</p>
        </div>
        <MiniSparkline data={spark} positive={isPositive} />
      </div>
      <div className="text-lg font-bold text-white tabular-nums leading-tight">
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
    <div className="app-card p-3.5 h-full flex flex-col min-h-[280px]">
      <h3 className={`text-xs font-bold mb-2.5 flex items-center gap-1.5 ${accent}`}>
        <Icon className="w-3.5 h-3.5" />
        {title}
      </h3>
      <div className="space-y-0.5 flex-1">
        {stocks.slice(0, 6).map((stock, i) => (
          <div
            key={stock.symbol}
            className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[#121520] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-slate-600 w-3.5 font-bold tabular-nums">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-200">{stock.symbol}</div>
                <div className="text-[9px] text-slate-600 truncate">{stock.sector}</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-slate-200 tabular-nums">
                ₹{stock.price.toLocaleString('en-IN')}
              </div>
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

function SectorGrid({ sectors }: { sectors: SectorHeatmapItem[] }) {
  const list = sectors.slice(0, 8);
  return (
    <div className="app-card p-3.5 h-full">
      <h3 className="text-xs font-bold text-[#d4af37] mb-2.5 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" />
        Sector Performance
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {list.map((s) => (
          <div
            key={s.sector}
            className="px-2.5 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] min-w-0"
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
    const signals = getSignals().filter((s) => s.signal !== 'HOLD').slice(0, 4);
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
  const breadthTotal = Math.max(1, breadth.advances + breadth.declines + breadth.unchanged);

  return (
    <div className="space-y-3 pb-6">
      {/* Hero — left market pulse + right analytics strip */}
      <div className="relative overflow-hidden rounded-xl border border-[#1a1f2e] bg-gradient-to-br from-[#121520] via-[#0b0e17] to-[#0a0c14] p-4 sm:p-5">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#d4af37]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

        <div className="relative grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 items-stretch">
          <div className="xl:col-span-5 min-w-0 flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
                AI Powered Market Intelligent
              </span>
              <span className="text-[10px] text-slate-500">
                Updated {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {nifty && (
                <div className="rounded-lg bg-[#121520]/70 border border-[#1a1f2e] p-3">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">NIFTY 50</div>
                  <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums tracking-tight mt-0.5">
                    {nifty.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                  <div
                    className={`text-sm font-bold tabular-nums mt-1 ${nifty.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {nifty.change >= 0 ? '+' : ''}
                    {nifty.change.toFixed(2)} ({nifty.changePercent >= 0 ? '+' : ''}
                    {nifty.changePercent.toFixed(2)}%)
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-slate-500">
                    <span>
                      O <span className="text-slate-300 tabular-nums">{nifty.open.toLocaleString('en-IN')}</span>
                    </span>
                    <span>
                      H <span className="text-emerald-400 tabular-nums">{nifty.high.toLocaleString('en-IN')}</span>
                    </span>
                    <span>
                      L <span className="text-red-400 tabular-nums">{nifty.low.toLocaleString('en-IN')}</span>
                    </span>
                  </div>
                </div>
              )}

              {bankNifty && (
                <div className="rounded-lg bg-[#121520]/70 border border-[#1a1f2e] p-3">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">BANK NIFTY</div>
                  <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums tracking-tight mt-0.5">
                    {bankNifty.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                  <div
                    className={`text-sm font-bold tabular-nums mt-1 ${bankNifty.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {bankNifty.change >= 0 ? '+' : ''}
                    {bankNifty.change.toFixed(2)} ({bankNifty.changePercent >= 0 ? '+' : ''}
                    {bankNifty.changePercent.toFixed(2)}%)
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-slate-500">
                    <span>
                      O <span className="text-slate-300 tabular-nums">{bankNifty.open.toLocaleString('en-IN')}</span>
                    </span>
                    <span>
                      H <span className="text-emerald-400 tabular-nums">{bankNifty.high.toLocaleString('en-IN')}</span>
                    </span>
                    <span>
                      L <span className="text-red-400 tabular-nums">{bankNifty.low.toLocaleString('en-IN')}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="xl:col-span-7 grid grid-cols-2 lg:grid-cols-4 gap-2 auto-rows-fr">
            <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3 flex flex-col justify-between min-h-[108px]">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3 text-[#d4af37]" /> Sentiment
              </div>
              <div className="text-2xl font-bold text-[#d4af37] tabular-nums">{clampedSentiment}%</div>
              <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden mt-1">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${clampedSentiment}%` }}
                  className="h-full bg-gradient-to-r from-red-500 via-[#d4af37] to-emerald-500 rounded-full"
                />
              </div>
              <div className="text-[9px] text-slate-500 mt-1">
                {clampedSentiment >= 60 ? 'Bullish' : clampedSentiment <= 40 ? 'Bearish' : 'Neutral'} bias
              </div>
            </div>

            <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3 flex flex-col justify-between min-h-[108px]">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">PCR (OI)</div>
              <div className={`text-2xl font-bold tabular-nums ${oiSnap.pcr > 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                {oiSnap.pcr.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">{pcrBias}</div>
              <div className="text-[9px] text-slate-600">Max pain {oiSnap.maxPain.toLocaleString('en-IN')}</div>
            </div>

            <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3 flex flex-col justify-between min-h-[108px]">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                <Activity className="w-3 h-3 text-[#d4af37]" /> OI Snapshot
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">CE</span>
                  <span className="text-red-300 font-bold tabular-nums">{(oiSnap.ceOi / 1e6).toFixed(2)}M</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">PE</span>
                  <span className="text-emerald-300 font-bold tabular-nums">{(oiSnap.peOi / 1e6).toFixed(2)}M</span>
                </div>
              </div>
              <div className="text-[9px] text-slate-500 truncate">{oiSnap.intel.marketBias}</div>
            </div>

            <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3 flex flex-col justify-between min-h-[108px]">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Futures / Levels</div>
              <div className="text-lg font-bold text-white tabular-nums">
                {oiSnap.fut ? oiSnap.fut.futuresPrice.toLocaleString('en-IN') : '—'}
              </div>
              <div className="text-[10px] text-slate-400">{oiSnap.fut?.signal ?? '—'}</div>
              <div className="text-[9px] text-slate-600 space-y-0.5">
                <div>
                  S {oiSnap.intel.strongestSupport.toLocaleString('en-IN')}
                </div>
                <div>
                  R {oiSnap.intel.strongestResistance.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Indices — auto-fit, no empty columns */}
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
      >
        {visibleIndices.map((index, i) => (
          <IndexCard key={index.symbol} index={index} delay={i} />
        ))}
      </div>

      {/* Movers + breadth/signals — equal height row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <MoversPanel stocks={gainers} type="gainers" />
          <MoversPanel stocks={losers} type="losers" />
          <MoversPanel stocks={active} type="active" />
        </div>

        <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
          <div className="app-card p-3.5 h-full min-h-[160px]">
            <h3 className="text-xs font-bold text-[#d4af37] mb-2.5 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Market Breadth
            </h3>
            <div className="space-y-2">
              {[
                { label: 'Advances', value: breadth.advances, color: 'bg-emerald-500' },
                { label: 'Declines', value: breadth.declines, color: 'bg-red-500' },
                { label: 'Unchanged', value: breadth.unchanged, color: 'bg-slate-500' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>{item.label}</span>
                    <span className="text-slate-300 tabular-nums font-semibold">{item.value}</span>
                  </div>
                  <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.value / breadthTotal) * 100}%` }}
                      className={`${item.color} h-full rounded-full`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#1a1f2e] grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-base font-bold text-emerald-400 tabular-nums">{breadth.newHighs}</div>
                <div className="text-[9px] text-slate-600">Highs</div>
              </div>
              <div>
                <div className="text-base font-bold text-red-400 tabular-nums">{breadth.newLows}</div>
                <div className="text-[9px] text-slate-600">Lows</div>
              </div>
              <div>
                <div className="text-base font-bold text-[#d4af37] tabular-nums">
                  {breadth.advanceDeclineRatio.toFixed(2)}
                </div>
                <div className="text-[9px] text-slate-600">A/D</div>
              </div>
            </div>
          </div>

          <div className="app-card p-3.5 h-full min-h-[160px]">
            <h3 className="text-xs font-bold text-emerald-400 mb-2.5">Live Bias</h3>
            {oiSnap.signals.length > 0 ? (
              <div className="space-y-1">
                {oiSnap.signals.map((s) => {
                  const isBullish = s.signal === 'BUY';
                  const biasLabel = isBullish ? 'BULLISH' : 'BEARISH';
                  return (
                    <div key={s.symbol} className="py-1.5 px-2 rounded-md bg-[#121520] border border-[#1a1f2e]">
                      <div className="flex justify-between text-xs gap-2">
                        <span className="font-bold text-slate-200">{s.symbol}</span>
                        <span className={isBullish ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                          {biasLabel}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-600 truncate mt-0.5">{s.reason}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full min-h-[100px] flex items-center justify-center text-center px-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  No active bullish or bearish bias right now. Market is in wait-and-watch mode.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <SectorGrid sectors={sectors} />
    </div>
  );
}
