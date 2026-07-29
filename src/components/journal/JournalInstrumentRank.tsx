import { motion } from 'framer-motion';

type Item = { instrument: string; pnl: number };

type Props = {
  data: Item[];
  formatValue: (n: number) => string;
};

/** Dense animated instrument P&L ranking — fills empty space. */
export default function JournalInstrumentRank({ data, formatValue }: Props) {
  const sorted = [...data].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 8);
  const maxAbs = Math.max(...sorted.map((d) => Math.abs(d.pnl)), 1);
  const empty = !sorted.length;

  const rows = empty
    ? Array.from({ length: 5 }, (_, i) => ({ instrument: `— ${i + 1}`, pnl: 0 }))
    : sorted;

  return (
    <div className="tj-chart">
      <div className="tj-chart__head">
        <div>
          <p className="tj-chart__eyebrow">Book</p>
          <h3 className="tj-chart__title">P&L by Instrument</h3>
        </div>
        {empty ? <span className="tj-chart__hint">No instruments yet</span> : null}
      </div>

      <div className="tj-rank">
        {rows.map((item, i) => {
          const w = empty ? 8 : Math.max(6, (Math.abs(item.pnl) / maxAbs) * 100);
          const up = item.pnl >= 0;
          return (
            <motion.div
              key={`${item.instrument}-${i}`}
              className="tj-rank__row"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: empty ? 0.35 : 1, x: 0 }}
              transition={{ delay: 0.04 + i * 0.04 }}
            >
              <span className="tj-rank__idx">{String(i + 1).padStart(2, '0')}</span>
              <div className="tj-rank__body">
                <div className="tj-rank__top">
                  <span className="tj-rank__name">{item.instrument}</span>
                  <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                    {empty ? '—' : formatValue(item.pnl)}
                  </span>
                </div>
                <div className="tj-rank__track">
                  <motion.span
                    className={up ? 'is-up' : 'is-down'}
                    style={{ width: `${w}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.1 + i * 0.05, duration: 0.55 }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
