import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import {
  TV_CHART_STYLES,
  TV_STUDY_PRESETS,
  TV_TIMEFRAMES,
  parseTradingViewInput,
  tradingViewSymbolLabel,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';

const TV_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';

type TvWidgetCtor = new (config: Record<string, unknown>) => unknown;

let scriptPromise: Promise<void> | null = null;

/** Load tv.js once for the whole app; every panel reuses the same promise. */
function loadTradingViewScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if ((window as unknown as { TradingView?: { widget: TvWidgetCtor } }).TradingView) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TV_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('tv.js failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = TV_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('tv.js failed'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type TradingViewChatChartProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: TvInterval) => void;
  onStudyChange: (study: string) => void;
  onClose: () => void;
};

export default function TradingViewChatChart({
  symbol,
  interval,
  study,
  onSymbolChange,
  onIntervalChange,
  onStudyChange,
  onClose,
}: TradingViewChatChartProps) {
  const { isDark } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const containerId = useRef(`tv_chat_${Math.random().toString(36).slice(2, 9)}`);
  const [chartStyle, setChartStyle] = useState<TvChartStyle>('1');
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [symbolInput, setSymbolInput] = useState(() => tradingViewSymbolLabel(symbol));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setSymbolInput(tradingViewSymbolLabel(symbol));
  }, [symbol]);

  const studies = useMemo(
    () => TV_STUDY_PRESETS.find((s) => s.id === study)?.studies ?? [],
    [study],
  );

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    loadTradingViewScript()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const TradingView = (window as unknown as { TradingView?: { widget: TvWidgetCtor } })
          .TradingView;
        if (!TradingView?.widget) {
          setStatus('error');
          return;
        }

        hostRef.current.innerHTML = '';
        const mount = document.createElement('div');
        mount.id = containerId.current;
        mount.style.height = '100%';
        mount.style.width = '100%';
        hostRef.current.appendChild(mount);

        new TradingView.widget({
          container_id: containerId.current,
          symbol,
          interval,
          theme: isDark ? 'dark' : 'light',
          style: chartStyle,
          studies,
          locale: 'in',
          timezone: 'Asia/Kolkata',
          autosize: true,
          hide_side_toolbar: true,
          allow_symbol_change: true,
          withdateranges: true,
          save_image: false,
          backgroundColor: isDark ? '#0b0e17' : '#ffffff',
          gridColor: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)',
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, interval, chartStyle, studies, isDark, reloadKey]);

  const submitSymbol = () => {
    const next = parseTradingViewInput(symbolInput);
    if (next !== symbol) onSymbolChange(next);
    else setSymbolInput(tradingViewSymbolLabel(symbol));
  };

  return (
    <section className={`mai-tv ${expanded ? 'mai-tv--tall' : ''}`} aria-label="TradingView chart">
      <header className="mai-tv__bar">
        <form
          className="mai-tv__symbol"
          onSubmit={(e) => {
            e.preventDefault();
            submitSymbol();
          }}
        >
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            onBlur={submitSymbol}
            className="mai-tv__symbol-input"
            aria-label="Chart symbol"
            spellCheck={false}
          />
        </form>

        <div className="mai-tv__tfs" role="group" aria-label="Timeframe">
          {TV_TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => onIntervalChange(tf.id)}
              className={`mai-tv__tf ${tf.id === interval ? 'mai-tv__tf--on' : ''}`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="mai-tv__selects">
          <select
            value={chartStyle}
            onChange={(e) => setChartStyle(e.target.value as TvChartStyle)}
            className="mai-tv__select"
            aria-label="Chart style"
          >
            {TV_CHART_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={study}
            onChange={(e) => onStudyChange(e.target.value)}
            className="mai-tv__select"
            aria-label="Indicator"
          >
            {TV_STUDY_PRESETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mai-tv__actions">
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mai-tv__icon"
            title="Reload chart"
            aria-label="Reload chart"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mai-tv__icon"
            title={expanded ? 'Shrink chart' : 'Expand chart'}
            aria-label={expanded ? 'Shrink chart' : 'Expand chart'}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mai-tv__icon"
            title="Close chart"
            aria-label="Close chart"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="mai-tv__frame">
        <div ref={hostRef} className="mai-tv__host" />
        {status !== 'ready' ? (
          <div className="mai-tv__overlay">
            {status === 'error'
              ? 'Chart could not load — check your connection and reload.'
              : 'Loading TradingView…'}
          </div>
        ) : null}
      </div>
    </section>
  );
}
