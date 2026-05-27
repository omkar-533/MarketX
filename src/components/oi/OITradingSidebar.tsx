import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Crosshair,
  Lightbulb,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { FuturesOIData, OIAlert, OIIntelligenceData } from '../../data/marketData';

interface TradeSetup {
  id: string;
  title: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  strikes: string;
  rationale: string;
  risk: 'Low' | 'Medium' | 'High';
}

interface OITradingSidebarProps {
  data: OIIntelligenceData;
  future: FuturesOIData;
  smartMoneyScore: number;
  alerts: OIAlert[];
  onOpenChain?: () => void;
  onOpenStrategy?: () => void;
}

function formatL(value: number) {
  return `${(value / 100_000).toFixed(2)}L`;
}

function biasColor(bias: string) {
  if (bias.includes('Bullish')) return 'text-emerald-400';
  if (bias.includes('Bearish')) return 'text-red-400';
  return 'text-slate-300';
}

function buildTradeSetups(data: OIIntelligenceData, future: FuturesOIData): TradeSetup[] {
  const setups: TradeSetup[] = [];
  const spot = data.spotPrice;
  const support = data.strongestSupport;
  const resistance = data.strongestResistance;
  const mp = data.maxPain;

  if (data.overallPcr >= 1.15 && data.totalPeOiChange > data.totalCeOiChange) {
    setups.push({
      id: 'bull-put',
      title: 'Bull Put Spread / Sell PE',
      bias: 'bullish',
      strikes: `Sell PE near ${support}, buy lower PE`,
      rationale: `PCR ${data.overallPcr.toFixed(2)} with put OI building — writers betting on support hold.`,
      risk: data.oiTrapRisk > 55 ? 'High' : 'Medium',
    });
  }

  if (data.overallPcr <= 0.9 && data.totalCeOiChange > data.totalPeOiChange) {
    setups.push({
      id: 'bear-call',
      title: 'Bear Call Spread / Sell CE',
      bias: 'bearish',
      strikes: `Sell CE near ${resistance}, buy higher CE`,
      rationale: `Low PCR ${data.overallPcr.toFixed(2)} + call OI rising — resistance zone active.`,
      risk: data.fakeBreakoutRisk > 60 ? 'High' : 'Medium',
    });
  }

  const nearMaxPain = Math.abs(spot - mp) / spot < 0.008;
  if (nearMaxPain || data.marketBias === 'Neutral') {
    setups.push({
      id: 'range',
      title: 'Iron Condor / Range Play',
      bias: 'neutral',
      strikes: `CE ${resistance}+ / PE ${support}-`,
      rationale: `Spot ${spot.toFixed(0)} near max pain ${mp} — expiry pin risk, range-bound bias.`,
      risk: 'Medium',
    });
  }

  if (future.signal === 'Long Buildup') {
    setups.push({
      id: 'long-fut',
      title: 'Long Futures + Hedge',
      bias: 'bullish',
      strikes: `Long fut, buy PE ${support} as hedge`,
      rationale: `${future.signal} in futures OI with ${future.trendStrength} trend — follow institutional long.`,
      risk: data.reversalProbability > 65 ? 'High' : 'Low',
    });
  } else if (future.signal === 'Short Buildup') {
    setups.push({
      id: 'short-fut',
      title: 'Short Futures + Hedge',
      bias: 'bearish',
      strikes: `Short fut, buy CE ${resistance} as hedge`,
      rationale: `${future.signal} — shorts adding alongside falling price.`,
      risk: data.reversalProbability > 65 ? 'High' : 'Low',
    });
  }

  if (data.oiTrapRisk > 60) {
    setups.unshift({
      id: 'wait',
      title: 'Wait — OI Trap Risk',
      bias: 'neutral',
      strikes: 'Avoid breakout entries',
      rationale: `Trap risk ${data.oiTrapRisk}% — OI buildup without clean price follow-through.`,
      risk: 'High',
    });
  }

  return setups.slice(0, 4);
}

