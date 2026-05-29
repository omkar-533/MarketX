import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LtpCalcResult, TradeSignal } from '../../services/ltpCalculatorEngine';

export function AnimatedPrice({
  value,
  flash,
  className = '',
}: {
  value: number;
  flash?: boolean;
  className?: string;
}) {
  return (
    <motion.span
      key={value}
      initial={flash ? { scale: 1.08, color: '#34d399' } : false}
      animate={{ scale: 1 }}
      className={`tabular-nums ${className}`}
    >
      {value > 0 ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
    </motion.span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'bull' | 'bear' | 'neutral' | 'gold';
}) {
  const borderCls = {
    bull: 'border-emerald-500/30',
    bear: 'border-red-500/30',
    neutral: 'border-slate-600/40',
    gold: 'border-gold/30',
  }[tone];
  const textCls = {
    bull: 'text-emerald-400',
    bear: 'text-red-400',
    neutral: 'text-slate-200',
    gold: 'text-gold',
  }[tone];
  return (
    <div className={`rounded-xl border bg-[#0d111c]/80 p-3 ${borderCls}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
      <p className={`text-lg font-bold mt-1 ${textCls}`}>{value}</p>
      {sub ? <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p> : null}
    </div>
  );
}

export function RrMeter({ rr, max = 5 }: { rr: number; max?: number }) {
  const pct = Math.min(100, (rr / max) * 100);
  const r = 44;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1a1f2e" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#d4af37"
          strokeWidth="8"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gold">{rr > 0 ? rr.toFixed(2) : '—'}</span>
        <span className="text-[9px] text-slate-500 uppercase">R:R</span>
      </div>
    </div>
  );
}

export function TargetHeatmap({
  sl,
  entry,
  t1,
  t2,
  t3,
  ltp,
  direction,
}: {
  sl: number;
  entry: number;
  t1: number;
  t2: number;
  t3: number;
  ltp: number;
  direction: 'BUY' | 'SELL';
}) {
  const prices = direction === 'BUY' ? [sl, entry, t1, t2, t3] : [t3, t2, t1, entry, sl];
  const min = Math.min(...prices.filter((p) => p > 0));
  const max = Math.max(...prices);
  const span = max - min || 1;
  const zones = [
    { label: 'SL', price: sl, cls: 'bg-red-500/40' },
    { label: 'Entry', price: entry, cls: 'bg-slate-500/50' },
    { label: 'T1', price: t1, cls: 'bg-emerald-500/35' },
    { label: 'T2', price: t2, cls: 'bg-emerald-500/50' },
    { label: 'T3', price: t3, cls: 'bg-emerald-600/60' },
  ];
  const ltpPct = ltp > 0 ? ((ltp - min) / span) * 100 : 0;

  return (
    <div className="rounded-xl border border-dark-border/60 bg-[#0a0e17] p-3">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Target zones</p>
      <div className="relative h-8 rounded-lg overflow-hidden flex">
        {zones.map((z) => (
          <div
            key={z.label}
            className={`flex-1 ${z.cls} border-r border-black/20 flex items-center justify-center text-[9px] font-bold text-white/90`}
            title={`${z.label}: ${z.price}`}
          >
            {z.label}
          </div>
        ))}
      </div>
      {ltp > 0 && (
        <div
          className="relative h-1.5 mt-2 rounded-full bg-slate-800"
          title={`LTP ${ltp}`}
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold shadow-lg shadow-gold/50"
            style={{ left: `${Math.min(98, Math.max(2, ltpPct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function SignalBadge({ signal }: { signal: TradeSignal }) {
  const cls =
    signal === 'BUY'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
      : signal === 'SELL'
        ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${cls}`}>{signal}</span>
  );
}

export function ProgressToTarget({
  pct,
  label,
}: {
  pct: number;
  label: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-gold/60 to-emerald-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
    </div>
  );
}

export function ResultSummaryGrid({ result }: { result: LtpCalcResult }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      <StatCard label="Stoploss" value={`₹${result.stopLossPrice}`} tone="bear" />
      <StatCard label="Target 1" value={`₹${result.target1Price}`} tone="bull" />
      <StatCard label="Quantity" value={result.quantity} sub={`${result.lots} lots`} tone="gold" />
      <StatCard label="Max loss" value={`₹${result.maxLoss}`} tone="bear" />
      <StatCard label="Max profit" value={`₹${result.maxProfit}`} tone="bull" />
      <StatCard label="Weighted P&L" value={`₹${result.weightedProfit}`} sub="Partial booking" />
      <StatCard label="Exposure" value={`₹${result.exposure.toLocaleString('en-IN')}`} />
      <StatCard label="Net @ target" value={`₹${result.netPnlAtTarget}`} tone="bull" />
    </div>
  );
}
