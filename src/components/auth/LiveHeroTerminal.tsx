import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

type Candle = { o: number; h: number; l: number; c: number };

const COUNT = 46;
const TICK_MS = 400;
/** Ticks before the live candle is committed and a fresh one opens. */
const TICKS_PER_CANDLE = 13;

const CHART_W = 640;
const PRICE_H = 268;
const VOL_TOP = 288;
const CHART_H = 340;

/** Synthetic index level so the ticker reads like NIFTY without claiming real data. */
const toLevel = (v: number) => 24000 + (v - 100) * 12;

function nextCandle(prev: number): Candle {
  const o = prev;
  const c = o + 0.2 + (Math.random() - 0.5) * 3.4;
  return {
    o,
    c,
    h: Math.max(o, c) + Math.random() * 1.3,
    l: Math.min(o, c) - Math.random() * 1.3,
  };
}

function seedSeries(): Candle[] {
  const out: Candle[] = [];
  let p = 100;
  for (let i = 0; i < COUNT; i += 1) {
    const k = nextCandle(p);
    out.push(k);
    p = k.c;
  }
  return out;
}

function seedLadder() {
  return Array.from({ length: 7 }, () => ({
    ce: 30 + Math.random() * 65,
    pe: 30 + Math.random() * 65,
  }));
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => {
    out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k));
  });
  return out;
}

const AI_THREAD = [
  {
    q: "What's the NIFTY bias right now?",
    a: 'Bullish while 24,380 holds — price is above VWAP and CE writers are unwinding at 24,500.',
  },
  {
    q: 'Where is max pain sitting?',
    a: 'At 24,400. PE writers added 18% OI there, so it stays the magnet into expiry.',
  },
  {
    q: 'Any breakout scans firing?',
    a: '3 hits — RELIANCE, ICICIBANK and TATAMOTORS are clearing 20-day highs on rising volume.',
  },
  {
    q: 'How is my journal trending?',
    a: 'Win rate 61% over 28 trades. Your losses cluster in the first 15 minutes of the open.',
  },
] as const;

const Q_CHAR_MS = 34;
const A_CHAR_MS = 16;
const THINK_MS = 620;
const HOLD_MS = 2100;

type ChatPhase = 'question' | 'thinking' | 'answer' | 'hold';

/** Types a question, pauses, then streams the answer — cycles the whole thread. */
function MasterAiChat({ running }: { running: boolean }) {
  const [pair, setPair] = useState(0);
  const [phase, setPhase] = useState<ChatPhase>('question');
  const [chars, setChars] = useState(0);
  const threadRef = useRef<HTMLDivElement>(null);

  const item = AI_THREAD[pair % AI_THREAD.length];

  useEffect(() => {
    if (!running) return;

    let timer: number;

    if (phase === 'question') {
      if (chars < item.q.length) {
        timer = window.setTimeout(() => setChars((c) => c + 1), Q_CHAR_MS);
      } else {
        timer = window.setTimeout(() => setPhase('thinking'), 260);
      }
    } else if (phase === 'thinking') {
      timer = window.setTimeout(() => {
        setChars(0);
        setPhase('answer');
      }, THINK_MS);
    } else if (phase === 'answer') {
      if (chars < item.a.length) {
        timer = window.setTimeout(() => setChars((c) => c + 1), A_CHAR_MS);
      } else {
        timer = window.setTimeout(() => setPhase('hold'), HOLD_MS);
      }
    } else {
      timer = window.setTimeout(() => {
        setPair((p) => p + 1);
        setChars(0);
        setPhase('question');
      }, 320);
    }

    return () => window.clearTimeout(timer);
  }, [running, phase, chars, item]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chars, phase]);

  const showAnswer = phase === 'answer' || phase === 'hold';

  return (
    <div className="hero-ai">
      <p className="hero-ai__head">
        <Sparkles className="w-3.5 h-3.5" aria-hidden />
        Wolf AI
        <span>· live market context</span>
      </p>

      <div className="hero-ai__thread" ref={threadRef}>
        <div className="hero-ai__msg is-user">
          {phase === 'question' ? item.q.slice(0, chars) : item.q}
          {phase === 'question' && <i className="hero-ai__caret" />}
        </div>

        {phase === 'thinking' && (
          <div className="hero-ai__msg is-ai is-thinking">
            <i />
            <i />
            <i />
          </div>
        )}

        {showAnswer && (
          <div className="hero-ai__msg is-ai">
            {phase === 'answer' ? item.a.slice(0, chars) : item.a}
            {phase === 'answer' && <i className="hero-ai__caret" />}
          </div>
        )}
      </div>

      <div className="hero-ai__input">
        <span>Ask Wolf AI anything…</span>
        <i className="hero-ai__send" />
      </div>
    </div>
  );
}

/**
 * Animated stand-in for the product UI: streaming candles, a Wolf AI thread and
 * an option ladder. Pauses when offscreen or hidden so it costs nothing idle.
 */