export default function OITradingSidebar({
  data,
  future,
  smartMoneyScore,
  alerts,
  onOpenChain,
  onOpenStrategy,
}: OITradingSidebarProps) {
  const setups = useMemo(() => buildTradeSetups(data, future), [data, future]);

  const symbolAlerts = useMemo(
    () => alerts.filter((a) => a.symbol === data.symbol || a.symbol === 'MARKET').slice(0, 3),
    [alerts, data.symbol],
  );

  const watchStrikes = useMemo(() => {
    const rows = [
      ...data.callWriting.map((r) => ({ strike: r.strike, type: 'CE Write' as const, chg: r.change })),
      ...data.putWriting.map((r) => ({ strike: r.strike, type: 'PE Write' as const, chg: r.change })),
    ];
    return rows.sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 5);
  }, [data]);

  const ceOiShare = (data.totalCeOi / Math.max(data.totalCeOi + data.totalPeOi, 1)) * 100;
  const oiFlowBullish = data.totalPeOiChange > data.totalCeOiChange;

  const levelLadder = [
    { label: 'Resistance', strike: data.strongestResistance, color: 'text-red-400', bar: 'bg-red-500' },
    { label: 'Spot', strike: Math.round(data.spotPrice), color: 'text-white', bar: 'bg-blue-500' },
    { label: 'Max Pain', strike: data.maxPain, color: 'text-[#d4af37]', bar: 'bg-[#d4af37]' },
    { label: 'ATM', strike: data.atmStrike, color: 'text-blue-300', bar: 'bg-blue-400' },
    { label: 'Support', strike: data.strongestSupport, color: 'text-emerald-400', bar: 'bg-emerald-500' },
  ].sort((a, b) => b.strike - a.strike);

  return (
    <aside className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto pr-0.5">
      {/* Action bias */}
      <div className="bg-[#0b0e17] border border-[#d4af37]/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-[#d4af37] uppercase tracking-wider flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5" />
            Trade Bias
          </h3>
          <span className="text-[10px] font-bold text-slate-500">Score {smartMoneyScore}</span>
        </div>
        <div className={`text-xl font-black ${biasColor(data.marketBias)}`}>{data.marketBias}</div>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{data.smartMoneySignal}</p>
        <div className="mt-3 flex gap-2">
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded border ${
              future.premiumDiscount >= 0
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                : 'text-red-400 bg-red-500/10 border-red-500/25'
            }`}
          >
            Fut {future.premiumDiscount >= 0 ? 'Premium' : 'Discount'} {Math.abs(future.premiumDiscount)}
          </span>
          <span className="text-[10px] font-bold px-2 py-1 rounded border text-slate-400 bg-slate-500/10 border-slate-500/20">
            {future.signal}
          </span>
        </div>
      </div>

      {/* Key levels ladder */}
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-[#d4af37]" />
          Key Levels
        </h3>
        <div className="space-y-1.5">
          {levelLadder.map((lv) => (
            <div key={lv.label} className="flex items-center gap-2">
              <div className={`w-1 h-6 rounded-full ${lv.bar}`} />
              <div className="flex-1 flex justify-between items-center text-xs">
                <span className="text-slate-500">{lv.label}</span>
                <span className={`font-bold tabular-nums ${lv.color}`}>{lv.strike.toLocaleString('en-IN')}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-[#1a1f2e] overflow-hidden relative">
          <div
            className="absolute h-full w-1.5 bg-white rounded-full shadow"
            style={{
              left: `${Math.min(95, Math.max(5, ((data.spotPrice - data.strongestSupport) / Math.max(data.strongestResistance - data.strongestSupport, 1)) * 100))}%`,
            }}
          />
        </div>
        <p className="text-[9px] text-slate-600 mt-1 text-center">Spot between support & resistance</p>
      </div>

      {/* PCR + OI flow */}
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">PCR & OI Flow</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-center">
            <div className="text-[9px] text-slate-500">Overall PCR</div>
            <div className={`text-lg font-black ${data.overallPcr >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
              {data.overallPcr.toFixed(2)}
            </div>
            <div className="text-[9px] text-slate-600">{data.overallPcr >= 1 ? 'Put heavy' : 'Call heavy'}</div>
          </div>
          <div className="p-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-center">
            <div className="text-[9px] text-slate-500">ATM PCR</div>
            <div className={`text-lg font-black ${data.atmPcr >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
              {data.atmPcr.toFixed(2)}
            </div>
            <div className="text-[9px] text-slate-600">Near-money bias</div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-red-400">CE OI Δ {formatL(data.totalCeOiChange)}</span>
            <span className="text-emerald-400">PE OI Δ {formatL(data.totalPeOiChange)}</span>
          </div>
          <div className="h-2 rounded-full bg-[#1a1f2e] overflow-hidden flex">
            <div className="h-full bg-red-500/80" style={{ width: `${ceOiShare}%` }} />
            <div className="h-full bg-emerald-500/80" style={{ width: `${100 - ceOiShare}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1">
            {oiFlowBullish ? (
              <>
                <TrendingUp className="w-3 h-3 text-emerald-400" /> Put writers dominating today
              </>
            ) : (
              <>
                <TrendingDown className="w-3 h-3 text-red-400" /> Call writers dominating today
              </>
            )}
          </p>
        </div>
      </div>

      {/* Trade setups */}
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-[#d4af37]" />
          Suggested Setups
        </h3>
        <div className="space-y-2">
          {setups.map((s) => (
            <div
              key={s.id}
              className={`p-3 rounded-lg border ${
                s.bias === 'bullish'
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : s.bias === 'bearish'
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-[#121520] border-[#1a1f2e]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-bold text-white">{s.title}</span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    s.risk === 'High'
                      ? 'text-red-400 bg-red-500/15'
                      : s.risk === 'Medium'
                        ? 'text-[#d4af37] bg-[#d4af37]/15'
                        : 'text-emerald-400 bg-emerald-500/15'
                  }`}
                >
                  {s.risk}
                </span>
              </div>
              <p className="text-[10px] text-[#d4af37]/90 font-medium mb-1">{s.strikes}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">{s.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Watch strikes */}
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2">OI Hot Strikes</h3>
        <div className="space-y-1">
          {watchStrikes.map((w) => (
            <div
              key={`${w.type}-${w.strike}`}
              className="flex items-center justify-between py-1.5 px-2 rounded bg-[#121520] text-xs"
            >
              <span className="font-bold text-white">{w.strike}</span>
              <span className={w.type.startsWith('CE') ? 'text-red-400' : 'text-emerald-400'}>{w.type}</span>
              <span className={`font-bold ${w.chg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {w.chg >= 0 ? '+' : ''}
                {(w.chg / 1000).toFixed(0)}K
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk checklist */}
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#d4af37]" />
          Risk Check
        </h3>
        {[
          { label: 'Reversal', value: data.reversalProbability, warn: 60 },
          { label: 'Fake Breakout', value: data.fakeBreakoutRisk, warn: 55 },
          { label: 'OI Trap', value: data.oiTrapRisk, warn: 50 },
        ].map((r) => (
          <div key={r.label} className="mb-2 last:mb-0">
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-slate-500">{r.label}</span>
              <span className={`font-bold ${r.value >= r.warn ? 'text-red-400' : 'text-slate-300'}`}>{r.value}%</span>
            </div>
            <div className="h-1 bg-[#1a1f2e] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${r.value >= r.warn ? 'bg-red-500' : 'bg-[#d4af37]'}`}
                style={{ width: `${r.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Mini alerts */}
      {symbolAlerts.length > 0 && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            Live Alerts
          </h3>
          <div className="space-y-2">
            {symbolAlerts.map((a) => (
              <div key={a.id} className="p-2 rounded-lg bg-[#121520] border border-[#1a1f2e]">
                <div className="text-[10px] font-bold text-[#d4af37]">{a.alertType}</div>
                <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      {(onOpenChain || onOpenStrategy) && (
        <div className="flex flex-col gap-2">
          {onOpenChain && (
            <button
              type="button"
              onClick={onOpenChain}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#1a1f2e] text-xs font-bold text-slate-300 hover:border-[#d4af37]/40 hover:text-[#d4af37] transition-colors"
            >
              Option Chain <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenStrategy && (
            <button
              type="button"
              onClick={onOpenStrategy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/30 text-xs font-bold text-[#d4af37] hover:bg-[#d4af37]/25 transition-colors"
            >
              Build Strategy <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
