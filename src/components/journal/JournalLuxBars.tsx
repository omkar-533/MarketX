import { motion } from 'framer-motion';

export type LuxBarPoint = {
  label: string;
  value: number;
  meta?: string;
};

type Props = {
  eyebrow: string;
  title: string;
  data: LuxBarPoint[];
  formatValue?: (n: number) => string;
  mode?: 'pnl' | 'count';
  emptyHint?: string;
};

/** Generic 3D perspective bars for strategy / risk / instruments. */
export default function JournalLuxBars({
  eyebrow,
  title,
  data,
  formatValue = (n) => String(Math.round(n)),
  mode = 'pnl',
  emptyHint = 'Waiting for data',
}: Props) {
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const hasData = data.some((d) => d.value !== 0 || Boolean(d.meta));
  const cols = Math.min(Math.max(data.length, 3), 8);

  return (
    <div className="tj-chart">
      <div className="tj-chart__head">
        <div>
          <p className="tj-chart__eyebrow">{eyebrow}</p>
          <h3 className="tj-chart__title">{title}</h3>
        </div>
        {!hasData ? <span className="tj-chart__hint">{emptyHint}</span> : null}
      </div>

      <div className="tj-bars-stage tj-bars-stage--flex">
        <div className="tj-bars-stage__grid" aria-hidden />
        <div className="tj-bars-stage__glow" aria-hidden />
        <div
          className="tj-bars"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          role="img"
          aria-label={title}
        >
          {data.map((d, i) => {
            const h = Math.max(10, (Math.abs(d.value) / maxAbs) * 100);
            const up = mode === 'count' ? true : d.value >= 0;
            const flat = !hasData;
            return (
              <motion.div
                key={d.label}
                className="tj-bar"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 + i * 0.06, type: 'spring', stiffness: 340, damping: 24 }}
              >
                <div className="tj-bar__value">
                  {hasData ? (
                    <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                      {mode === 'pnl' && d.value > 0 ? '+' : ''}
                      {formatValue(d.value)}
                    </span>
                  ) : (
                    <span className="text-slate-600">·</span>
                  )}
                </div>
                <div className="tj-bar__column">
                  <motion.div
                    className={`tj-bar__block ${up ? 'tj-bar__block--up' : 'tj-bar__block--down'} ${
                      mode === 'count' ? 'tj-bar__block--gold' : ''
                    } ${flat ? 'tj-bar__block--ghost' : ''}`}
                    style={{ height: `${flat ? 16 : h}%` }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.12 + i * 0.06, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -3, filter: 'brightness(1.12)' }}
                  >
                    <span className="tj-bar__face tj-bar__face--front" />
                    <span className="tj-bar__face tj-bar__face--top" />
                    <span className="tj-bar__face tj-bar__face--side" />
                    <span className="tj-bar__shine" />
                  </motion.div>
                </div>
                <span className="tj-bar__label" title={d.label}>
                  {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
                </span>
                {d.meta ? <span className="tj-bar__meta">{d.meta}</span> : null}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
