import { motion } from 'framer-motion';
import type { EmotionBucket } from '../../services/journalPsychAnalytics';

type Props = {
  title: string;
  eyebrow?: string;
  data: EmotionBucket[];
  emptyHint?: string;
};

const EMOTION_COLOR: Record<string, string> = {
  Calm: '#34d399',
  Confident: '#d4af37',
  Focused: '#60a5fa',
  Anxious: '#fbbf24',
  Fearful: '#fb7185',
  Greedy: '#c084fc',
  Frustrated: '#f97316',
  Overtrading: '#f43f5e',
};

/** Horizontal luxury emotion spectrum with 3D bar depth. */
export default function JournalEmotionSpectrum({
  title,
  eyebrow = 'Psychology',
  data,
  emptyHint = 'Log emotions on trades to unlock this map',
}: Props) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const empty = !data.length;

  return (
    <div className="tj-chart">
      <div className="tj-chart__head">
        <div>
          <p className="tj-chart__eyebrow">{eyebrow}</p>
          <h3 className="tj-chart__title">{title}</h3>
        </div>
        {empty ? <span className="tj-chart__hint">{emptyHint}</span> : null}
      </div>

      <div className="tj-emotion">
        {(empty
          ? ['Calm', 'Confident', 'Anxious', 'Fearful', 'Focused'].map((e) => ({
              emotion: e,
              count: 0,
              pnl: 0,
            }))
          : data
        ).map((d, i) => {
          const w = empty ? 12 : Math.max(8, (d.count / max) * 100);
          const color = EMOTION_COLOR[d.emotion] ?? '#d4af37';
          return (
            <motion.div
              key={d.emotion}
              className="tj-emotion__row"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 + i * 0.05 }}
            >
              <span className="tj-emotion__name">{d.emotion}</span>
              <div className="tj-emotion__track">
                <motion.div
                  className="tj-emotion__bar"
                  style={{
                    width: `${w}%`,
                    background: `linear-gradient(90deg, ${color}, ${color}88)`,
                    boxShadow: `0 0 16px ${color}44`,
                  }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.12 + i * 0.05, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="tj-emotion__shine" />
                </motion.div>
              </div>
              <span className="tj-emotion__count">{empty ? '—' : d.count}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
