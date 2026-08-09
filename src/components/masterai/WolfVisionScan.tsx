import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

const STAGES = [
  { id: 'structure', label: 'Chart structure', ms: 0 },
  { id: 'levels', label: 'Key levels', ms: 900 },
  { id: 'liquidity', label: 'Liquidity', ms: 1800 },
  { id: 'pa', label: 'Price action', ms: 2700 },
  { id: 'setup', label: 'Setup detection', ms: 3600 },
] as const;

type WolfVisionScanProps = {
  active: boolean;
  hindi?: boolean;
};

/** Pipeline scan UI — stages advance with time while the real request is in flight. */
export default function WolfVisionScan({ active, hindi }: WolfVisionScanProps) {
  const [doneUntil, setDoneUntil] = useState(0);

  useEffect(() => {
    if (!active) {
      setDoneUntil(0);
      return;
    }
    setDoneUntil(0);
    const timers = STAGES.map((s, i) =>
      window.setTimeout(() => setDoneUntil(i + 1), s.ms + 400),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active]);

  if (!active) return null;

  return (
    <motion.div
      className="wolf-vision-scan"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
    >
      <div className="wolf-vision-scan__head">
        <span className="wolf-vision-scan__mark" aria-hidden>
          🐺
        </span>
        <div>
          <div className="wolf-vision-scan__title">WOLF VISION</div>
          <div className="wolf-vision-scan__sub">
            {hindi ? 'Chart scan chal raha hai…' : 'Scanning your chart…'}
          </div>
        </div>
      </div>
      <div className="wolf-vision-scan__beam" aria-hidden />
      <ul className="wolf-vision-scan__stages">
        {STAGES.map((s, i) => {
          const done = i < doneUntil;
          const current = i === doneUntil;
          return (
            <li
              key={s.id}
              className={`wolf-vision-scan__stage ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}
            >
              <span className="wolf-vision-scan__stage-icon" aria-hidden>
                {done ? <Check className="h-3.5 w-3.5" /> : current ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              </span>
              <span>{s.label}</span>
              <span className="wolf-vision-scan__stage-state">
                {done ? '✓' : current ? '…' : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}
