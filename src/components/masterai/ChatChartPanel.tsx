import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Expand, Maximize2, Minimize2, RefreshCw, Shrink, X } from 'lucide-react';
import type { ChartLevel, ChartShape, ChartShapeTone } from '../../utils/chartAnnotations';
import {
  NATIVE_STUDY_PRESETS,
  NATIVE_TIMEFRAMES,
  TV_CHART_STYLES,
  TV_STUDY_PRESETS,
  TV_TIMEFRAMES,
  usesNativeChart,
  joinStudies,
  parseStudies,
  parseTradingViewInput,
  tradingViewSymbolLabel,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';
import NativeChatChart from './NativeChatChart';
import TradingViewChatChart from './TradingViewChatChart';

export type ChatChartPanelProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: TvInterval) => void;
  onStudyChange: (study: string) => void;
  onClose: () => void;
  closeLabel?: string;
  /** Hide the X close control (pinned charts on training desks). */
  hideClose?: boolean;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
};

/**
 * Chart panel inside the Wolf AI chat. Indian exchanges are drawn from our own
 * market feed because TradingView blocks them in embedded widgets; everything
 * else keeps the richer TradingView widget.
 */
export default function ChatChartPanel({
  symbol,
  interval,
  study,
  onSymbolChange,
  onIntervalChange,
  onStudyChange,
  onClose,
  closeLabel = 'Close chart',
  hideClose = false,
  levels,
  shapes,
}: ChatChartPanelProps) {
  const [chartStyle, setChartStyle] = useState<TvChartStyle>('1');
  const [expanded, setExpanded] = useState(false);
  const [symbolInput, setSymbolInput] = useState(() => tradingViewSymbolLabel(symbol));
  const [reloadKey, setReloadKey] = useState(0);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const indicatorsRef = useRef<HTMLDivElement>(null);

  // A global symbol our feed cannot serve falls back to the widget, so the user
  // still gets a chart instead of an empty panel.
  const [nativeFailed, setNativeFailed] = useState(false);
  useEffect(() => setNativeFailed(false), [symbol]);
  // A new identity here would re-trigger the chart's fetch effect on every render.
  const handleNativeUnavailable = useCallback(() => setNativeFailed(true), []);
  const native = usesNativeChart(symbol) && !nativeFailed;
  const timeframes = native ? NATIVE_TIMEFRAMES : TV_TIMEFRAMES;
  const studyPresets = native ? NATIVE_STUDY_PRESETS : TV_STUDY_PRESETS;

  useEffect(() => {
    setSymbolInput(tradingViewSymbolLabel(symbol));
  }, [symbol]);

  // A symbol switch can land on a timeframe or study the active renderer lacks.
  useEffect(() => {
    if (!timeframes.some((tf) => tf.id === interval)) onIntervalChange('15');
  }, [timeframes, interval, onIntervalChange]);

  const activeInterval = useMemo(
    () => (timeframes.some((tf) => tf.id === interval) ? interval : '15'),
    [timeframes, interval],
  );
  const activeStudies = useMemo(
    () => parseStudies(study).filter((id) => studyPresets.some((s) => s.id === id)),
    [studyPresets, study],
  );
  const activeStudy = useMemo(() => joinStudies(activeStudies), [activeStudies]);

  const toggleStudy = (id: string) => {
    const next = activeStudies.includes(id)
      ? activeStudies.filter((s) => s !== id)
      : [...activeStudies, id];
    onStudyChange(joinStudies(next));
  };

  // Same-page desk fullscreen: Esc exits, body scroll locked, chart fills the viewport.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFullscreen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.classList.add('mai-tv-fs-active');
    document.addEventListener('keydown', onKey);
    // Nudge layout after portal mount so NativeChatChart ResizeObserver refits candles.
    const t = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 40);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.classList.remove('mai-tv-fs-active');
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!indicatorsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!indicatorsRef.current?.contains(event.target as Node)) setIndicatorsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIndicatorsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [indicatorsOpen]);

  /**
   * The TradingView widget cannot be drawn on from outside, so its markings are
   * listed instead of being lost — the native chart draws them properly.
   */
  const marks = useMemo(() => {
    if (native) return [];
    const price = (value?: number) =>
      typeof value === 'number' ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '';
    const out: { key: string; tone: ChartShapeTone; text: string }[] = [];
    (levels ?? []).forEach((level, i) => {
      out.push({
        key: `level-${i}`,
        tone: level.kind === 'support' ? 'bull' : level.kind === 'resistance' ? 'bear' : 'neutral',
        text: `${level.label || level.kind} · ${price(level.price)}`,
      });
    });
    (shapes ?? []).forEach((shape, i) => {
      const span =
        typeof shape.p1 === 'number' && typeof shape.p2 === 'number'
          ? `${price(shape.p2)}–${price(shape.p1)}`
          : price(shape.p1);
      out.push({
        key: `shape-${i}`,
        tone: shape.tone,
        text: [shape.label || shape.type, span].filter(Boolean).join(' · '),
      });
    });
    return out.slice(0, 12);
  }, [native, levels, shapes]);

  const submitSymbol = () => {
    const next = parseTradingViewInput(symbolInput);
    if (next !== symbol) onSymbolChange(next);
    else setSymbolInput(tradingViewSymbolLabel(symbol));
  };

  const panel = (
    <section
      className={`mai-tv ${expanded && !fullscreen ? 'mai-tv--tall' : ''} ${
        fullscreen ? 'mai-tv--fs' : ''
      }`}
      aria-label="Chart"
    >
      <header className="mai-tv__bar">
        <div className="mai-tv__bar-scroll">
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

          <span className="mai-tv__sep" aria-hidden />

          <div className="mai-tv__tfs" role="group" aria-label="Multi-timeframe">
            <span className="mai-tv__mtf-label" title="Switch TF for MTF context">
              MTF
            </span>
            {timeframes.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => onIntervalChange(tf.id)}
                className={`mai-tv__tf ${tf.id === activeInterval ? 'mai-tv__tf--on' : ''}`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <span className="mai-tv__sep" aria-hidden />

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

            <div className="mai-tv__ind" ref={indicatorsRef}>
              <button
                type="button"
                className={`mai-tv__ind-btn ${activeStudies.length ? 'mai-tv__ind-btn--on' : ''}`}
                onClick={() => setIndicatorsOpen((v) => !v)}
                aria-expanded={indicatorsOpen}
                aria-label="Indicators"
              >
                Indicators{activeStudies.length ? ` · ${activeStudies.length}` : ''}
                <ChevronDown className="h-3 w-3" />
              </button>

              {indicatorsOpen ? (
                <div className="mai-tv__ind-menu" role="menu">
                  {studyPresets.map((s) => (
                    <label key={s.id} className="mai-tv__ind-item">
                      <input
                        type="checkbox"
                        checked={activeStudies.includes(s.id)}
                        onChange={() => toggleStudy(s.id)}
                      />
                      {s.label}
                    </label>
                  ))}
                  {activeStudies.length ? (
                    <button
                      type="button"
                      className="mai-tv__ind-clear"
                      onClick={() => onStudyChange(joinStudies([]))}
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Always pinned — never scrolls away with timeframes */}
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
          {fullscreen ? null : (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mai-tv__icon"
              title={expanded ? 'Shrink chart' : 'Taller chart'}
              aria-label={expanded ? 'Shrink chart' : 'Taller chart'}
            >
              {expanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className={`mai-tv__fs-btn ${fullscreen ? 'mai-tv__fs-btn--on' : ''}`}
            title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen — chart fills this page'}
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {fullscreen ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            <span>{fullscreen ? 'Exit' : 'Full screen'}</span>
          </button>
          {hideClose && !fullscreen ? null : (
            <button
              type="button"
              onClick={() => (fullscreen ? setFullscreen(false) : onClose())}
              className="mai-tv__icon"
              title={fullscreen ? 'Exit full screen' : closeLabel}
              aria-label={fullscreen ? 'Exit full screen' : closeLabel}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      {native ? (
        <NativeChatChart
          symbol={symbol}
          interval={activeInterval}
          study={activeStudy}
          chartStyle={chartStyle}
          reloadKey={reloadKey}
          levels={levels}
          shapes={shapes}
          onUnavailable={handleNativeUnavailable}
        />
      ) : (
        <>
          <TradingViewChatChart
            symbol={symbol}
            interval={activeInterval}
            study={activeStudy}
            chartStyle={chartStyle}
            reloadKey={reloadKey}
          />
          {marks.length ? (
            <div className="mai-tv__marks">
              <span className="mai-tv__marks-title">Wolf AI marks</span>
              {marks.map((mark) => (
                <span key={mark.key} className={`mai-tv__mark mai-tv__mark--${mark.tone}`}>
                  {mark.text}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );

  // Portalled to document.body so chat transforms / overflow never clip the desk.
  return fullscreen
    ? createPortal(
        <div
          className="mai-tv__fs-layer"
          role="dialog"
          aria-modal="true"
          aria-label="Chart full screen"
        >
          <div className="mai-tv__fs-top">
            <div className="mai-tv__fs-brand">
              <span>Wolf Trade</span>
              Chart desk · {tradingViewSymbolLabel(symbol)} ·{' '}
              {timeframes.find((tf) => tf.id === activeInterval)?.label || activeInterval}
            </div>
            <div className="mai-tv__fs-hint">Esc to exit</div>
            <button
              type="button"
              className="mai-tv__fs-exit"
              onClick={() => setFullscreen(false)}
              title="Exit full screen"
            >
              <Shrink className="h-3.5 w-3.5" />
              Exit full screen
            </button>
          </div>
          {panel}
        </div>,
        document.body,
      )
    : panel;
}
