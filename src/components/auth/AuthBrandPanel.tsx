import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Shield,
  Zap,
  Users,
  Activity,
  Award,
  Crown,
  Layers,
  ScanLine,
} from 'lucide-react';

const features = [
  { icon: Layers, text: 'Live option chain & OI' },
  { icon: ScanLine, text: 'Screeners & Master TX' },
  { icon: BarChart3, text: 'Pro charts & footprint' },
  { icon: Zap, text: 'Master AI insights' },
];

const stats = [
  { label: 'Active traders', value: '12K+', icon: Users },
  { label: 'Daily scans', value: '2.4M', icon: Activity },
];

const chartPoints = [42, 48, 45, 52, 58, 55, 62, 68, 64, 72, 78, 75, 82, 88, 85, 92];

function MiniChart() {
  const w = 300;
  const h = 72;
  const max = Math.max(...chartPoints);
  const min = Math.min(...chartPoints);
  const range = max - min || 1;
  const coords = chartPoints.map((p, i) => {
    const x = (i / (chartPoints.length - 1)) * w;
    const y = h - ((p - min) / range) * (h - 8) - 4;
    return `${x},${y}`;
  });
  const line = coords.join(' ');
  const area = `${line} ${w},${h} 0,${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[72px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="authChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4af37" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#authChartFill)" />
      <motion.polyline
        points={line}
        fill="none"
        stroke="#d4af37"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

function DashboardPreview() {
  const rows = [
    { sym: 'NIFTY CE', pnl: '+₹12,400', up: true },
    { sym: 'BANKNIFTY PE', pnl: '-₹2,100', up: false },
    { sym: 'RELIANCE', pnl: '+₹4,850', up: true },
  ];

  return (
    <div className="auth-dashboard-preview mt-6 border-gold/15">
      <div className="auth-dashboard-preview-header">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Workspace</span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>
      <div className="auth-dashboard-preview-chart">
        <MiniChart />
      </div>
      <div className="auth-dashboard-preview-rows">
        {rows.map((r) => (
          <div
            key={r.sym}
            className="flex items-center justify-between py-2 border-t border-dark-border first:border-0"
          >
            <span className="text-xs font-medium text-slate-400">{r.sym}</span>
            <span className={`text-xs font-bold tabular-nums ${r.up ? 'text-emerald-400' : 'text-red-400'}`}>
              {r.pnl}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="text-[10px] font-mono text-slate-500 tabular-nums px-2 py-1 rounded-md border border-dark-border bg-dark-elevated">
      IST {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

interface AuthBrandPanelProps {
  variant?: 'page' | 'modal';
}

export default function AuthBrandPanel({ variant = 'modal' }: AuthBrandPanelProps) {
  const isPage = variant === 'page';

  return (
    <div
      className={`auth-brand-panel relative flex-col justify-between overflow-hidden border-dark-border ${
        isPage ? 'hidden lg:flex p-8 xl:p-10 border-r' : 'hidden lg:flex p-8 border-r'
      }`}
    >
      <div className="auth-grid-bg absolute inset-0 opacity-40 pointer-events-none" />
      <div className="auth-aurora-side absolute inset-0 pointer-events-none" />

      <div className="relative z-10 flex-1">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-gold/25">
              <Crown className="w-5 h-5 text-dark-surface" />
            </div>
            <div>
              <p className="text-sm font-bold text-gold leading-none">Master</p>
              <p className="text-[9px] text-slate-500 font-bold tracking-wider -mt-0.5">TradeX</p>
              <p className="text-[11px] text-slate-500 mt-1">Options trading platform</p>
            </div>
          </div>
          <LiveClock />
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="auth-kicker">
            <Award className="w-3 h-3" />
            Trusted by 12,000+ traders
          </div>
          <h2 className="text-2xl xl:text-[1.75rem] font-bold text-slate-50 leading-tight tracking-tight">
            Execute with <span className="text-gold">clarity.</span>
            <br />
            Improve with <span className="text-gold">data.</span>
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed mt-3 max-w-sm">
            Same workspace you use after login — live OI, screeners, journal, and TradeX live market data.
          </p>
        </motion.div>

        <DashboardPreview />

        <div className="grid grid-cols-2 gap-3 mt-5">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="auth-stat-card border-gold/10">
              <Icon className="w-3.5 h-3.5 text-gold mb-1.5" />
              <p className="text-lg font-bold text-slate-100 tabular-nums">{value}</p>
              <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-5">
          {features.map(({ icon: Icon, text }, i) => (
            <motion.div
              key={text}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.04 }}
              className="auth-feature-tile flex items-center gap-2.5"
            >
              <span className="auth-feature-icon shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="text-[12px] font-medium text-slate-400 leading-snug">{text}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 mt-8 pt-6 border-t border-dark-border">
        <span className="auth-trust-badge">
          <Shield className="w-3 h-3 text-emerald-500" />
          256-bit TLS
        </span>
        <span className="auth-trust-badge">TradeX live feed</span>
        <span className="auth-trust-badge">NSE · BSE</span>
      </div>
    </div>
  );
}
