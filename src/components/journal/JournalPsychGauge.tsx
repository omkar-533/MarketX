import { motion } from 'framer-motion';

type Props = {
  label: string;
  value: number;
  hint?: string;
  tone?: 'gold' | 'emerald' | 'rose' | 'amber';
  delay?: number;
};

const TONE = {
  gold: { stroke: '#d4af37', glow: 'rgba(212,175,55,0.35)', text: '#f0d78c' },
  emerald: { stroke: '#34d399', glow: 'rgba(52,211,153,0.3)', text: '#6ee7b7' },
  rose: { stroke: '#fb7185', glow: 'rgba(251,113,133,0.28)', text: '#fda4af' },
  amber: { stroke: '#fbbf24', glow: 'rgba(251,191,36,0.3)', text: '#fcd34d' },
};

/** Compact 3D-tilted radial gauge for psychology scores. */
export default function JournalPsychGauge({
  label,
  value,
  hint,
  tone = 'gold',
  delay = 0,
}: Props) {
  const v = Math.max(0, Math.min(100, value));
  const r = 36;
  const c = 2 * Math.PI * r;
  const len = (v / 100) * c;
  const colors = TONE[tone];

  return (
    <motion.div
      className="tj-pg"
      initial={{ opacity: 0, y: 14, rotateX: 20 }}
      animate={{ opacity: 1, y: 0, rotateX: 12 }}
      transition={{ delay, type: 'spring', stiffness: 280, damping: 22 }}
    >
      <div className="tj-pg__ring-wrap">
        <div className="tj-pg__glow" style={{ background: `radial-gradient(circle, ${colors.glow}, transparent 70%)` }} />
        <svg viewBox="0 0 100 100" className="tj-pg__svg">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
          <motion.circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${len} ${c}`}
            transform="rotate(-90 50 50)"
            initial={{ strokeDasharray: `0 ${c}` }}
            animate={{ strokeDasharray: `${len} ${c}` }}
            transition={{ duration: 1, delay: delay + 0.15, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="tj-pg__core">
          <span className="tj-pg__val" style={{ color: colors.text }}>{Math.round(v)}</span>
        </div>
      </div>
      <p className="tj-pg__label">{label}</p>
      {hint ? <p className="tj-pg__hint">{hint}</p> : null}
    </motion.div>
  );
}