export default function LiveHeroTerminal() {
  const [series, setSeries] = useState<Candle[]>(seedSeries);
  const [ladder, setLadder] = useState(seedLadder);
  const [pcr, setPcr] = useState(1.18);
  const [running, setRunning] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let onScreen = false;
    let tabVisible = !document.hidden;
    const sync = () => setRunning(onScreen && tabVisible);

    const onVisibility = () => {
      tabVisible = !document.hidden;
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.05 },
    );
    if (hostRef.current) observer.observe(hostRef.current);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => {
      tickRef.current += 1;
      const commit = tickRef.current % TICKS_PER_CANDLE === 0;

      setSeries((prev) => {
        const next = prev.slice();
        const live = { ...next[next.length - 1] };
        live.c += (Math.random() - 0.48) * 1.5;
        live.h = Math.max(live.h, live.c);
        live.l = Math.min(live.l, live.c);
        next[next.length - 1] = live;
        if (commit) {
          next.shift();
          next.push(nextCandle(live.c));
        }
        return next;
      });

      if (commit) {
        setLadder((prev) =>
          prev.map((row) => ({
            ce: Math.min(98, Math.max(22, row.ce + (Math.random() - 0.5) * 26)),
            pe: Math.min(98, Math.max(22, row.pe + (Math.random() - 0.5) * 26)),
          })),
        );
        setPcr((p) => Math.min(1.62, Math.max(0.78, p + (Math.random() - 0.5) * 0.16)));
      }
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [running]);

  const view = useMemo(() => {
    const max = Math.max(...series.map((c) => c.h));
    const min = Math.min(...series.map((c) => c.l));
    const span = Math.max(max - min, 1);
    const y = (v: number) => 10 + ((max - v) / span) * (PRICE_H - 20);
    const step = CHART_W / series.length;

    const closes = series.map((c) => c.c);
    const trendPath = ema(closes, 9)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i + 0.5) * step},${y(v)}`)
      .join(' ');
    const closePath = closes
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i + 0.5) * step},${y(v)}`)
      .join(' ');

    const last = series[series.length - 1];
    const first = series[0];
    const level = toLevel(last.c);

    return {
      step,
      bodyW: step * 0.56,
      y,
      trendPath,
      areaPath: `${closePath} L${CHART_W},${PRICE_H} L0,${PRICE_H} Z`,
      volMax: Math.max(...series.map((c) => c.h - c.l), 0.6),
      level,
      changePct: ((last.c - first.c) / first.c) * 100,
      lastY: y(last.c),
      atm: Math.round(level / 50) * 50,
    };
  }, [series]);

  const up = view.changePct >= 0;
  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="hero-term" ref={hostRef} aria-hidden="true">
      <div className="hero-term__bar">
        <span className="hero-term__chip">NIFTY 50</span>
        <span className={`hero-term__ltp ${up ? 'is-up' : 'is-down'}`}>{fmt(view.level)}</span>
        <span className={`hero-term__chg ${up ? 'is-up' : 'is-down'}`}>
          {up ? '▲' : '▼'} {Math.abs(view.changePct).toFixed(2)}%
        </span>
        <span className="hero-term__live">
          <i />
          LIVE
        </span>
      </div>

      <div className="hero-term__body">
        <div className="hero-term__chart">
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" role="presentation">
            <defs>
              <linearGradient id="wtArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 1, 2, 3, 4].map((i) => (
              <line
                key={i}
                x1="0"
                x2={CHART_W}
                y1={10 + (i * (PRICE_H - 20)) / 4}
                y2={10 + (i * (PRICE_H - 20)) / 4}
                stroke="rgba(255,255,255,0.055)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path d={view.areaPath} fill="url(#wtArea)" />

            {series.map((c, i) => {
              const x = (i + 0.5) * view.step;
              const rising = c.c >= c.o;
              const color = rising ? '#2dd4bf' : '#fb7185';
              const top = view.y(Math.max(c.o, c.c));
              const bottom = view.y(Math.min(c.o, c.c));
              const volH = ((c.h - c.l) / view.volMax) * (CHART_H - VOL_TOP);
              return (
                <g key={i}>
                  <line
                    x1={x}
                    x2={x}
                    y1={view.y(c.h)}
                    y2={view.y(c.l)}
                    stroke={color}
                    strokeOpacity="0.75"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={x - view.bodyW / 2}
                    y={top}
                    width={view.bodyW}
                    height={Math.max(bottom - top, 1)}
                    fill={color}
                    fillOpacity={i === series.length - 1 ? 1 : 0.82}
                  />
                  <rect
                    x={x - view.bodyW / 2}
                    y={CHART_H - volH}
                    width={view.bodyW}
                    height={volH}
                    fill={color}
                    fillOpacity="0.3"
                  />
                </g>
              );
            })}

            <path
              d={view.trendPath}
              fill="none"
              stroke="#c9a227"
              strokeWidth="1.6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="0"
              x2={CHART_W}
              y1={view.lastY}
              y2={view.lastY}
              stroke={up ? '#2dd4bf' : '#fb7185'}
              strokeOpacity="0.5"
              strokeWidth="1"
              strokeDasharray="4 5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="hero-term__pulse" style={{ top: `${(view.lastY / CHART_H) * 100}%` }} />
        </div>

        <MasterAiChat running={running} />

        <div className="hero-term__rail">
          <p className="hero-term__rail-head">
            <span>CE OI</span>
            <span>Strike</span>
            <span>PE OI</span>
          </p>
          {ladder.map((row, i) => {
            const strike = view.atm + (3 - i) * 50;
            return (
              <div className="hero-term__row" key={strike}>
                <span className="hero-term__bar-cell">
                  <i className="hero-term__bar-fill is-ce" style={{ width: `${row.ce}%` }} />
                </span>
                <span className={`hero-term__strike ${i === 3 ? 'is-atm' : ''}`}>{strike}</span>
                <span className="hero-term__bar-cell">
                  <i className="hero-term__bar-fill is-pe" style={{ width: `${row.pe}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hero-term__foot">
        <span>
          PCR <b>{pcr.toFixed(2)}</b>
        </span>
        <span>
          Bias <b className={up ? 'is-up' : 'is-down'}>{up ? 'Bullish' : 'Cautious'}</b>
        </span>
        <span>
          Max Pain <b>{view.atm}</b>
        </span>
        <span className="hero-term__foot-ai">Wolf AI · streaming</span>
      </div>
    </div>
  );
}
