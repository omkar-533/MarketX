import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { TV_STUDY_PRESETS, type TvChartStyle, type TvInterval } from '../../utils/tradingViewSymbols';

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
  chartStyle: TvChartStyle;
  reloadKey: number;
};

/** TradingView's embed widget — used for symbols it is licensed to serve. */
export default function TradingViewChatChart({
  symbol,
  interval,
  study,
  chartStyle,
  reloadKey,
}: TradingViewChatChartProps) {
  const { isDark } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const containerId = useRef(`tv_chat_${Math.random().toString(36).slice(2, 9)}`);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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
          allow_symbol_change: false,
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

  return (
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
  );
}
