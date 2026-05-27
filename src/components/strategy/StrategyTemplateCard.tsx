import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { buildPayoffSvgPaths, PAYOFF_CHART } from './payoffSvgUtils';
import { OUTLOOK_COLORS, type StrategyVisual } from './strategyVisuals';

interface StrategyTemplateCardProps {
  visual: StrategyVisual;
  selected?: boolean;
  onSelect: () => void;
  index?: number;
}

export function StrategyPayoffSvg({ visual, className = '' }: { visual: StrategyVisual; className?: string }) {
  const paths = useMemo(() => buildPayoffSvgPaths(visual.payoffPoints), [visual.payoffPoints]);
  const uid = visual.id;
  const z = PAYOFF_CHART.zeroY;

  return (
    <svg viewBox="0 0 100 50" className={`w-full h-full ${className}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`p-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={`l-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdba74" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.8" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="100" height={z} fill="#dcfce7" fillOpacity="0.55" />
      <rect x="0" y={z} width="100" height={50 - z} fill="#ffedd5" fillOpacity="0.5" />

      <line x1="0" y1={z} x2="100" y2={z} stroke="#cbd5e1" strokeWidth="0.8" />

      {visual.atmX != null && (
        <line x1={visual.atmX} y1="1" x2={visual.atmX} y2="49" stroke="#94a3b8" strokeWidth="0.9" strokeDasharray="2.5 2" />
      )}

      {paths.lossFill && <path d={paths.lossFill} fill={`url(#l-fill-${uid})`} />}
      {paths.profitFill && <path d={paths.profitFill} fill={`url(#p-fill-${uid})`} />}

      {paths.lossStroke && (
        <path d={paths.lossStroke} fill="none" stroke="#ea580c" strokeWidth="1.8" strokeLinejoin="round" />
      )}
      {paths.profitStroke && (
        <path d={paths.profitStroke} fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinejoin="round" />
      )}

      <path
        d={paths.fullPath}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function StrategyTemplateCard({ visual, selected, onSelect, index = 0 }: StrategyTemplateCardProps) {
  const colors = OUTLOOK_COLORS[visual.outlook];
  const legCount = visual.legsDisplay.length;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`group text-left rounded-xl border transition-all duration-200 overflow-hidden flex flex-col w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
        selected
          ? 'border-gold bg-gold/10 ring-2 ring-gold/35 shadow-lg shadow-gold/15'
          : 'border-dark-border bg-dark-elevated hover:border-gold/45 hover:shadow-md hover:shadow-black/20'
      }`}
    >
      <div className="relative h-[104px] bg-gradient-to-b from-slate-50 to-slate-100 border-b border-slate-200/80">
        <StrategyPayoffSvg visual={visual} />
        <span
          className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
        >
          {visual.outlookLabel}
        </span>
        <span className="absolute bottom-1.5 left-1.5 px-1 py-0.5 rounded text-[8px] font-semibold bg-slate-900/70 text-slate-200">
          {legCount} leg{legCount !== 1 ? 's' : ''}
        </span>
        {selected && (
          <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-gold flex items-center justify-center shadow-md">
            <Check className="w-3 h-3 text-dark-surface" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="p-2.5 flex-1 flex flex-col gap-1.5 bg-dark-elevated">
        <div>
          <h4 className={`text-xs font-bold leading-tight truncate ${selected ? 'text-gold' : 'text-slate-100'}`}>
            {visual.name}
          </h4>
          <p className="text-[9px] text-dark-muted mt-0.5 line-clamp-2 leading-snug">{visual.description}</p>
        </div>

        <div className="flex flex-wrap gap-1 mt-auto pt-0.5">
          {visual.legsDisplay.map((leg, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold border ${
                leg.action === 'BUY'
                  ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/12 border-red-500/30 text-red-400'
              }`}
            >
              <span>{leg.action === 'BUY' ? '+' : '−'}</span>
              <span className={leg.type === 'CE' ? 'text-red-300' : 'text-emerald-300'}>{leg.type}</span>
              <span className="text-slate-500 font-medium">{leg.strike}</span>
            </span>
          ))}
        </div>
      </div>
    </motion.button>
  );
}
