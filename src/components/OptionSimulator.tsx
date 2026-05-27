import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Calculator,
  Calendar,
  CandlestickChart,
  Copy,
  History,
  Layers,
  LineChart,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { formatTooltipPair, formatTooltipPairCurrency } from '../utils/rechartsFormat';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { calculateGreeks } from '../data/nseData';
import {
  EXPIRY_DATES,
  analyzeStrategy,
  applyStrategyTemplate,
  chainRowToLeg,
  createManualLeg,
  getChainPremium,
  getHistoricalIvSeries,
  getHistoricalSpotSeries,
  getIvAnalytics,
  getMarketSnapshot,
  getSymbolMeta,
  snapStrike,
  type SimLeg,
} from '../services/optionSimulatorEngine';
import { getFnoLiveQuotes, type LiveSymbolQuote } from '../services/symbolLiveService';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import SymbolMarketPicker from './strategy/SymbolMarketPicker';
import {
  BACKTEST_LOOKBACK_OPTIONS,
  downsampleChartBars,
  getOiDateBounds,
  OI_ENTRY_SIGNALS,
  OI_TIMEFRAMES,
  prepareOiSeries,
  runOiStrategyBacktest,
  type OiBacktestResult,
  type OiEntrySignal,
  type OiTimeframeId,
} from '../services/optionOiBacktest';
import StrategyTemplateGallery from './strategy/StrategyTemplateGallery';
import OpstraPayoffChart from './strategy/OpstraPayoffChart';
import { getStrategyVisual } from './strategy/strategyVisuals';

type TabId = 'builder' | 'payoff' | 'chain' | 'historical' | 'analytics' | 'backtest';

function fmtINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
}

