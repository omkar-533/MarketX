import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Crosshair,
  Layers,
  Target,
  Zap,
} from 'lucide-react';
import { BRAND_SHORT } from '../../constants/brandLabels';

const SPARK = [42, 48, 45, 55, 52, 61, 58, 68, 72, 70, 78, 85];

function MiniSpark({ up }: { up: boolean }) {
  const max = Math.max(...SPARK);
  const min = Math.min(...SPARK);
  const pts = SPARK.map((v, i) => {
    const x = (i / (SPARK.length - 1)) * 100;
    const y = 28 - ((v - min) / (max - min || 1)) * 24;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 32" className="w-full h-8" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={up ? '#34d399' : '#f87171'}
        strokeWidth="2"
        points={pts}
      />
    </svg>
  );
}

/** Floating trading widgets on login — show platform capabilities */
export default function AuthTradingOverlay() {
  return (
    <div className="auth-trade-overlay" aria-hidden="true">
      {/* NIFTY LTP */}
      <motion.div
        className="auth-trade-card auth-trade-card--nifty"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Live LTP</span>
          <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {BRAND_SHORT}
          </span>
        </div>
        <p className="text-xs font-bold text-gold">NIFTY 50</p>
        <p className="text-xl font-black text-slate-100 tabular-nums">24,580.00</p>
        <p className="text-xs font-bold text-emerald-400 flex items-center gap-0.5">
          <ArrowUpRight className="w-3 h-3" /> +102.40 (+0.42%)
        </p>
        <MiniSpark up />
      </motion.div>

      {/* BANKNIFTY */}
      <motion.div
        className="auth-trade-card auth-trade-card--bn"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <p className="text-[9px] font-bold text-slate-500 uppercase">BANKNIFTY</p>
        <p className="text-lg font-bold text-slate-100 tabular-nums">52,140.00</p>
        <p className="text-[11px] font-bold text-emerald-400">+0.38%</p>
      </motion.div>

      {/* Signal */}
      <motion.div
        className="auth-trade-card auth-trade-card--signal"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.45 }}
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          <div>
            <p className="text-[9px] text-slate-500 font-bold uppercase">AI Signal</p>
            <p className="text-sm font-black text-emerald-400 animate-pulse">STRONG BUY</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5">VWAP · OI ↑ · EMA9&gt;20 · Vol spike</p>
      </motion.div>

      {/* Option chain mini */}
      <motion.div
        className="auth-trade-card auth-trade-card--chain"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Layers className="w-3.5 h-3.5 text-gold" />
          <span className="text-[9px] font-bold text-gold uppercase tracking-wider">Option Chain</span>
        </div>
        <table className="w-full text-[9px]">
          <thead>
            <tr className="text-slate-600">
              <th className="text-left font-medium pb-1">Strike</th>
              <th className="text-right font-medium pb-1">CE</th>
              <th className="text-right font-medium pb-1">PE</th>
            </tr>
          </thead>
          <tbody className="text-slate-300">
            {[
              { s: 24500, ce: 182, pe: 94 },
              { s: 24550, ce: 148, pe: 118, atm: true },
              { s: 24600, ce: 112, pe: 156 },
            ].map((r) => (
              <tr key={r.s} className={r.atm ? 'bg-gold/10' : ''}>
                <td className="py-0.5 font-mono">{r.s}</td>
                <td className="text-right text-emerald-400 tabular-nums">{r.ce}</td>
                <td className="text-right text-red-400 tabular-nums">{r.pe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      {/* OI Buildup */}
      <motion.div
        className="auth-trade-card auth-trade-card--oi"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[9px] font-bold text-slate-400 uppercase">AI Intelligence</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="auth-oi-pill auth-oi-pill--long">Long Buildup</span>
          <span className="auth-oi-pill auth-oi-pill--cover">Short Cover</span>
        </div>
        <p className="text-[10px] text-slate-500 mt-2">PCR 0.92 · Max Pain 24,500</p>
      </motion.div>

      {/* Scalp / RR */}
      <motion.div
        className="auth-trade-card auth-trade-card--scalp"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Target className="w-3.5 h-3.5 text-gold" />
          <span className="text-[9px] font-bold text-gold uppercase">LPT Master</span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center text-[9px]">
          <div>
            <p className="text-slate-600">SL</p>
            <p className="font-bold text-red-400">24,420</p>
          </div>
          <div>
            <p className="text-slate-600">Entry</p>
            <p className="font-bold text-slate-200">24,580</p>
          </div>
          <div>
            <p className="text-slate-600">T1</p>
            <p className="font-bold text-emerald-400">24,780</p>
          </div>
        </div>
        <p className="text-[10px] text-gold font-bold mt-1.5 text-center">RR 1 : 2.4 · Qty 50</p>
      </motion.div>

      {/* Paper / Journal hint */}
      <motion.div
        className="auth-trade-card auth-trade-card--flow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <Crosshair className="w-3.5 h-3.5 text-gold" />
          <span>
            Journal · Indicators · Master AI
          </span>
        </div>
        <div className="flex gap-2 mt-2 text-[9px]">
          <span className="text-emerald-400 flex items-center gap-0.5">
            <ArrowUpRight className="w-3 h-3" /> CE +₹12.4k
          </span>
          <span className="text-red-400 flex items-center gap-0.5">
            <ArrowDownRight className="w-3 h-3" /> PE -₹2.1k
          </span>
        </div>
      </motion.div>
    </div>
  );
}
