import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  OI_BUILDUP_COLORS,
  SIGNAL_STYLES,
  type ScalpConditionFlags,
  type ScalpingAnalysis,
  type ScalpSignal,
} from '../../services/scalpingTerminalEngine';
import type { ChainStrikeRow, TerminalAlert } from '../../hooks/useScalpingTerminal';
import type { OiBuildupLabel } from '../../services/ltpCalculatorEngine';
import { AnimatedPrice } from './LtpCalculatorPanels';
import WolfLoader from '../WolfLoader';

export function ScalpSignalBadge({ signal }: { signal: ScalpSignal }) {
  return (
    <span
      className={`text-xs font-black px-3 py-1.5 rounded-lg border uppercase tracking-wide ${SIGNAL_STYLES[signal]}`}
    >
      {signal}
    </span>
  );
}

export function MomentumMeter({ value, tier }: { value: number; tier: string }) {
  return (
    <div className="rounded-xl border border-dark-border/60 bg-[#0a0e17] p-3">
      <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
        <span>Momentum</span>
        <span className={value >= 60 ? 'text-emerald-400' : value >= 40 ? 'text-gold' : 'text-slate-400'}>
          {tier}
        </span>
      </div>
      <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
        <motion.div
          className={`h-full ${value >= 80 ? 'bg-gradient-to-r from-emerald-500 to-gold' : value >= 50 ? 'bg-gold' : 'bg-slate-600'}`}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
      <p className="text-right text-[10px] text-slate-500 mt-1 font-mono">{value}/100</p>
    </div>
  );
}

export function TerminalTopBar({
  symbol,
  name,
  ltp,
  changePct,
  flash,
  signal,
  signalCategory,
  masterScore,
  tradeExecutionReady,
  momentum,
  connected,
}: {
  symbol: string;
  name: string;
  ltp: number;
  changePct: number;
  flash: boolean;
  signal: ScalpSignal;
  signalCategory: 'NO TRADE' | 'WEAK SIGNAL' | 'BUY' | 'STRONG BUY' | 'SELL' | 'STRONG SELL';
  masterScore: number;
  tradeExecutionReady: boolean;
  momentum: number;
  connected: boolean;
}) {
  const bull = changePct >= 0;
  return (
    <div
      className={`rounded-xl border p-4 flex flex-wrap items-center gap-4 ${
        bull ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-red-500/20 bg-red-500/[0.04]'
      }`}
    >
      <div className="min-w-[140px]">
        <p className="text-[10px] text-slate-500 font-bold uppercase">Symbol</p>
        <p className="text-lg font-bold text-gold">{symbol}</p>
        <p className="text-[10px] text-slate-500">{name}</p>
      </div>
      <div className="flex-1 min-w-[160px]">
        <p className="text-[10px] text-slate-500 font-bold uppercase">LTP</p>
        <p className={`text-3xl font-black tabular-nums ${bull ? 'text-emerald-400' : 'text-red-400'}`}>
          ₹<AnimatedPrice value={ltp} flash={flash} />
        </p>
        <p className={`text-sm font-bold ${bull ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
          {changePct >= 0 ? '+' : ''}
          {changePct}%
        </p>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-[10px] text-slate-500 font-bold uppercase">Signal</p>
        <ScalpSignalBadge signal={signal} />
        <p className="text-[10px] text-slate-400 uppercase mt-1">{signalCategory}</p>
      </div>
      <div className="text-center min-w-[90px]">
        <p className="text-[10px] text-slate-500 font-bold uppercase">Master score</p>
        <p className="text-2xl font-black text-gold">{masterScore}</p>
        <p className={`text-[10px] ${tradeExecutionReady ? 'text-emerald-400' : 'text-slate-400'}`}>
          {tradeExecutionReady ? 'EXECUTE' : 'WAIT'}
        </p>
      </div>
      <div className="text-center min-w-[80px]">
        <p className="text-[10px] text-slate-500 font-bold uppercase">Mom.</p>
        <p className="text-2xl font-black text-gold">{momentum}</p>
      </div>
      <div
        className={`text-[10px] font-bold px-2 py-1 rounded border ${
          connected ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-300'
        }`}
      >
        {connected ? 'WS LIVE' : 'OFFLINE'}
      </div>
    </div>
  );
}

function CondDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border ${
        ok ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-slate-700 text-slate-600'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-slate-600'}`} />
      {label}
    </div>
  );
}

