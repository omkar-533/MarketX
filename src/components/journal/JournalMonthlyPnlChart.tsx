import { motion } from 'framer-motion';

type MonthPoint = { label: string; pnl: number; trades?: number };

type Props = {
  data: MonthPoint[];
  formatValue?: (n: number) => string;
};

/** Premium 3D-perspective monthly P&L bars. */
export default function JournalMonthlyPnlChart({
  data,
  formatValue = (n) => n.toFixed(0),
}: Props) {
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  const hasData = data.some((d) => d.pnl !== 0 || (d.trades ?? 0) > 0);

  return (
    <div className="tj-chart">
      <div className="tj-chart__head">
        <div>
          <p className="tj-chart__eyebrow">Performance</p>
          <h3 className="tj-chart__title">Monthly P&L</h3>
        </div>
        {!hasData ? <span className="tj-chart__hint">Waiting for logs</span> : null}
      </div>

      <div className="tj-bars-stage">
        <div className="tj-bars-stage__grid" aria-hidden />
        <div className="tj-bars-stage__glow" aria-hidden />
        <div className="tj-bars" role="img" aria-label="Monthly profit and loss">
          {data.map((d, i) => {
            const h = Math.max(8, (Math.abs(d.pnl) / maxAbs) * 100);
            const up = d.pnl >= 0;
            const flat = d.pnl === 0 && !hasData;
            return (
              <motion.div
                key={d.label}
                className="tj-bar"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.07, type: 'spring', stiffness: 360, damping: 24 }}
              >
                <div className="tj-bar__value">
                  {hasData && d.pnl !== 0 ? (
                    <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                      {up ? '+' : ''}
                      {formatValue(d.pnl)}
                    </span>
                  ) : (
                    <span className="text-slate-600">·</span>
                  )}
                </div>
                <div className="tj-bar__column">
                  <motion.div
                    className={`tj-bar__block ${up ? 'tj-bar__block--up' : 'tj-bar__block--down'} ${flat ? 'tj-bar__block--ghost' : ''}`}
                    style={{ height: `${flat ? 18 : h}%` }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.15 + i * 0.07, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -4, filter: 'brightness(1.15)' }}
                  >
                    <span className="tj-bar__face tj-bar__face--front" />
                    <span className="tj-bar__face tj-bar__face--top" />
                    <span className="tj-bar__face tj-bar__face--side" />
                    <span className="tj-bar__shine" />
                  </motion.div>
                </div>
                <span className="tj-bar__label">{d.label}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
