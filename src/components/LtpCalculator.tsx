import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  Download,
  Gauge,
  Radio,
  RefreshCw,
  Search,
  Target,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { calculateGreeks } from '../services/optionPricing';
import {
  classifyOiBuildup,
  computeLtpCalc,
  defaultLtpCalcInputs,
  exportTradeReport,
  scalpingAdjust,
  SUPPORTED_BROKERS,
  targetZoneProgress,
  type AssetMode,
  type LtpCalcInputs,
  type TradeDirection,
} from '../services/ltpCalculatorEngine';
import { useScalpingTerminal } from '../hooks/useScalpingTerminal';
import { BRAND } from '../constants/brandLabels';
import {
  ProgressToTarget,
  ResultSummaryGrid,
  RrMeter,
  TargetHeatmap,
} from './ltpCalculator/LtpCalculatorPanels';
import {
  AlertsPanel,
  ConditionGrid,
  MomentumMeter,
  MtfPanel,
  OiBuildupBadge,
  OptionChainMini,
  PremiumSpeedPanel,
  ScoreBreakdownPanel,
  ScalpSignalBadge,
  SmartMoneyBanner,
  TerminalTopBar,
} from './ltpCalculator/ScalpingTerminalPanels';

const SCALP_POINTS = [5, 10, 20] as const;
const SCALP_PCT = [1, 2, 5] as const;