export function ConditionGrid({ c }: { c: ScalpConditionFlags }) {
  return (
    <div className="flex flex-wrap gap-1">
      <CondDot ok={c.ltpUp} label="LTP ↑" />
      <CondDot ok={c.ltpDown} label="LTP ↓" />
      <CondDot ok={c.volumeSpike} label="Vol spike" />
      <CondDot ok={c.oiUp} label="OI ↑" />
      <CondDot ok={c.priceAboveVwap} label="> VWAP" />
      <CondDot ok={c.priceBelowVwap} label="< VWAP" />
      <CondDot ok={c.emaBullish} label="EMA bull" />
      <CondDot ok={c.emaBearish} label="EMA bear" />
      <CondDot ok={c.breakout} label="Breakout" />
      <CondDot ok={c.breakdown} label="Breakdown" />
      <CondDot ok={c.premiumMomentum} label="Premium +" />
      <CondDot ok={c.largeCandle} label="Big candle" />
      <CondDot ok={!c.fakeBreakout} label="No fake BO" />
    </div>
  );
}

export function ScoreBreakdownPanel({ analysis }: { analysis: ScalpingAnalysis }) {
  return (
    <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17] p-3 space-y-3">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Master signal score</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-900/80 p-3 border border-slate-700">
          <p className="text-[10px] text-slate-500 uppercase">Score</p>
          <p className="text-2xl font-bold text-gold">{analysis.masterScore}</p>
          <p className="text-[10px] text-slate-500">{analysis.signalCategory}</p>
        </div>
        <div className="rounded-lg bg-slate-900/80 p-3 border border-slate-700">
          <p className="text-[10px] text-slate-500 uppercase">Execution</p>
          <p className={`text-lg font-bold ${analysis.tradeExecutionReady ? 'text-emerald-400' : 'text-slate-400'}`}>
            {analysis.tradeExecutionReady ? 'Ready' : 'Waiting'}
          </p>
          <p className="text-[10px] text-slate-500">MTF {analysis.confidenceLevel}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
        <div className="rounded-lg bg-slate-900/70 p-2 border border-slate-700">
          <div>Price speed</div>
          <div className="text-slate-100 font-semibold">{analysis.priceSpeedLabel}</div>
        </div>
        <div className="rounded-lg bg-slate-900/70 p-2 border border-slate-700">
          <div>Premium</div>
          <div className="text-slate-100 font-semibold">{analysis.premiumLabel}</div>
        </div>
        <div className="rounded-lg bg-slate-900/70 p-2 border border-slate-700">
          <div>Vol ratio</div>
          <div className="text-slate-100 font-semibold">{analysis.volumeRatio}</div>
        </div>
        <div className="rounded-lg bg-slate-900/70 p-2 border border-slate-700">
          <div>OI Δ%</div>
          <div className="text-slate-100 font-semibold">{analysis.oiChangePct}%</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
        <span className="rounded-full border border-slate-700 px-2 py-1">VWAP {analysis.vwapDistancePct}%</span>
        <span className="rounded-full border border-slate-700 px-2 py-1">Smart money {analysis.smartMoneyScore}</span>
        <span className="rounded-full border border-slate-700 px-2 py-1">
          Candle {analysis.candleStrengthScore}/20
        </span>
      </div>
    </div>
  );
}

export function OiBuildupBadge({ label }: { label: OiBuildupLabel }) {
  return (
    <span className={`text-xs font-bold px-2 py-1 rounded border ${OI_BUILDUP_COLORS[label]}`}>{label}</span>
  );
}

