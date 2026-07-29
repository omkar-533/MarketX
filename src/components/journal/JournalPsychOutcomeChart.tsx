import { motion } from 'framer-motion';
import type { ConfidenceBucket, PsychTrendPoint } from '../../services/journalPsychAnalytics';

type Props = {
  buckets: ConfidenceBucket[];
  trend: PsychTrendPoint[];
  formatPnl?: (n: number) => string;
};

/** Confidence buckets + psych timeline — mind vs money. */
export default function JournalPsychOutcomeChart({
  buckets,
  trend,
  formatPnl = (n) => n.toFixed(0),
}: Props) {
  const maxAbs = Math.max(...trend.map((t) => Math.abs(t.pnl)), 1);
  const hasBuckets = buckets.some((b) => b.trades > 0);
  const hasTrend = trend.length > 0;

  return (
    <div className="tj-chart">
      <div className="tj-chart__head">
        <div>
          <p className="tj-chart__eyebrow">Mind × Money</p>
          <h3 className="tj-chart__title">Confidence vs Outcome</h3>
        </div>
      </div>

      <div className="tj-psych-out">
        <div className="tj-psych-out__buckets">
          {buckets.map((b, i) => (
            <motion.div
              key={b.label}
              className="tj-psych-out__card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
            >
              <span className="tj-psych-out__tier">{b.label}</span>
              <strong className="tj-psych-out__wr">
                {hasBuckets && b.trades ? `${b.winRate}%` : '—'}
              </strong>
              <span className="tj-psych-out__meta">
                {b.trades ? `${b.trades} trades · avg ${formatPnl(b.avgPnl)}` : 'No logs'}
              </span>
              <div className="tj-psych-out__meter">
                <motion.span
                  style={{ width: `${hasBuckets && b.trades ? b.winRate : 8}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.7 }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="tj-psych-out__timeline">
          <p className="tj-psych-out__tl-label">Recent psych pulse</p>
          <div
            className="tj-psych-out__spark"
            style={{ gridTemplateColumns: `repeat(${Math.max(hasTrend ? trend.length : 6, 4)}, minmax(0, 1fr))` }}
          >
            {(hasTrend ? trend : Array.from({ length: 6 }, (_, i) => ({
              label: `T${i + 1}`,
              confidence: 0,
              discipline: 0,
              fearGreed: 0,
              pnl: 0,
            }))).map((p, i) => {
              const h = hasTrend ? Math.max(10, (Math.abs(p.pnl) / maxAbs) * 100) : 14;
              const up = p.pnl >= 0;
              return (
                <motion.div
                  key={`${p.label}-${i}`}
                  className="tj-psych-out__col"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.04 }}
                  title={`Conf ${p.confidence} · Disc ${p.discipline} · F/G ${p.fearGreed}`}
                >
                  <motion.div
                    className={`tj-psych-out__stick ${up ? 'is-up' : 'is-down'} ${!hasTrend ? 'is-ghost' : ''}`}
                    style={{ height: `${h}%` }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.15 + i * 0.04, duration: 0.55 }}
                  />
                  <span>{p.label}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
