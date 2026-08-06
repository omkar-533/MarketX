import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseStudies,
  tvStudyIds,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';
import { useTheme } from '../../context/ThemeContext';

const TV_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';

type TvWidgetCtor = new (config: Record<string, unknown>) => unknown;

let scriptPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if ((window as unknown as { TradingView?: { widget: TvWidgetCtor } }).TradingView) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      scriptPromise = null;
      reject(new Error('tv.js timed out'));
    }, 15_000);
    const settle = (fn: () => void) => {
      window.clearTimeout(timer);
      fn();
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TV_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => settle(resolve));
      existing.addEventListener('error', () => settle(() => reject(new Error('tv.js failed'))));
      return;
    }
    const script = document.createElement('script');
    script.src = TV_SCRIPT_SRC;
    script.async = true;
    script.onload = () => settle(resolve);
    script.onerror = () =>
      settle(() => {
        scriptPromise = null;
        reject(new Error('tv.js failed'));
      });
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type TerminalTvEmbedProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
};

/**
 * Official TradingView Advanced Chart widget — full desk mode.
 * Uses TradingView's licensed embed (tv.js), not a proprietary code clone.
 */
export default function TerminalTvEmbed({
  symbol,
  interval,
  study,
  chartStyle,
  reloadKey,
}: TerminalTvEmbedProps) {
  const { isDark } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const containerId = useRef(`wolf_term_tv_${Math.random().toString(36).slice(2, 10)}`);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const studies = useMemo(() => tvStudyIds(parseStudies(study)), [study]);
  const tvTheme = isDark ? 'dark' : 'light';
  const toolbarBg = isDark ? '#131722' : '#ffffff';
  const chartBg = isDark ? '#131722' : '#ffffff';
  const gridColor = isDark ? 'rgba(42, 46, 57, 0.55)' : 'rgba(15, 23, 42, 0.08)';

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
          timezone: 'Asia/Kolkata',
          theme: tvTheme,
          style: chartStyle,
          locale: 'in',
          toolbar_bg: toolbarBg,
          enable_publishing: false,
          allow_symbol_change: true,
          hide_top_toolbar: false,
          hide_legend: false,
          hide_side_toolbar: false,
          withdateranges: true,
          save_image: true,
          details: true,
          hotlist: true,
          calendar: true,
          show_popup_button: true,
          popup_width: '100%',
          popup_height: '100%',
          autosize: true,
          studies,
          backgroundColor: chartBg,
          gridColor,
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [symbol, interval, chartStyle, studies, reloadKey, tvTheme, toolbarBg, chartBg, gridColor]);

  return (
    <div className="wolf-term__tv-desk">
      <div ref={hostRef} className="wolf-term__tv-host" />
      {status !== 'ready' ? (
        <div className="wolf-term__tv-status" aria-live="polite">
          {status === 'error'
            ? 'TradingView chart failed to load — check network, then Refresh.'
            : 'Loading TradingView Advanced Chart…'}
        </div>
      ) : null}
    </div>
  );
}