export function MtfPanel({ analysis }: { analysis: ScalpingAnalysis }) {
  const chip = (b: string, label: string) => (
    <span
      className={`text-[10px] font-bold px-2 py-1 rounded ${
        b === 'bull' ? 'bg-emerald-500/15 text-emerald-400' : b === 'bear' ? 'bg-red-500/15 text-red-400' : 'bg-slate-800 text-slate-500'
      }`}
    >
      {label} {b === 'bull' ? '↑' : b === 'bear' ? '↓' : '—'}
    </span>
  );
  return (
    <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17] p-3 space-y-2">
      <p className="text-[10px] font-bold text-slate-500 uppercase">Multi-timeframe</p>
      <div className="flex gap-2 flex-wrap">
        {chip(analysis.mtf.m1, '1m')}
        {chip(analysis.mtf.m3, '3m')}
        {chip(analysis.mtf.m5, '5m')}
      </div>
      <p className={`text-[10px] font-semibold ${analysis.mtf.aligned ? 'text-emerald-400' : 'text-amber-400'}`}>
        {analysis.mtf.aligned ? 'All timeframes aligned ✓' : 'Waiting for MTF alignment'}
      </p>
    </div>
  );
}

export function PremiumSpeedPanel({ series, phase }: { series: number[]; phase: string }) {
  const max = Math.max(...series, 1);
  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
      <div className="flex justify-between mb-2">
        <p className="text-[10px] font-bold text-purple-300 uppercase">Premium speed</p>
        <span className="text-[10px] font-bold text-gold">{phase}</span>
      </div>
      <div className="flex items-end gap-0.5 h-14">
        {series.slice(-20).map((p, i) => (
          <div
            key={i}
            className="flex-1 bg-purple-500/50 rounded-t min-w-[3px]"
            style={{ height: `${Math.max(8, (p / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function OptionChainMini({ rows, spot }: { rows: ChainStrikeRow[]; spot: number }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dark-border/60 min-h-[140px] flex items-center justify-center">
        <WolfLoader fullscreen={false} label="Loading Option Chain" />
      </div>
    );
  }
  const maxOi = Math.max(...rows.flatMap((r) => [r.ceOi, r.peOi]), 1);
  return (
    <div className="rounded-xl border border-dark-border/60 bg-[#0a0e17] overflow-hidden">
      <p className="text-[10px] font-bold text-slate-500 uppercase px-3 py-2 border-b border-dark-border/40">
        Live option chain
      </p>
      <div className="max-h-48 overflow-y-auto text-[10px]">
        <table className="w-full">
          <thead className="text-slate-600 sticky top-0 bg-[#0b0e17]">
            <tr>
              <th className="py-1 px-2 text-left">Strike</th>
              <th className="py-1 px-1">CE</th>
              <th className="py-1 px-1">PE</th>
              <th className="py-1 px-1">OI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const atm = Math.abs(r.strike - spot) < (spot > 30000 ? 100 : 50);
              return (
                <tr
                  key={r.strike}
                  className={atm ? 'bg-gold/10' : 'border-t border-dark-border/30'}
                >
                  <td className="py-1 px-2 font-mono text-slate-400">{r.strike}</td>
                  <td className="py-1 px-1 text-emerald-400">{r.ceLtp}</td>
                  <td className="py-1 px-1 text-red-400">{r.peLtp}</td>
                  <td className="py-1 px-1">
                    <div className="flex gap-0.5 h-2">
                      <div
                        className="bg-emerald-500/60 rounded-sm"
                        style={{ width: `${(r.ceOi / maxOi) * 24}px` }}
                      />
                      <div
                        className="bg-red-500/60 rounded-sm"
                        style={{ width: `${(r.peOi / maxOi) * 24}px` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AlertsPanel({ alerts, onClear }: { alerts: TerminalAlert[]; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dark-border/60 bg-[#0b0e17] p-3 max-h-40 overflow-y-auto">
      <div className="flex justify-between mb-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase">Alerts</p>
        <button type="button" onClick={onClear} className="text-[9px] text-slate-600 hover:text-gold">
          Clear
        </button>
      </div>
      {alerts.length === 0 ? (
        <p className="text-[10px] text-slate-600">No alerts yet</p>
      ) : (
        <ul className="space-y-1">
          {alerts.map((a) => (
            <li key={a.id} className="text-[10px] text-slate-400 border-l-2 border-gold/40 pl-2">
              <span className="text-gold font-bold">{a.type}</span> · {a.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SmartMoneyBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-center text-xs font-black text-gold tracking-wider uppercase"
    >
      ◆ Smart Money Active ◆
    </motion.div>
  );
}

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-dark-border/60 bg-[#0b0e17]/90 p-3 ${className}`}>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}
