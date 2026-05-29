import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Gauge,
  Radio,
  RefreshCw,
  Search,
  Target,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { calculateGreeks } from '../services/optionPricing';
import {
  buildTechnicals,
  classifyOiBuildup,
  computeLtpCalc,
  defaultLtpCalcInputs,
  exportTradeReport,
  generateTradeSignal,
  scalpingAdjust,
  SUPPORTED_BROKERS,
  targetZoneProgress,
  type AssetMode,
  type LtpCalcInputs,
  type TradeDirection,
} from '../services/ltpCalculatorEngine';
import { useLtpCalculatorLive } from '../hooks/useLtpCalculatorLive';
import { BRAND } from '../constants/brandLabels';
import {
  AnimatedPrice,
  ProgressToTarget,
  ResultSummaryGrid,
  RrMeter,
  SignalBadge,
  StatCard,
  TargetHeatmap,
} from './ltpCalculator/LtpCalculatorPanels';

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
  const [assetMode, setAssetMode] = useState<AssetMode>('equity');
  const [optionStrike, setOptionStrike] = useState(0);
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  const [optionDte, setOptionDte] = useState(7);

  const [inputs, setInputs] = useState<LtpCalcInputs>(() => defaultLtpCalcInputs(24580, 25));

  const { quote, flash, lotSize, instrumentName, search, connected, wsStatus, refresh } =
    useLtpCalculatorLive(symbol, liveLtp);

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

  const tech = useMemo(() => {
    if (!quote) return null;
    return buildTechnicals({
      price: quote.price,
      changePercent: quote.changePercent,
      volume: quote.volume,
      high: quote.high,
      low: quote.low,
      prevClose: quote.prevClose,
      vwap: quote.vwap,
    });
  }, [quote]);

  const signal = useMemo(() => {
    if (!tech) return { signal: 'HOLD' as const, score: 0, reasons: ['Connect live feed for signals'] };
    return generateTradeSignal(tech, inputs.direction);
  }, [tech, inputs.direction]);

  const optionsInsight = useMemo(() => {
    if (assetMode !== 'options' || entry <= 0) return null;
    const strike = optionStrike > 0 ? optionStrike : Math.round(entry / 50) * 50;
    const iv = quote?.iv ?? 18;
    const g = calculateGreeks(entry, strike, optionDte, iv, optionType);
    const priceChg = quote?.change ?? 0;
    const oiChg = 0;
    return {
      premiumMove: quote?.change ?? 0,
      oiChange: oiChg,
      volumeSpike: (quote?.volume ?? 0) > 0,
      iv,
      delta: g.delta,
      buildup: classifyOiBuildup(priceChg, oiChg),
      strike,
      gamma: g.gamma,
      theta: g.theta,
      vega: g.vega,
    };
  }, [assetMode, entry, optionStrike, optionDte, optionType, quote]);

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
      signal,
      optionsInsight,
      broker: BRAND,
    });
  };

  return (
    <div className="ltp-calculator space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="w-6 h-6 text-gold" />
            <h1 className="text-xl font-bold text-slate-100">LPT Master</h1>
            <SignalBadge signal={signal.signal} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Institutional risk · multi-target · live {BRAND} feed
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            Export plan
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        {/* Left — symbol & inputs */}
        <div className="lg:col-span-4 space-y-3">
          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Symbol & LTP</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={searchQ || symbol}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  if (e.target.value.length <= 12) setSymbol(e.target.value.toUpperCase());
                }}
                onFocus={() => setSearchQ(symbol)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-dark-border/80 bg-[#0a0e17] text-sm text-slate-100"
                placeholder="NIFTY, BANKNIFTY, RELIANCE…"
              />
            </div>
            {searchQ && (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-dark-border/40 divide-y divide-dark-border/40">
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
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gold/10 text-slate-300"
                  >
                    <span className="font-bold text-gold">{s.symbol}</span>
                    <span className="text-slate-500 ml-2">{s.name}</span>
                    <span className="float-right">₹{s.price.toLocaleString('en-IN')}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-300">{instrumentName}</span>
              <label className="flex items-center gap-2 text-[10px] text-slate-500">
                <input
                  type="checkbox"
                  checked={liveLtp}
                  onChange={(e) => setLiveLtp(e.target.checked)}
                  className="rounded border-dark-border"
                />
                Auto LTP
              </label>
            </div>

            <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 text-center">
              <p className="text-[10px] text-slate-500 uppercase font-bold">Live LTP</p>
              <p className="text-3xl font-bold text-gold mt-1">
                ₹<AnimatedPrice value={ltp} flash={flash} />
              </p>
              {quote && (
                <p
                  className={`text-xs font-semibold mt-1 ${quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {quote.changePercent >= 0 ? '+' : ''}
                  {quote.changePercent}% · Vol {quote.volume.toLocaleString('en-IN')}
                </p>
              )}
            </div>

            <NumInput
              label="Entry price"
              value={inputs.entry}
              onChange={(v) => {
                patch({ entry: v });
                setManualLtp(v);
              }}
            />

            <div className="flex gap-2">
              {(['BUY', 'SELL'] as TradeDirection[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => patch({ direction: d })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold border transition-all ${
                    inputs.direction === d
                      ? d === 'BUY'
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-red-500/20 border-red-500/50 text-red-400'
                      : 'border-dark-border/60 text-slate-500'
                  }`}
                >
                  {d === 'BUY' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
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

          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Risk management</p>
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="SL %" value={inputs.stopLossPct} onChange={(v) => patch({ stopLossPct: v })} suffix="%" />
              <NumInput label="Target %" value={inputs.targetPct} onChange={(v) => patch({ targetPct: v })} suffix="%" />
              <NumInput label="T2 %" value={inputs.target2Pct} onChange={(v) => patch({ target2Pct: v })} suffix="%" />
              <NumInput label="T3 %" value={inputs.target3Pct} onChange={(v) => patch({ target3Pct: v })} suffix="%" />
              <NumInput label="Risk ₹" value={inputs.riskAmount} onChange={(v) => patch({ riskAmount: v })} />
              <NumInput label="Capital ₹" value={inputs.capital} onChange={(v) => patch({ capital: v })} />
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <NumInput
                label="Book T1 %"
                value={inputs.partialBookPct1}
                onChange={(v) => patch({ partialBookPct1: v })}
              />
              <NumInput
                label="Book T2 %"
                value={inputs.partialBookPct2}
                onChange={(v) => patch({ partialBookPct2: v })}
              />
              <NumInput
                label="Book T3 %"
                value={inputs.partialBookPct3}
                onChange={(v) => patch({ partialBookPct3: v })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={inputs.trailingEnabled}
                onChange={(e) => patch({ trailingEnabled: e.target.checked })}
              />
              Trailing SL after target
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={inputs.breakEvenOnTarget1}
                onChange={(e) => patch({ breakEvenOnTarget1: e.target.checked })}
              />
              Move SL to break-even on T1
            </label>
          </div>

          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Scalping quick set</p>
            <div className="flex flex-wrap gap-1">
              {SCALP_POINTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyScalp(p, 'points', 'target')}
                  className="px-2 py-1 rounded bg-slate-800 text-[10px] font-bold text-slate-300 hover:bg-gold/20 hover:text-gold"
                >
                  +{p} pts
                </button>
              ))}
              {SCALP_PCT.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyScalp(p, 'pct', 'target')}
                  className="px-2 py-1 rounded bg-slate-800 text-[10px] font-bold text-slate-300 hover:bg-gold/20 hover:text-gold"
                >
                  +{p}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center — results */}
        <div className="lg:col-span-5 space-y-3">
          {result ? (
            <>
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
              <ProgressToTarget pct={progressPct} label="Progress entry → T1" />
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17] p-4 flex flex-col items-center">
                  <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Risk : Reward</p>
                  <RrMeter rr={result.riskReward} />
                  <p className="text-[10px] text-slate-500 mt-2">T2 RR {result.riskRewardT2} · T3 {result.riskRewardT3}</p>
                </div>
                <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17] p-4 space-y-2">
                  <StatCard
                    label="Net P&L @ target"
                    value={`₹${result.netPnlAtTarget}`}
                    tone="bull"
                    sub={`Charges ₹${result.totalCharges}`}
                  />
                  <StatCard label="Net P&L @ SL" value={`₹${result.netPnlAtSl}`} tone="bear" />
                  <StatCard label="Margin (est.)" value={`₹${result.marginRequired.toLocaleString('en-IN')}`} />
                  {inputs.trailingEnabled && (
                    <p className="text-[10px] text-amber-300/90">
                      Trail SL @ ₹{result.trailingSlPrice} · BE ₹{result.breakEvenPrice}
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-dark-border/60 p-12 text-center text-slate-500 text-sm">
              Set entry price to calculate SL, targets & position size
            </div>
          )}
        </div>

        {/* Right — signals & options */}
        <div className="lg:col-span-3 space-y-3">
          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-gold" />
              <p className="text-xs font-bold text-slate-300">Real-time signal</p>
            </div>
            <div className="flex items-center justify-between mb-2">
              <SignalBadge signal={signal.signal} />
              <span className="text-[10px] text-slate-500">Score {signal.score}</span>
            </div>
            <ul className="space-y-1">
              {signal.reasons.map((r) => (
                <li key={r} className="text-[10px] text-slate-500 flex items-start gap-1">
                  <Radio className="w-3 h-3 text-gold shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
            {tech && (
              <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
                <span className="text-slate-500">RSI</span>
                <span className="text-right font-mono text-slate-300">{tech.rsi}</span>
                <span className="text-slate-500">VWAP</span>
                <span className="text-right font-mono text-slate-300">{tech.vwap}</span>
                <span className="text-slate-500">EMA9/21</span>
                <span className="text-right font-mono text-slate-300">
                  {tech.ema9} / {tech.ema21}
                </span>
              </div>
            )}
          </div>

          {assetMode === 'options' && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-2">
              <p className="text-[10px] font-bold text-purple-300 uppercase">Options mode</p>
              <div className="grid grid-cols-2 gap-2">
                <NumInput
                  label="Strike"
                  value={optionStrike}
                  onChange={setOptionStrike}
                  step={50}
                />
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Type</span>
                  <select
                    value={optionType}
                    onChange={(e) => setOptionType(e.target.value as 'CE' | 'PE')}
                    className="mt-1 w-full rounded-lg border border-dark-border/80 bg-[#0a0e17] px-2 py-2 text-sm"
                  >
                    <option value="CE">CE</option>
                    <option value="PE">PE</option>
                  </select>
                </label>
                <NumInput label="DTE" value={optionDte} onChange={setOptionDte} step={1} />
              </div>
              {optionsInsight && (
                <div className="text-[10px] space-y-1 text-slate-400">
                  <p>
                    <span className="text-slate-500">Δ</span> {optionsInsight.delta} · IV {optionsInsight.iv}%
                  </p>
                  <p>
                    <span className="text-slate-500">Buildup</span>{' '}
                    <span className="text-gold font-semibold">{optionsInsight.buildup}</span>
                  </p>
                  <p>Θ {optionsInsight.theta} · ν {optionsInsight.vega}</p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Broker feeds</p>
            <div className="space-y-1">
              {SUPPORTED_BROKERS.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center justify-between text-xs py-1.5 px-2 rounded ${
                    b.active ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-600'
                  }`}
                >
                  <span>{b.label}</span>
                  {b.active ? (
                    <span className="text-[9px] font-bold">ACTIVE</span>
                  ) : (
                    <span className="text-[9px]">Soon</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <p className="text-[10px] font-bold text-slate-500 uppercase">Charges & slippage</p>
            </div>
            <NumInput
              label="Slippage (bps)"
              value={inputs.slippageBps}
              onChange={(v) => patch({ slippageBps: v })}
            />
            <NumInput
              label="Brokerage / leg ₹"
              value={inputs.brokeragePerLeg}
              onChange={(v) => patch({ brokeragePerLeg: v })}
            />
            {result && (
              <p className="text-[10px] text-slate-500 mt-2">
                Slippage cost ₹{result.slippageCost} · Total charges ₹{result.totalCharges}
              </p>
            )}
          </div>

          <motion.button
            type="button"
            onClick={() => onNavigate?.('tradingjournal')}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/10"
            whileHover={{ scale: 1.01 }}
          >
            <Target className="w-4 h-4" />
            Log in Trading Journal
          </motion.button>
        </div>
      </div>
    </div>
  );
}