function NumInput({
  label,
  value,
  onChange,
  step = 0.01,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-dark-border/80 bg-[#0a0e17] overflow-hidden">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 focus:outline-none"
        />
        {suffix ? <span className="pr-2 text-[10px] text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

interface LtpCalculatorProps {
  onNavigate?: (tab: string) => void;
}

export default function LtpCalculator({ onNavigate }: LtpCalculatorProps) {
  const [symbol, setSymbol] = useState('NIFTY');
  const [searchQ, setSearchQ] = useState('');
  const [liveLtp, setLiveLtp] = useState(true);
  const [manualLtp, setManualLtp] = useState(0);
  const [soundAlerts, setSoundAlerts] = useState(false);
  const [assetMode, setAssetMode] = useState<AssetMode>('options');
  const [optionStrike, setOptionStrike] = useState(0);
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  const [optionDte, setOptionDte] = useState(7);

  const [inputs, setInputs] = useState<LtpCalcInputs>(() => defaultLtpCalcInputs(24580, 25));

  const terminal = useScalpingTerminal(symbol, liveLtp, soundAlerts);
  const {
    quote,
    flash,
    lotSize,
    instrumentName,
    search,
    connected,
    wsStatus,
    refresh,
    analysis,
    chainRows,
    spot,
    alerts,
    premiumSeries,
    clearAlerts,
  } = terminal;

  const patch = useCallback((p: Partial<LtpCalcInputs>) => {
    setInputs((prev) => ({ ...prev, ...p }));
  }, []);

  useEffect(() => {
    patch({ lotSize });
  }, [lotSize, patch]);

  useEffect(() => {
    if (!liveLtp || !quote?.price) return;
    setManualLtp(quote.price);
    patch({ entry: quote.price });
  }, [liveLtp, quote?.price, patch]);

  const ltp = liveLtp ? quote?.price ?? manualLtp : manualLtp;
  const entry = inputs.entry > 0 ? inputs.entry : ltp;

  const calcInputs = useMemo(
    () => ({ ...inputs, entry: entry > 0 ? entry : inputs.entry }),
    [inputs, entry],
  );

  const result = useMemo(() => computeLtpCalc(calcInputs), [calcInputs]);

  const optionsInsight = useMemo(() => {
    if (assetMode !== 'options' || entry <= 0) return null;
    const strike = optionStrike > 0 ? optionStrike : Math.round(entry / 50) * 50;
    const iv = quote?.iv ?? 18;
    const g = calculateGreeks(entry, strike, optionDte, iv, optionType);
    const priceChg = quote?.change ?? 0;
    const oiChg = terminal.ticks.at(-1)?.oiChange ?? 0;
    return {
      premiumMove: quote?.change ?? 0,
      oiChange: oiChg,
      iv,
      delta: g.delta,
      buildup: classifyOiBuildup(priceChg, oiChg),
      strike,
      theta: g.theta,
      vega: g.vega,
    };
  }, [assetMode, entry, optionStrike, optionDte, optionType, quote, terminal.ticks]);

  const progressPct = useMemo(() => {
    if (!result || ltp <= 0) return 0;
    return targetZoneProgress(
      result.effectiveEntry,
      ltp,
      result.stopLossPrice,
      result.target1Price,
      inputs.direction,
    );
  }, [result, ltp, inputs.direction]);

  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return search('').slice(0, 12);
    return search(searchQ).slice(0, 12);
  }, [searchQ, search]);

  const applyScalp = (delta: number, mode: 'points' | 'pct', field: 'entry' | 'sl' | 'target') => {
    const next = scalpingAdjust(
      inputs.entry || ltp,
      delta,
      mode,
      inputs.direction,
      field,
      { slPct: inputs.stopLossPct, targetPct: inputs.targetPct },
    );
    patch(next);
    if (field === 'entry') setManualLtp(next.entry);
  };

  const handleExport = () => {
    exportTradeReport({
      exportedAt: new Date().toISOString(),
      symbol,
      instrumentName,
      assetMode,
      direction: inputs.direction,
      ltp,
      inputs: calcInputs,
      result,
      scalping: analysis,
      optionsInsight,
      broker: BRAND,
    });
  };

  return (
    <div className="lpt-master-terminal space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Gauge className="w-6 h-6 text-gold" />
            <h1 className="text-xl font-bold text-slate-100">LPT Master</h1>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              Options Scalping Terminal
            </span>
            <ScalpSignalBadge signal={analysis.signal} />
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Price + Volume + OI + Momentum sync · fast scalping · smart money flow · {BRAND} live
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={soundAlerts}
              onChange={(e) => setSoundAlerts(e.target.checked)}
              className="rounded"
            />
            <Bell className="w-3 h-3" />
            Sound
          </label>
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded border ${
              connected
                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                : 'border-amber-500/30 text-amber-300 bg-amber-500/10'
            }`}
          >
            {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connected ? 'Live' : wsStatus || 'Offline'}
          </span>
          <button
            type="button"
            onClick={() => refresh()}
            className="p-2 rounded-lg border border-dark-border/60 text-slate-400 hover:text-gold"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      <SmartMoneyBanner active={analysis.smartMoneyActive} />

      <TerminalTopBar
        symbol={symbol}
        name={instrumentName}
        ltp={ltp}
        changePct={quote?.changePercent ?? 0}
        flash={flash}
        signal={analysis.signal}
        signalCategory={analysis.signalCategory}
        masterScore={analysis.masterScore}
        tradeExecutionReady={analysis.tradeExecutionReady}
        momentum={analysis.momentum}
        connected={connected}
      />

      <div className="grid lg:grid-cols-12 gap-3">
        <div className="lg:col-span-8 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <MomentumMeter value={analysis.momentum} tier={analysis.momentumTier} />
            <MtfPanel analysis={analysis} />
          </div>
          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Signal confluence</p>
            <ConditionGrid c={analysis.conditions} />
            <div className="flex flex-col gap-3 mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <OiBuildupBadge label={analysis.oiBuildup} />
                <span className="text-[10px] text-slate-500">
                  Buy {analysis.buyScore} · Sell {analysis.sellScore} · LTP speed {analysis.ltpSpeed}%
                </span>
              </div>
              <ScoreBreakdownPanel analysis={analysis} />
            </div>
            <ul className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
              {analysis.reasons.map((r) => (
                <li key={r} className="text-[10px] text-slate-500 flex gap-1">
                  <Radio className="w-3 h-3 text-gold shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          {result && (
            <div className="space-y-3">
              <ResultSummaryGrid result={result} />
              <TargetHeatmap
                sl={result.stopLossPrice}
                entry={result.effectiveEntry}
                t1={result.target1Price}
                t2={result.target2Price}
                t3={result.target3Price}
                ltp={ltp}
                direction={inputs.direction}
              />
              <ProgressToTarget pct={progressPct} label="Scalp zone → T1" />
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-3">
          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Symbol</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={searchQ || symbol}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  if (e.target.value.length <= 12) setSymbol(e.target.value.toUpperCase());
                }}
                onFocus={() => setSearchQ(symbol)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-dark-border/80 bg-[#0a0e17] text-sm"
                placeholder="NIFTY, BANKNIFTY…"
              />
            </div>
            {searchQ && (
              <div className="max-h-28 overflow-y-auto rounded-lg border border-dark-border/40 divide-y divide-dark-border/40">
                {searchResults.map((s) => (
                  <button
                    key={s.symbol}
                    type="button"
                    onClick={() => {
                      setSymbol(s.symbol);
                      setSearchQ('');
                      patch({ entry: s.price, lotSize: s.lotSize });
                      setManualLtp(s.price);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gold/10"
                  >
                    <span className="font-bold text-gold">{s.symbol}</span>
                    <span className="float-right">₹{s.price.toLocaleString('en-IN')}</span>
                  </button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-[10px] text-slate-500">
              <input type="checkbox" checked={liveLtp} onChange={(e) => setLiveLtp(e.target.checked)} />
              Sync LTP live
            </label>
            <NumInput label="Entry" value={inputs.entry} onChange={(v) => { patch({ entry: v }); setManualLtp(v); }} />
            <div className="flex gap-2">
              {(['BUY', 'SELL'] as TradeDirection[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => patch({ direction: d })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border ${
                    inputs.direction === d
                      ? d === 'BUY'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-red-500/20 border-red-500/50 text-red-400'
                      : 'border-dark-border/60 text-slate-500'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['equity', 'futures', 'options'] as AssetMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAssetMode(m)}
                  className={`px-2 py-1 rounded text-[10px] font-bold capitalize ${
                    assetMode === m ? 'bg-gold/15 text-gold border border-gold/30' : 'text-slate-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <PremiumSpeedPanel series={premiumSeries} phase={analysis.premiumPhase} />
          <OptionChainMini rows={chainRows} spot={spot} />
          <AlertsPanel alerts={alerts} onClear={clearAlerts} />

          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Scalp buttons</p>
            <div className="flex flex-wrap gap-1">
              {SCALP_POINTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyScalp(p, 'points', 'target')}
                  className="px-2 py-1 rounded bg-slate-800 text-[10px] font-bold hover:bg-gold/20 hover:text-gold"
                >
                  +{p} pts
                </button>
              ))}
              {SCALP_PCT.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyScalp(p, 'pct', 'target')}
                  className="px-2 py-1 rounded bg-slate-800 text-[10px] font-bold hover:bg-gold/20 hover:text-gold"
                >
                  +{p}%
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-3 space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Risk</p>
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="SL %" value={inputs.stopLossPct} onChange={(v) => patch({ stopLossPct: v })} suffix="%" />
              <NumInput label="T1 %" value={inputs.targetPct} onChange={(v) => patch({ targetPct: v })} suffix="%" />
              <NumInput label="Risk ₹" value={inputs.riskAmount} onChange={(v) => patch({ riskAmount: v })} />
              <NumInput label="Capital" value={inputs.capital} onChange={(v) => patch({ capital: v })} />
            </div>
            {result && (
              <div className="flex justify-center pt-2">
                <RrMeter rr={result.riskReward} />
              </div>
            )}
          </div>

          {assetMode === 'options' && optionsInsight && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-[10px] text-slate-400 space-y-1">
              <p className="font-bold text-purple-300 uppercase">Options flow</p>
              <p>Δ {optionsInsight.delta} · IV {optionsInsight.iv}% · {optionsInsight.buildup}</p>
              <p>Premium Δ {optionsInsight.premiumMove}</p>
            </div>
          )}

          <div className="rounded-xl border border-dark-border/60 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Feeds</p>
            {SUPPORTED_BROKERS.map((b) => (
              <div key={b.id} className={`text-xs py-1 ${b.active ? 'text-emerald-400' : 'text-slate-600'}`}>
                {b.label} {b.active ? '✓' : 'soon'}
              </div>
            ))}
          </div>

          <motion.button
            type="button"
            onClick={() => onNavigate?.('tradingjournal')}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10"
            whileHover={{ scale: 1.01 }}
          >
            <Target className="w-4 h-4" />
            Trading Journal
          </motion.button>
        </div>
      </div>
    </div>
  );
}