function fmtK(n: number) {
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export default function OptionSimulator() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [expiry, setExpiry] = useState(EXPIRY_DATES[0]);
  const [tab, setTab] = useState<TabId>('builder');
  const [legs, setLegs] = useState<SimLeg[]>([]);
  const [lots, setLots] = useState(1);
  const [daysToExpiry, setDaysToExpiry] = useState(7);
  const [iv, setIv] = useState(() => getSymbolMeta('NIFTY').ivBase);
  const [interestRate] = useState(6);
  const [scenarioSpot, setScenarioSpot] = useState(0);
  const [scenarioIv, setScenarioIv] = useState(0);
  const [histDays, setHistDays] = useState(90);
  const [chainFilter, setChainFilter] = useState<'ALL' | 'ITM' | 'ATM' | 'OTM'>('ALL');
  const [showGreeks, setShowGreeks] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'heatmap'>('table');
  const [tick, setTick] = useState(0);
  const [editingLegId, setEditingLegId] = useState<string | null>(null);
  const [manualAction, setManualAction] = useState<'BUY' | 'SELL'>('BUY');
  const [manualType, setManualType] = useState<'CE' | 'PE'>('CE');
  const [manualStrike, setManualStrike] = useState(24600);
  const [manualPremium, setManualPremium] = useState(100);
  const [manualQty, setManualQty] = useState(1);
  const [customStrikeMode, setCustomStrikeMode] = useState(false);
  const [customStrikeInput, setCustomStrikeInput] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [btCapital, setBtCapital] = useState(500000);
  const [btHoldingDays, setBtHoldingDays] = useState(5);
  const [btDte, setBtDte] = useState(7);
  const [btSignal, setBtSignal] = useState<OiEntrySignal>('pcr_cross_up');
  const [btPcrThreshold, setBtPcrThreshold] = useState(1.05);
  const [btMaxPainPct, setBtMaxPainPct] = useState(0.5);
  const [btLookback, setBtLookback] = useState(365 * 2);
  const [btDateMode, setBtDateMode] = useState<'range' | 'preset'>('range');
  const [btStartDate, setBtStartDate] = useState('');
  const [btEndDate, setBtEndDate] = useState('');
  const [btTimeframe, setBtTimeframe] = useState<OiTimeframeId>('1D');
  const [btChartView, setBtChartView] = useState<'price' | 'pcr' | 'oi' | 'equity'>('price');
  const [btResult, setBtResult] = useState<OiBacktestResult | null>(null);
  const [btError, setBtError] = useState<string | null>(null);
  const [btRunning, setBtRunning] = useState(false);

  const oiDateBounds = useMemo(() => getOiDateBounds(symbol), [symbol]);

  useEffect(() => {
    if (oiDateBounds.min && oiDateBounds.max) {
      setBtStartDate(oiDateBounds.min);
      setBtEndDate(oiDateBounds.max);
    }
  }, [symbol, oiDateBounds.min, oiDateBounds.max]);

  const btPreviewSeries = useMemo(() => {
    if (!btStartDate || !btEndDate) return { bars: [], daily: [] };
    return prepareOiSeries(
      symbol,
      btTimeframe,
      btDateMode === 'range' ? btStartDate : undefined,
      btDateMode === 'range' ? btEndDate : undefined,
      btDateMode === 'preset' ? btLookback : 0,
    );
  }, [symbol, btTimeframe, btStartDate, btEndDate, btDateMode, btLookback]);

  const btChartData = useMemo(() => {
    const source = btResult?.chartBars?.length ? btResult.chartBars : btPreviewSeries.bars;
    return downsampleChartBars(
      source.map((b) => ({
        label: b.label,
        date: b.date,
        close: b.close,
        open: b.open,
        high: b.high,
        low: b.low,
        pcr: b.pcr,
        maxPain: b.maxPain,
        ceOi: b.totalCE_OI,
        peOi: b.totalPE_OI,
        volume: b.volume,
      })),
      450,
    );
  }, [btResult, btPreviewSeries.bars]);

  const btEquityChartData = useMemo(
    () => (btResult ? downsampleChartBars(btResult.equityCurve, 450) : []),
    [btResult],
  );

  const meta = useMemo(() => getSymbolMeta(symbol), [symbol, tick]);
  const snapshot = useMemo(() => getMarketSnapshot(symbol), [symbol, tick]);
  const liveQuote = snapshot.quote;
  const spot = snapshot.spot;
  const chain = snapshot.chain;
  const atmStrike = snapshot.atmStrike;

  useEffect(() => {
    getFnoLiveQuotes();
    setTick((t) => t + 1);
  }, []);

  useAutoRefresh(() => {
    getFnoLiveQuotes();
    setTick((t) => t + 1);
  });

  const handleSymbolSelect = (quote: LiveSymbolQuote) => {
    if (quote.symbol === symbol) return;
    if (legs.length > 0) {
      const ok = window.confirm(
        `Switch from ${symbol} to ${quote.symbol}? ${legs.length} leg(s) will be cleared.`,
      );
      if (!ok) return;
      setLegs([]);
      setSelectedTemplate(null);
    }
    setSymbol(quote.symbol);
    setIv(quote.iv);
    setScenarioIv(quote.iv);
  };

  useEffect(() => {
    setIv(meta.ivBase);
    setScenarioSpot(spot);
    setScenarioIv(meta.ivBase);
  }, [symbol, spot, meta.ivBase]);

  useEffect(() => {
    setManualStrike(atmStrike);
    setCustomStrikeInput(String(atmStrike));
  }, [symbol, atmStrike]);

  useEffect(() => {
    const mkt = getChainPremium(chain, manualStrike, manualType);
    if (mkt != null) setManualPremium(mkt);
  }, [manualStrike, manualType, chain]);

  const contractSize = meta.lotSize;

  const analytics = useMemo(
    () => analyzeStrategy(legs, scenarioSpot || spot, meta.interval, contractSize, daysToExpiry, scenarioIv || iv, interestRate / 100),
    [legs, scenarioSpot, spot, meta.interval, contractSize, daysToExpiry, scenarioIv, iv, interestRate],
  );

  useEffect(() => {
    setManualQty(lots);
  }, [lots]);

  const histSpot = useMemo(() => getHistoricalSpotSeries(symbol, histDays), [symbol, histDays, tick]);
  const histIv = useMemo(() => getHistoricalIvSeries(), [tick]);
  const ivAnalytics = useMemo(() => getIvAnalytics(symbol), [symbol, tick]);

  const visibleStrikes = useMemo(() => {
    if (chainFilter === 'ALL') return chain;
    return chain.filter((row) => {
      if (chainFilter === 'ATM') return row.strike === atmStrike;
      if (chainFilter === 'ITM') return row.strike < spot;
      return row.strike > spot;
    });
  }, [chain, chainFilter, atmStrike, spot]);

  const maxCeOi = Math.max(...chain.map((r) => r.ceOi), 1);
  const maxPeOi = Math.max(...chain.map((r) => r.peOi), 1);

  const addLeg = useCallback(
    (strike: number, side: 'CE' | 'PE', action: 'BUY' | 'SELL') => {
      const row = chain.find((r) => r.strike === strike);
      if (!row) return;
      setLegs((prev) => [...prev, chainRowToLeg(row, side, action, symbol, expiry, lots)]);
    },
    [chain, symbol, expiry, lots],
  );

  const removeLeg = (id: string) => {
    setLegs((prev) => prev.filter((l) => l.id !== id));
    if (editingLegId === id) setEditingLegId(null);
  };

  const updateLeg = (id: string, patch: Partial<SimLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const duplicateLeg = (id: string) => {
    const leg = legs.find((l) => l.id === id);
    if (!leg) return;
    const { id: _omit, ...rest } = leg;
    setLegs((prev) => [...prev, createManualLeg({ ...rest, symbol, expiry: leg.expiry || expiry })]);
  };

  const strikeOptions = useMemo(() => chain.map((r) => r.strike).sort((a, b) => a - b), [chain]);

  const resolvedManualStrike = customStrikeMode
    ? snapStrike(Number(customStrikeInput) || manualStrike, meta.interval)
    : manualStrike;

  const addManualLeg = () => {
    const strike = resolvedManualStrike;
    const premium = manualPremium > 0 ? manualPremium : getChainPremium(chain, strike, manualType) ?? 1;
    setLegs((prev) => [
      ...prev,
      createManualLeg({
        symbol,
        action: manualAction,
        type: manualType,
        strike,
        premium,
        quantity: manualQty,
        expiry,
      }),
    ]);
  };

  const syncLegPremiumFromChain = (legId: string) => {
    const leg = legs.find((l) => l.id === legId);
    if (!leg) return;
    const mkt = getChainPremium(chain, leg.strike, leg.type);
    if (mkt != null) updateLeg(legId, { premium: mkt });
  };

  const loadTemplate = (name: string) => {
    setSelectedTemplate(name);
    setLegs(applyStrategyTemplate(name, symbol, spot, lots));
    setEditingLegId(null);
  };

  const selectedVisual = selectedTemplate ? getStrategyVisual(selectedTemplate) : null;

  const runBacktest = () => {
    if (!legs.length) {
      setBtError('Add at least one leg in the Strategy tab first');
      setBtResult(null);
      return;
    }
    setBtRunning(true);
    setBtError(null);
    setTimeout(() => {
      const res = runOiStrategyBacktest(legs, {
        symbol,
        initialCapital: btCapital,
        holdingDays: btHoldingDays,
        dteAtEntry: btDte,
        entrySignal: btSignal,
        pcrThreshold: btPcrThreshold,
        maxPainDistancePct: btMaxPainPct,
        lookbackDays: btLookback,
        timeframe: btTimeframe,
        useDateRange: btDateMode === 'range',
        startDate: btStartDate,
        endDate: btEndDate,
        ivBase: iv,
      });
      if ('error' in res) {
        setBtError(res.error);
        setBtResult(null);
      } else {
        setBtResult(res);
      }
      setBtRunning(false);
    }, 400);
  };

  const btSignalMeta = OI_ENTRY_SIGNALS.find((s) => s.id === btSignal);

  const tabs: { id: TabId; label: string; icon: typeof Layers }[] = [
    { id: 'builder', label: 'Strategy', icon: Layers },
    { id: 'backtest', label: 'OI Backtest', icon: Play },
    { id: 'payoff', label: 'Payoff', icon: LineChart },
    { id: 'chain', label: 'Option Chain', icon: BarChart3 },
    { id: 'historical', label: 'Historical', icon: History },
    { id: 'analytics', label: 'Analytics', icon: Activity },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0a0f1a] text-slate-200">
      {/* Header */}
      <div className="shrink-0 border-b border-[#24324b] bg-gradient-to-r from-[#10213b] to-[#0d1728] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/30">
              <Calculator className="h-5 w-5 text-[#d4af37]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Option Strategy Simulator</h1>
              <p className="text-[11px] text-slate-400">Multi-leg · 5Y OI backtest · PCR & Max Pain signals</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SymbolMarketPicker selectedSymbol={symbol} onSelect={handleSymbolSelect} />
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="bg-[#172033] border border-[#24324b] rounded-lg px-2 py-1.5 text-xs text-white"
            >
              {EXPIRY_DATES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {liveQuote && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400 border-t border-[#172033] pt-2">
            <span className="font-bold text-white">{liveQuote.name}</span>
            <span className={`font-bold ${liveQuote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {liveQuote.changePercent >= 0 ? '+' : ''}
              {liveQuote.changePercent.toFixed(2)}% ({liveQuote.change >= 0 ? '+' : ''}
              {liveQuote.change.toFixed(2)})
            </span>
            <span>O {liveQuote.open.toLocaleString('en-IN')}</span>
            <span>H {liveQuote.high.toLocaleString('en-IN')}</span>
            <span>L {liveQuote.low.toLocaleString('en-IN')}</span>
            <span>Vol {fmtK(liveQuote.volume)}</span>
            <span>Lot {liveQuote.lotSize}</span>
            <span>IV {liveQuote.iv}%</span>
            <span className="text-slate-500">{liveQuote.sector}</span>
            {liveQuote.type === 'stock' && liveQuote.pe != null && <span>PE {liveQuote.pe}</span>}
            {liveQuote.rsi != null && <span>RSI {liveQuote.rsi}</span>}
          </div>
        )}

        {/* Live stats */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { label: 'Spot', value: spot.toLocaleString('en-IN'), color: 'text-white' },
            { label: 'ATM', value: String(atmStrike), color: 'text-[#d4af37]' },
            { label: 'PCR', value: snapshot.pcr.toFixed(2), color: snapshot.pcr > 1 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Max Pain', value: String(snapshot.maxPain.maxPainStrike), color: 'text-blue-300' },
            { label: 'IV %ile', value: `${ivAnalytics.percentile}%`, color: 'text-violet-300' },
            { label: 'IV Rank', value: `${ivAnalytics.rank}`, color: 'text-slate-300' },
            { label: 'Strategy P&L', value: fmtINR(analytics.totalPnl), color: analytics.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Net Premium', value: fmtINR(analytics.netPremium), color: 'text-slate-300' },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#0d1728]/80 rounded-lg px-2 py-1.5 border border-[#172033]">
              <div className="text-[9px] uppercase text-slate-500 tracking-wider">{stat.label}</div>
              <div className={`text-sm font-bold ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === id ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === 'builder' && (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="app-card p-4 border border-[#24324b]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Strategy Templates
                  </h3>
                  {selectedVisual && (
                    <span className="text-[10px] text-slate-500">
                      Selected: <span className="text-[#d4af37] font-bold">{selectedVisual.name}</span>
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mb-3">
                  Click a card — payoff diagram and legs will load automatically
                </p>
                <StrategyTemplateGallery selectedName={selectedTemplate ?? ''} onSelect={loadTemplate} />
              </div>

              {legs.length > 0 && (
                <div className="app-card p-4 border border-[#24324b] bg-white/5">
                  <h3 className="text-sm font-bold text-white mb-2">Live Payoff Preview</h3>
                  <OpstraPayoffChart
                    legs={legs}
                    spot={spot}
                    interval={meta.interval}
                    contractSize={contractSize}
                    daysToExpiry={daysToExpiry}
                    iv={iv}
                    breakevens={analytics.breakevens}
                    height={280}
                    compact
                  />
                </div>
              )}

              {/* Manual leg — Opstra style */}
              <div className="app-card p-4 border border-[#d4af37]/30 bg-[#0d1728]/60">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Plus className="h-4 w-4 text-[#d4af37]" /> Add Manual Leg
                  </h3>
                  <span className="text-[10px] text-slate-500">Opstra-style custom entry</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5">Position</label>
                    <div className="flex rounded-lg overflow-hidden border border-[#24324b]">
                      {(['BUY', 'SELL'] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setManualAction(a)}
                          className={`flex-1 py-2 text-xs font-bold transition-colors ${
                            manualAction === a
                              ? a === 'BUY'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-red-600 text-white'
                              : 'bg-[#172033] text-slate-400 hover:text-white'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5">Option</label>
                    <div className="flex rounded-lg overflow-hidden border border-[#24324b]">
                      {(['CE', 'PE'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setManualType(t)}
                          className={`flex-1 py-2 text-xs font-bold transition-colors ${
                            manualType === t
                              ? t === 'CE'
                                ? 'bg-red-600/90 text-white'
                                : 'bg-emerald-600/90 text-white'
                              : 'bg-[#172033] text-slate-400 hover:text-white'
                          }`}
                        >
                          {t === 'CE' ? 'CALL' : 'PUT'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5">Strike</label>
                    {customStrikeMode ? (
                      <input
                        type="number"
                        step={meta.interval}
                        value={customStrikeInput}
                        onChange={(e) => setCustomStrikeInput(e.target.value)}
                        onBlur={() => {
                          const snapped = snapStrike(Number(customStrikeInput) || manualStrike, meta.interval);
                          setCustomStrikeInput(String(snapped));
                          setManualStrike(snapped);
                        }}
                        className="w-full bg-[#172033] border border-[#24324b] rounded-lg px-2 py-2 text-sm text-white font-mono"
                      />
                    ) : (
                      <select
                        value={manualStrike}
                        onChange={(e) => setManualStrike(Number(e.target.value))}
                        className="w-full bg-[#172033] border border-[#24324b] rounded-lg px-2 py-2 text-sm text-white font-mono"
                      >
                        {strikeOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                            {s === atmStrike ? ' (ATM)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setCustomStrikeMode(!customStrikeMode)}
                      className="mt-1 text-[9px] text-[#d4af37] hover:underline"
                    >
                      {customStrikeMode ? 'Use chain strikes' : 'Custom strike'}
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5">Premium (₹)</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={0}
                        step={0.05}
                        value={manualPremium}
                        onChange={(e) => setManualPremium(Number(e.target.value))}
                        className="flex-1 bg-[#172033] border border-[#24324b] rounded-lg px-2 py-2 text-sm text-white font-mono min-w-0"
                      />
                      <button
                        type="button"
                        title="Market LTP"
                        onClick={() => {
                          const mkt = getChainPremium(chain, resolvedManualStrike, manualType);
                          if (mkt != null) setManualPremium(mkt);
                        }}
                        className="shrink-0 px-2 rounded-lg bg-[#172033] border border-[#24324b] text-[#d4af37] hover:bg-[#24324b]"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5">Lots</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={manualQty}
                      onChange={(e) => setManualQty(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full bg-[#172033] border border-[#24324b] rounded-lg px-2 py-2 text-sm text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5">Expiry</label>
                    <select
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="w-full bg-[#172033] border border-[#24324b] rounded-lg px-2 py-2 text-xs text-white"
                    >
                      {EXPIRY_DATES.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={addManualLeg}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a0f1a] text-sm font-bold hover:bg-[#e8c547] transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add Leg
                  </button>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {manualAction} {manualType} {resolvedManualStrike} @ ₹{manualPremium.toFixed(2)} × {manualQty} lot
                  </span>
                </div>
              </div>

              <div className="app-card p-4 border border-[#24324b]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">Strategy Legs ({legs.length})</h3>
                  <button type="button" onClick={() => { setLegs([]); setEditingLegId(null); }} className="text-xs text-red-400 hover:text-red-300">
                    Clear all
                  </button>
                </div>
                {legs.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    Add a manual leg, click B/S on the chain, or load a template
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 uppercase text-[10px]">
                          <th className="text-left py-2">#</th>
                          <th className="text-left">Action</th>
                          <th className="text-left">Type</th>
                          <th className="text-right">Strike</th>
                          <th className="text-right">Premium</th>
                          <th className="text-right">Lots</th>
                          <th className="text-right">P&L @ Spot</th>
                          <th className="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {legs.map((leg, idx) => {
                          const legPnl =
                            (leg.action === 'BUY' ? 1 : -1) *
                            (Math.max(0, leg.type === 'CE' ? spot - leg.strike : leg.strike - spot) - leg.premium) *
                            leg.quantity *
                            meta.lotSize;
                          const isEditing = editingLegId === leg.id;

                          return (
                            <tr key={leg.id} className={`border-t border-[#172033] ${isEditing ? 'bg-[#d4af37]/5' : ''}`}>
                              <td className="py-2 text-slate-500">{idx + 1}</td>
                              {isEditing ? (
                                <>
                                  <td className="py-1">
                                    <select
                                      value={leg.action}
                                      onChange={(e) => updateLeg(leg.id, { action: e.target.value as 'BUY' | 'SELL' })}
                                      className="bg-[#172033] border border-[#24324b] rounded px-1 py-1 text-[11px] text-white"
                                    >
                                      <option value="BUY">BUY</option>
                                      <option value="SELL">SELL</option>
                                    </select>
                                  </td>
                                  <td className="py-1">
                                    <select
                                      value={leg.type}
                                      onChange={(e) => updateLeg(leg.id, { type: e.target.value as 'CE' | 'PE' })}
                                      className="bg-[#172033] border border-[#24324b] rounded px-1 py-1 text-[11px] text-white"
                                    >
                                      <option value="CE">CE</option>
                                      <option value="PE">PE</option>
                                    </select>
                                  </td>
                                  <td className="py-1 text-right">
                                    <input
                                      type="number"
                                      step={meta.interval}
                                      value={leg.strike}
                                      onChange={(e) =>
                                        updateLeg(leg.id, { strike: snapStrike(Number(e.target.value), meta.interval) })
                                      }
                                      className="w-20 bg-[#172033] border border-[#24324b] rounded px-1 py-1 text-right font-mono text-white"
                                    />
                                  </td>
                                  <td className="py-1 text-right">
                                    <input
                                      type="number"
                                      step={0.05}
                                      min={0}
                                      value={leg.premium}
                                      onChange={(e) => updateLeg(leg.id, { premium: Number(e.target.value) })}
                                      className="w-16 bg-[#172033] border border-[#24324b] rounded px-1 py-1 text-right font-mono text-white"
                                    />
                                  </td>
                                  <td className="py-1 text-right">
                                    <input
                                      type="number"
                                      min={1}
                                      value={leg.quantity}
                                      onChange={(e) => updateLeg(leg.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                      className="w-12 bg-[#172033] border border-[#24324b] rounded px-1 py-1 text-right font-mono text-white"
                                    />
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={`py-2 font-bold ${leg.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>{leg.action}</td>
                                  <td className={leg.type === 'CE' ? 'text-red-300' : 'text-emerald-300'}>{leg.type}</td>
                                  <td className="text-right font-mono">{leg.strike}</td>
                                  <td className="text-right">₹{leg.premium.toFixed(2)}</td>
                                  <td className="text-right">{leg.quantity}</td>
                                </>
                              )}
                              <td className={`py-2 text-right font-bold ${legPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtINR(legPnl)}</td>
                              <td className="py-2 text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <button
                                    type="button"
                                    title={isEditing ? 'Done' : 'Edit leg'}
                                    onClick={() => setEditingLegId(isEditing ? null : leg.id)}
                                    className="p-1 text-[#d4af37] hover:text-[#e8c547]"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Sync market premium"
                                    onClick={() => syncLegPremiumFromChain(leg.id)}
                                    className="p-1 text-slate-400 hover:text-white"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" title="Duplicate" onClick={() => duplicateLeg(leg.id)} className="p-1 text-slate-400 hover:text-white">
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" title="Remove" onClick={() => removeLeg(leg.id)} className="p-1 text-red-400 hover:text-red-300">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="app-card p-4 border border-[#24324b] space-y-3">
                <h3 className="text-sm font-bold text-white">Parameters</h3>
                <label className="block text-[11px] text-slate-500">Default lots (new legs)</label>
                <input type="range" min={1} max={10} value={lots} onChange={(e) => setLots(Number(e.target.value))} className="w-full accent-[#d4af37]" />
                <span className="text-xs text-[#d4af37] font-bold">{lots} lot · {meta.lotSize} qty/lot</span>
                <label className="block text-[11px] text-slate-500 mt-2">DTE: {daysToExpiry}</label>
                <input type="range" min={1} max={45} value={daysToExpiry} onChange={(e) => setDaysToExpiry(Number(e.target.value))} className="w-full accent-[#d4af37]" />
                <label className="block text-[11px] text-slate-500 mt-2">IV %: {iv}</label>
                <input type="range" min={8} max={45} step={0.5} value={iv} onChange={(e) => setIv(Number(e.target.value))} className="w-full accent-[#d4af37]" />
              </div>

              <div className="app-card p-4 border border-[#24324b]">
                <h3 className="text-sm font-bold text-[#d4af37] mb-2">Portfolio Greeks</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(['delta', 'gamma', 'theta', 'vega'] as const).map((g) => (
                    <div key={g} className="bg-[#0d1728] rounded-lg p-2 border border-[#172033]">
                      <div className="text-slate-500 uppercase text-[9px]">{g}</div>
                      <div className="font-mono font-bold text-white">{analytics.portfolioGreeks[g].toFixed(g === 'gamma' ? 4 : 2)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Max Profit', value: analytics.maxProfit, icon: TrendingUp, color: 'text-emerald-400' },
                  { label: 'Max Loss', value: analytics.maxLoss, icon: Target, color: 'text-red-400' },
                ].map((card) => (
                  <div key={card.label} className="app-card p-3 border border-[#24324b]">
                    <card.icon className={`h-4 w-4 mb-1 ${card.color}`} />
                    <div className="text-[10px] text-slate-500">{card.label}</div>
                    <div className={`text-sm font-bold ${card.color}`}>{fmtINR(card.value)}</div>
                  </div>
                ))}
              </div>
              {analytics.breakevens.length > 0 && (
                <div className="app-card p-3 border border-[#24324b]">
                  <div className="text-[10px] text-slate-500 uppercase">Breakevens</div>
                  <div className="text-sm font-bold text-[#d4af37]">{analytics.breakevens.join(' · ')}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'payoff' && (
          <div className="space-y-4">
            <div className="grid lg:grid-cols-4 gap-4">
              <div className="lg:col-span-1 space-y-3">
                {[
                  { label: 'Max Profit', value: fmtINR(analytics.maxProfit), color: 'text-emerald-400' },
                  { label: 'Max Loss', value: fmtINR(analytics.maxLoss), color: 'text-orange-400' },
                  { label: 'Net Premium', value: fmtINR(analytics.netPremium), color: 'text-slate-300' },
                  { label: 'P&L @ Spot', value: fmtINR(analytics.totalPnl), color: analytics.totalPnl >= 0 ? 'text-emerald-400' : 'text-orange-400' },
                ].map((s) => (
                  <div key={s.label} className="app-card p-3 border border-[#24324b]">
                    <div className="text-[10px] uppercase text-slate-500">{s.label}</div>
                    <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                  </div>
                ))}
                {analytics.breakevens.length > 0 && (
                  <div className="app-card p-3 border border-[#24324b]">
                    <div className="text-[10px] uppercase text-slate-500">Breakevens</div>
                    <div className="text-sm font-bold text-blue-400">{analytics.breakevens.join(' · ')}</div>
                  </div>
                )}
              </div>
              <div className="lg:col-span-3 app-card p-4 border border-[#24324b] bg-[#fafafa]/5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <CandlestickChart className="h-4 w-4 text-[#d4af37]" /> Payoff Chart
                  </h3>
                  <span className="text-[10px] text-slate-500">Like Opstra · Blue expiry · Purple T+0</span>
                </div>
                <OpstraPayoffChart
                  legs={legs}
                  spot={scenarioSpot || spot}
                  interval={meta.interval}
                  contractSize={contractSize}
                  daysToExpiry={daysToExpiry}
                  iv={scenarioIv || iv}
                  breakevens={analytics.breakevens}
                  height={400}
                />
              </div>
            </div>

            <div className="app-card p-4 border border-[#24324b]">
              <h3 className="text-sm font-bold text-[#d4af37] mb-3">What-If Scenario</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-slate-500">Spot: {scenarioSpot.toLocaleString('en-IN')}</label>
                  <input
                    type="range"
                    min={spot - meta.interval * 15}
                    max={spot + meta.interval * 15}
                    step={meta.interval}
                    value={scenarioSpot}
                    onChange={(e) => setScenarioSpot(Number(e.target.value))}
                    className="w-full accent-[#d4af37] mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">IV: {scenarioIv}%</label>
                  <input
                    type="range"
                    min={8}
                    max={45}
                    step={0.5}
                    value={scenarioIv}
                    onChange={(e) => setScenarioIv(Number(e.target.value))}
                    className="w-full accent-[#d4af37] mt-1"
                  />
                </div>
              </div>
              <motion.div
                key={analytics.totalPnl}
                initial={{ scale: 0.98 }}
                animate={{ scale: 1 }}
                className={`mt-4 text-center text-2xl font-black ${analytics.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {fmtINR(analytics.totalPnl)}
              </motion.div>
            </div>
          </div>
        )}

        {tab === 'chain' && (
          <div className="flex flex-col min-h-[500px] rounded-xl border border-[#24324b] overflow-hidden bg-[#0d1728]">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[#24324b] bg-[#10213b]">
              <button
                type="button"
                onClick={() => setTab('builder')}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-[#d4af37] text-[#0a0f1a]"
              >
                <Plus className="h-3 w-3" /> Manual Leg
              </button>
              {(['ALL', 'ITM', 'ATM', 'OTM'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setChainFilter(f)}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${chainFilter === f ? 'bg-[#d4af37] text-[#0a0f1a]' : 'bg-[#172033] text-slate-400'}`}
                >
                  {f}
                </button>
              ))}
              <button type="button" onClick={() => setShowGreeks(!showGreeks)} className="px-2 py-1 rounded text-[10px] bg-[#172033] text-slate-300">
                Greeks {showGreeks ? 'ON' : 'OFF'}
              </button>
              <button type="button" onClick={() => setViewMode(viewMode === 'table' ? 'heatmap' : 'table')} className="px-2 py-1 rounded text-[10px] bg-[#172033] text-slate-300">
                {viewMode === 'table' ? 'Heatmap' : 'Table'}
              </button>
              <span className="text-[10px] text-slate-500 ml-auto">Click strike → add leg</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs border-collapse min-w-[1100px]">
                <thead className="sticky top-0 z-10 bg-[#10213b]">
                  <tr className="text-[10px] uppercase text-slate-500">
                    <th colSpan={showGreeks ? 8 : 5} className="py-2 text-right text-red-300 border-b border-[#24324b]">CALLS — click LTP to BUY/SELL</th>
                    <th className="py-2 text-center text-[#d4af37] border-b border-[#24324b]">Strike</th>
                    <th colSpan={showGreeks ? 8 : 5} className="py-2 text-left text-emerald-300 border-b border-[#24324b]">PUTS</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStrikes.map((row) => {
                    const isAtm = row.strike === atmStrike;
                    const ceW = (row.ceOi / maxCeOi) * 100;
                    const peW = (row.peOi / maxPeOi) * 100;
                    return (
                      <tr key={row.strike} className={`border-b border-[#172033] hover:bg-[#111b2d] ${isAtm ? 'bg-[#d4af37]/8' : ''}`}>
                        <td
                          className="px-2 py-1 text-right relative"
                          style={viewMode === 'heatmap' ? { backgroundColor: `rgba(239,68,68,${row.ceOi / maxCeOi})` } : {}}
                        >
                          {viewMode === 'table' && <div className="absolute inset-y-0 right-0 bg-red-500/10" style={{ width: `${ceW}%` }} />}
                          <span className="relative">{fmtK(row.ceOi)}</span>
                        </td>
                        <td className="px-2 py-1 text-right text-slate-400">{row.ceIv.toFixed(1)}</td>
                        <td className="px-2 py-1 text-right text-red-300 font-bold">
                          {row.ceLtp.toFixed(1)}
                          <span className="ml-1 font-normal">
                            <button type="button" onClick={() => addLeg(row.strike, 'CE', 'BUY')} className="text-emerald-400 hover:underline text-[9px]">B</button>
                            {' / '}
                            <button type="button" onClick={() => addLeg(row.strike, 'CE', 'SELL')} className="text-red-400 hover:underline text-[9px]">S</button>
                          </span>
                        </td>
                        {showGreeks && (
                          <>
                            <td className="px-1 text-right text-slate-500">{row.ceDelta.toFixed(2)}</td>
                            <td className="px-1 text-right text-slate-500">{row.ceGamma.toFixed(3)}</td>
                          </>
                        )}
                        <td className={`px-3 py-1 text-center font-black border-x border-[#24324b] ${isAtm ? 'text-[#d4af37]' : 'text-white'}`}>
                          {row.strike}
                          {isAtm && <div className="text-[8px]">ATM</div>}
                        </td>
                        <td className="px-2 py-1 text-emerald-300 font-bold">
                          {row.peLtp.toFixed(1)}
                          <span className="ml-1 font-normal">
                            <button type="button" onClick={() => addLeg(row.strike, 'PE', 'BUY')} className="text-emerald-400 hover:underline text-[9px]">B</button>
                            {' / '}
                            <button type="button" onClick={() => addLeg(row.strike, 'PE', 'SELL')} className="text-red-400 hover:underline text-[9px]">S</button>
                          </span>
                        </td>
                        <td className="px-2 py-1 text-slate-400">{row.peIv.toFixed(1)}</td>
                        <td
                          className="px-2 py-1 relative"
                          style={viewMode === 'heatmap' ? { backgroundColor: `rgba(16,185,129,${row.peOi / maxPeOi})` } : {}}
                        >
                          {viewMode === 'table' && <div className="absolute inset-y-0 left-0 bg-emerald-500/10" style={{ width: `${peW}%` }} />}
                          <span className="relative">{fmtK(row.peOi)}</span>
                        </td>
                        {showGreeks && (
                          <>
                            <td className="px-1 text-slate-500">{row.peDelta.toFixed(2)}</td>
                            <td className="px-1 text-slate-500">{row.peGamma.toFixed(3)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'historical' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">Period</span>
              {[30, 90, 180, 365].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setHistDays(d)}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${histDays === d ? 'bg-[#d4af37] text-[#0a0f1a]' : 'bg-[#172033] text-slate-400'}`}
                >
                  {d}d
                </button>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="app-card p-4 border border-[#24324b]">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <History className="h-4 w-4 text-[#d4af37]" /> Spot & Max Pain (5Y OI data)
                </h3>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={histSpot}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 11 }} />
                      <Area yAxisId="left" type="monotone" dataKey="spot" stroke="#d4af37" fill="#d4af37/10" name="Spot" />
                      <Line yAxisId="left" type="monotone" dataKey="maxPain" stroke="#60a5fa" dot={false} strokeWidth={1} name="Max Pain" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="app-card p-4 border border-[#24324b]">
                <h3 className="text-sm font-bold text-white mb-2">PCR History</h3>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={histSpot}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} />
                      <YAxis domain={[0.5, 1.5]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <ReferenceLine y={1} stroke="#475569" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="pcr" stroke="#10b981" fill="#10b981/15" name="PCR" />
                      <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 11 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="app-card p-4 border border-[#24324b]">
                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-violet-400" /> IV History (30 days)
                </h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={histIv}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Area type="monotone" dataKey="iv" stroke="#a78bfa" fill="#a78bfa/15" />
                      <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 11 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex gap-4 text-xs">
                  <span>Current IV: <strong className="text-violet-300">{ivAnalytics.current}%</strong></span>
                  <span>Percentile: <strong className="text-[#d4af37]">{ivAnalytics.percentile}%</strong></span>
                </div>
              </div>

              <div className="app-card p-4 border border-[#24324b]">
                <h3 className="text-sm font-bold text-white mb-2">CE vs PE OI (Historical)</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={histSpot.slice(-20)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                      <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#64748b' }} />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                      <Bar dataKey="ceOi" fill="#ef4444" name="CE OI" stackId="a" />
                      <Bar dataKey="peOi" fill="#10b981" name="PE OI" stackId="a" />
                      <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'analytics' && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="app-card p-4 border border-[#24324b]">
              <h3 className="text-sm font-bold text-[#d4af37] mb-3">Volatility Skew</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={ivAnalytics.skew}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                    <XAxis dataKey="strike" tick={{ fontSize: 9, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Bar dataKey="ceIv" fill="#ef4444" name="CE IV" opacity={0.7} />
                    <Bar dataKey="peIv" fill="#10b981" name="PE IV" opacity={0.7} />
                    <Line type="monotone" dataKey="skew" stroke="#d4af37" strokeWidth={2} name="Skew" />
                    <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 11 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="app-card p-4 border border-[#24324b]">
              <h3 className="text-sm font-bold text-white mb-3">Max Pain Distribution</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snapshot.maxPain.painValues}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                    <XAxis dataKey="strike" tick={{ fontSize: 9, fill: '#64748b' }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                    <Bar dataKey="pain" fill="#60a5fa" name="Pain" />
                    <ReferenceLine x={snapshot.maxPain.maxPainStrike} stroke="#d4af37" strokeWidth={2} label="Max Pain" />
                    <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-2 app-card p-4 border border-[#24324b]">
              <h3 className="text-sm font-bold text-white mb-3">Per-Leg Greeks @ Current Spot</h3>
              {legs.length === 0 ? (
                <p className="text-slate-500 text-sm">Add legs to see greek breakdown</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 uppercase text-[10px]">
                        <th className="text-left py-2">Leg</th>
                        <th className="text-right">Delta</th>
                        <th className="text-right">Gamma</th>
                        <th className="text-right">Theta</th>
                        <th className="text-right">Vega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legs.map((leg) => {
                        const g = calculateGreeks(spot, leg.strike, daysToExpiry, iv, leg.type, interestRate / 100);
                        const sign = leg.action === 'BUY' ? 1 : -1;
                        return (
                          <tr key={leg.id} className="border-t border-[#172033]">
                            <td className="py-2">
                              {leg.action} {leg.type} {leg.strike}
                            </td>
                            <td className="text-right font-mono">{(g.delta * sign * leg.quantity).toFixed(2)}</td>
                            <td className="text-right font-mono">{(g.gamma * sign * leg.quantity).toFixed(4)}</td>
                            <td className="text-right font-mono text-red-300">{(g.theta * sign * leg.quantity).toFixed(2)}</td>
                            <td className="text-right font-mono text-blue-300">{(g.vega * sign * leg.quantity).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'backtest' && (
          <div className="space-y-4">
            <div className="grid lg:grid-cols-4 gap-4">
              <div className="lg:col-span-1 app-card p-4 border border-[#24324b] space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto">
                <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
                  <Play className="h-4 w-4" /> OI Backtest Setup
                </h3>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Select date range and timeframe, preview the chart, then run backtest on your strategy legs.
                </p>

                <div>
                  <label className="text-[10px] uppercase text-slate-500 mb-1.5 block">Date Range</label>
                  <div className="flex gap-1 mb-2">
                    {(['range', 'preset'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setBtDateMode(m)}
                        className={`flex-1 py-1 rounded text-[10px] font-bold ${
                          btDateMode === m ? 'bg-[#d4af37] text-[#0a0f1a]' : 'bg-[#172033] text-slate-400'
                        }`}
                      >
                        {m === 'range' ? 'Custom' : 'Preset'}
                      </button>
                    ))}
                  </div>
                  {btDateMode === 'range' ? (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[9px] text-slate-500">From</label>
                        <input
                          type="date"
                          min={oiDateBounds.min}
                          max={btEndDate || oiDateBounds.max}
                          value={btStartDate}
                          onChange={(e) => setBtStartDate(e.target.value)}
                          className="w-full mt-0.5 bg-[#172033] border border-[#24324b] rounded-lg px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500">To</label>
                        <input
                          type="date"
                          min={btStartDate || oiDateBounds.min}
                          max={oiDateBounds.max}
                          value={btEndDate}
                          onChange={(e) => setBtEndDate(e.target.value)}
                          className="w-full mt-0.5 bg-[#172033] border border-[#24324b] rounded-lg px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <p className="text-[9px] text-slate-600">
                        Available: {oiDateBounds.min} → {oiDateBounds.max} ({oiDateBounds.count} days)
                      </p>
                    </div>
                  ) : (
                    <select
                      value={btLookback}
                      onChange={(e) => setBtLookback(Number(e.target.value))}
                      className="w-full bg-[#172033] border border-[#24324b] rounded-lg px-2 py-2 text-xs text-white"
                    >
                      {BACKTEST_LOOKBACK_OPTIONS.map((o) => (
                        <option key={o.days} value={o.days}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-500 mb-1.5 block">Timeframe</label>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {OI_TIMEFRAMES.filter((t) => t.group === 'intraday').map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setBtTimeframe(t.id)}
                          className={`px-2 py-1 rounded text-[10px] font-bold ${
                            btTimeframe === t.id ? 'bg-[#d4af37] text-[#0a0f1a]' : 'bg-[#172033] text-slate-400 hover:text-white'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {OI_TIMEFRAMES.filter((t) => t.group !== 'intraday').map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setBtTimeframe(t.id)}
                          className={`px-2 py-1 rounded text-[10px] font-bold ${
                            btTimeframe === t.id ? 'bg-emerald-600 text-white' : 'bg-[#172033] text-slate-400 hover:text-white'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-600 mt-1">
                    {btPreviewSeries.bars.length.toLocaleString()} bars loaded
                  </p>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-500">Capital (₹)</label>
                  <input
                    type="number"
                    step={50000}
                    value={btCapital}
                    onChange={(e) => setBtCapital(Number(e.target.value) || 500000)}
                    className="w-full mt-1 bg-[#172033] border border-[#24324b] rounded-lg px-2 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-500">Entry Signal (OI)</label>
                  <select
                    value={btSignal}
                    onChange={(e) => setBtSignal(e.target.value as OiEntrySignal)}
                    className="w-full mt-1 bg-[#172033] border border-[#24324b] rounded-lg px-2 py-2 text-xs text-white"
                  >
                    {OI_ENTRY_SIGNALS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  {btSignalMeta && <p className="text-[9px] text-slate-500 mt-1">{btSignalMeta.desc}</p>}
                </div>

                {(btSignal === 'pcr_cross_up' || btSignal === 'pcr_cross_down') && (
                  <div>
                    <label className="text-[10px] uppercase text-slate-500">PCR Threshold: {btPcrThreshold}</label>
                    <input type="range" min={0.7} max={1.4} step={0.05} value={btPcrThreshold} onChange={(e) => setBtPcrThreshold(Number(e.target.value))} className="w-full accent-[#d4af37] mt-1" />
                  </div>
                )}

                {btSignal === 'spot_near_maxpain' && (
                  <div>
                    <label className="text-[10px] uppercase text-slate-500">Max Pain distance %: {btMaxPainPct}</label>
                    <input type="range" min={0.1} max={2} step={0.1} value={btMaxPainPct} onChange={(e) => setBtMaxPainPct(Number(e.target.value))} className="w-full accent-[#d4af37] mt-1" />
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase text-slate-500">Hold Days: {btHoldingDays}</label>
                  <input type="range" min={1} max={20} value={btHoldingDays} onChange={(e) => setBtHoldingDays(Number(e.target.value))} className="w-full accent-[#d4af37] mt-1" />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-500">DTE at Entry: {btDte}</label>
                  <input type="range" min={1} max={30} value={btDte} onChange={(e) => setBtDte(Number(e.target.value))} className="w-full accent-[#d4af37] mt-1" />
                </div>

                <div className="rounded-lg bg-[#0d1728] border border-[#172033] p-2 text-[10px]">
                  <span className="text-slate-500">Legs loaded:</span>{' '}
                  <span className={legs.length ? 'text-emerald-400 font-bold' : 'text-red-400'}>{legs.length}</span>
                  {legs.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-slate-400">
                      {legs.map((l) => (
                        <li key={l.id}>{l.action} {l.type} {l.strike} ×{l.quantity}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  onClick={runBacktest}
                  disabled={btRunning || !legs.length}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#d4af37] text-[#0a0f1a] font-bold text-sm hover:bg-[#e8c547] disabled:opacity-50"
                >
                  {btRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {btRunning ? 'Running...' : 'Run OI Backtest'}
                </button>
                {btError && <p className="text-xs text-red-400">{btError}</p>}
              </div>

              <div className="lg:col-span-3 space-y-4">
                {/* Chart preview — all timeframes */}
                <div className="app-card p-4 border border-[#24324b]">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d4af37]" />
                      OI Chart · {btTimeframe}
                      {btDateMode === 'range' ? ` · ${btStartDate} → ${btEndDate}` : ` · last ${btLookback}d`}
                    </h3>
                    <div className="flex gap-1">
                      {(['price', 'pcr', 'oi', 'equity'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setBtChartView(v)}
                          disabled={v === 'equity' && !btResult}
                          className={`px-2 py-1 rounded text-[10px] font-bold capitalize ${
                            btChartView === v ? 'bg-[#d4af37] text-[#0a0f1a]' : 'bg-[#172033] text-slate-400 disabled:opacity-40'
                          }`}
                        >
                          {v === 'oi' ? 'CE/PE OI' : v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-[280px]">
                    {btChartData.length === 0 ? (
                      <p className="text-sm text-slate-500 h-full flex items-center justify-center">Select a date range</p>
                    ) : btChartView === 'price' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={btChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                          <XAxis dataKey="label" tick={{ fontSize: 7, fill: '#64748b' }} minTickGap={40} interval="preserveStartEnd" />
                          <YAxis yAxisId="price" domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                          <YAxis yAxisId="mp" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 8, fill: '#60a5fa' }} />
                          <Tooltip
                            contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 10 }}
                            labelFormatter={(l) => String(l)}
                            formatter={formatTooltipPair}
                          />
                          <Line yAxisId="price" type="monotone" dataKey="high" stroke="#475569" dot={false} strokeWidth={0.5} name="High" />
                          <Line yAxisId="price" type="monotone" dataKey="low" stroke="#475569" dot={false} strokeWidth={0.5} name="Low" />
                          <Line yAxisId="price" type="monotone" dataKey="close" stroke="#d4af37" dot={false} strokeWidth={2} name="Close" />
                          <Line yAxisId="mp" type="monotone" dataKey="maxPain" stroke="#60a5fa" dot={false} strokeWidth={1} strokeDasharray="4 4" name="Max Pain" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : btChartView === 'pcr' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={btChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                          <XAxis dataKey="label" tick={{ fontSize: 7, fill: '#64748b' }} minTickGap={40} />
                          <YAxis domain={[0.5, 1.5]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                          <ReferenceLine y={1} stroke="#475569" strokeDasharray="4 4" />
                          <ReferenceLine y={btPcrThreshold} stroke="#d4af37" strokeDasharray="3 3" />
                          <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 10 }} />
                          <Area type="monotone" dataKey="pcr" stroke="#10b981" fill="#10b981/15" strokeWidth={2} name="PCR" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : btChartView === 'oi' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={btChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                          <XAxis dataKey="label" tick={{ fontSize: 7, fill: '#64748b' }} minTickGap={50} />
                          <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                          <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 10 }} />
                          <Bar dataKey="ceOi" fill="#ef4444" name="CE OI" stackId="oi" opacity={0.85} />
                          <Bar dataKey="peOi" fill="#10b981" name="PE OI" stackId="oi" opacity={0.85} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : btResult && btEquityChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={btEquityChartData}>
                          <defs>
                            <linearGradient id="btEqPrev" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#d4af37" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#172033" />
                          <XAxis dataKey="label" tick={{ fontSize: 7, fill: '#64748b' }} minTickGap={40} />
                          <YAxis tickFormatter={(v) => fmtK(v)} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                          <ReferenceLine y={btCapital} stroke="#475569" strokeDasharray="4 4" />
                          <Tooltip contentStyle={{ background: '#10213b', border: '1px solid #24324b', fontSize: 10 }} formatter={formatTooltipPairCurrency} />
                          <Area type="monotone" dataKey="portfolioValue" stroke="#d4af37" fill="url(#btEqPrev)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-slate-500 h-full flex items-center justify-center">Run backtest for equity curve</p>
                    )}
                  </div>
                </div>

                {btResult ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Net P&L', value: fmtINR(btResult.summary.totalPnl), color: btResult.summary.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
                        { label: 'Return', value: `${btResult.summary.totalReturnPct}%`, color: 'text-[#d4af37]' },
                        { label: 'Win Rate', value: `${btResult.summary.winRate}%`, color: 'text-white' },
                        { label: 'Trades', value: String(btResult.summary.totalTrades), color: 'text-white' },
                        { label: 'Profit Factor', value: String(btResult.summary.profitFactor), color: 'text-blue-300' },
                        { label: 'Max DD', value: `${btResult.summary.maxDrawdownPct}%`, color: 'text-red-300' },
                        { label: 'Timeframe', value: btResult.timeframe, color: 'text-violet-300' },
                        { label: 'Bars', value: String(btResult.dataRange.bars), color: 'text-slate-300' },
                      ].map((s) => (
                        <div key={s.label} className="bg-[#0d1728]/80 rounded-lg px-2 py-2 border border-[#172033]">
                          <div className="text-[9px] uppercase text-slate-500">{s.label}</div>
                          <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {btResult.dataRange.from} → {btResult.dataRange.to} · {btResult.dataRange.days} days · {btResult.dataRange.bars} bars · {btTimeframe} · {btSignalMeta?.label}
                    </p>

                    <div className="app-card p-4 border border-[#24324b] overflow-hidden">
                      <h3 className="text-sm font-bold text-white mb-3">Trade Log (OI-triggered)</h3>
                      <div className="overflow-x-auto max-h-[280px]">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-[#10213b] text-slate-500 uppercase text-[10px]">
                            <tr>
                              <th className="text-left py-2 px-2">Entry</th>
                              <th className="text-left px-2">Exit</th>
                              <th className="text-left px-2">Signal</th>
                              <th className="text-right px-2">Entry PCR</th>
                              <th className="text-right px-2">Days</th>
                              <th className="text-right px-2">P&L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {btResult.trades.map((t) => (
                              <tr key={t.id} className="border-t border-[#172033] hover:bg-[#111b2d]">
                                <td className="py-2 px-2 font-mono text-slate-300">{t.entryDate}</td>
                                <td className="px-2 font-mono text-slate-400">{t.exitDate}</td>
                                <td className="px-2 text-[10px] text-[#d4af37] max-w-[140px]">{t.signal}</td>
                                <td className="px-2 text-right">{t.entryPcr.toFixed(2)}</td>
                                <td className="px-2 text-right">{t.daysHeld}</td>
                                <td className={`px-2 text-right font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtINR(t.pnl)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="app-card p-12 border border-[#24324b] text-center">
                    <Play className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">OI Historical Backtest</h3>
                    <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
                      Build legs in the Strategy tab (manual or template), then select OI signals here and run backtest on 5 years of data.
                    </p>
                    <button type="button" onClick={() => setTab('builder')} className="text-sm text-[#d4af37] hover:underline">
                      → Strategy builder
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
