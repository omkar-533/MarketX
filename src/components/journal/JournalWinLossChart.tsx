import { motion } from 'framer-motion';

type Props = {
  wins: number;
  losses: number;
};

/** Premium animated win/loss donut with depth + glow (no Three.js). */
export default function JournalWinLossChart({ wins, losses }: Props) {
  const total = Math.max(wins + losses, 0);
  const empty = total === 0;
  const w = empty ? 1 : wins;
  const l = empty ? 1 : losses;
  const sum = w + l;
  const winPct = (w / sum) * 100;
  const lossPct = (l / sum) * 100;

  const r = 54;
  const c = 2 * Math.PI * r;
  const winLen = (winPct / 100) * c;
  const lossLen = (lossPct / 100) * c;

  return (
    <div className="tj-chart">
      <div className="tj-chart__head">
        <div>
          <p className="tj-chart__eyebrow">Distribution</p>
          <h3 className="tj-chart__title">Win / Loss</h3>
        </div>
        <div className="tj-chart__legend">
          <span className="tj-chart__pill tj-chart__pill--win">{empty ? '—' : `${wins}W`}</span>
          <span className="tj-chart__pill tj-chart__pill--loss">{empty ? '—' : `${losses}L`}</span>
        </div>
      </div>

      <div className="tj-donut-stage">
        <div className="tj-donut-stage__floor" aria-hidden />
        <div className="tj-donut-stage__glow" aria-hidden />
        <motion.div
          className="tj-donut"
          initial={{ opacity: 0, rotateX: 28, scale: 0.86 }}
          animate={{ opacity: 1, rotateX: 18, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        >
          <svg viewBox="0 0 140 140" className="tj-donut__svg">
            <defs>
              <linearGradient id="tjWinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6ee7b7" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="tjLossGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#be123c" />
              </linearGradient>
              <filter id="tjDonutGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
            <motion.circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="url(#tjWinGrad)"
              strokeWidth="16"
              strokeLinecap="round"
              filter="url(#tjDonutGlow)"
              strokeDasharray={`${winLen} ${c}`}
              transform="rotate(-90 70 70)"
              initial={{ strokeDasharray: `0 ${c}` }}
              animate={{ strokeDasharray: `${winLen} ${c}` }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="url(#tjLossGrad)"
              strokeWidth="16"
              strokeLinecap="round"
              filter="url(#tjDonutGlow)"
              strokeDasharray={`${lossLen} ${c}`}
              strokeDashoffset={-winLen}
              transform="rotate(-90 70 70)"
              initial={{ strokeDasharray: `0 ${c}` }}
              animate={{ strokeDasharray: `${lossLen} ${c}` }}
              transition={{ duration: 1.1, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="tj-donut__core">
            <motion.span
              className="tj-donut__pct"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              {empty ? '0%' : `${((wins / total) * 100).toFixed(0)}%`}
            </motion.span>
            <span className="tj-donut__label">{empty ? 'No data' : 'Win rate'}</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
