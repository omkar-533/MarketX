import { useEffect, useState } from 'react';

const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'] as const;

export type TerminalBottomBarProps = {
  activeRange?: string;
  onRangeChange?: (range: string) => void;
  logScale?: boolean;
  onToggleLog?: () => void;
};

function formatClock(d: Date) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function isRthNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = get('weekday');
  if (day === 'Sat' || day === 'Sun') return false;
  const mins = Number(get('hour')) * 60 + Number(get('minute'));
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export default function TerminalBottomBar({
  activeRange = '1D',
  onRangeChange,
  logScale = false,
  onToggleLog,
}: TerminalBottomBarProps) {
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [rth, setRth] = useState(() => isRthNow());

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(formatClock(new Date()));
      setRth(isRthNow());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <footer className="wolf-term__bottom">
      <div className="wolf-term__bottom-tabs">
        <button type="button" disabled>
          Screener
        </button>
        <button type="button" disabled>
          WolfScript
        </button>
        <button type="button" disabled>
          Strategy Tester
        </button>
        <button type="button" disabled>
          Trading Panel
        </button>
      </div>

      <div className="wolf-term__ranges" role="group" aria-label="Visible range">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={r === activeRange ? 'on' : ''}
            onClick={() => onRangeChange?.(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="wolf-term__bottom-right">
        <span className="wolf-term__clock">
          {clock} UTC+5:30{' '}
          <em className={rth ? 'live' : ''}>{rth ? 'RTH' : 'CLOSED'}</em>
        </span>
        <button
          type="button"
          className={`wolf-term__scale-btn ${logScale ? 'on' : ''}`}
          onClick={onToggleLog}
          title="Log scale"
        >
          log
        </button>
        <button type="button" className="wolf-term__scale-btn on" title="Auto scale" disabled>
          auto
        </button>
      </div>
    </footer>
  );
}
