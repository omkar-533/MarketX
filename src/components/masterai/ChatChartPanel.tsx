import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import type { ChartLevel } from '../../utils/chartAnnotations';
import { openExternalUrl } from '../../utils/openExternalUrl';
import {
  NATIVE_STUDY_PRESETS,
  NATIVE_TIMEFRAMES,
  TV_CHART_STYLES,
  TV_STUDY_PRESETS,
  TV_TIMEFRAMES,
  isWidgetRestricted,
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
  levels?: ChartLevel[];
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
  levels,
}: ChatChartPanelProps) {
  const [chartStyle, setChartStyle] = useState<TvChartStyle>('1');
  const [expanded, setExpanded] = useState(false);
  const [symbolInput, setSymbolInput] = useState(() => tradingViewSymbolLabel(symbol));
  const [reloadKey, setReloadKey] = useState(0);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const indicatorsRef = useRef<HTMLDivElement>(null);

  const native = isWidgetRestricted(symbol);
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

  const submitSymbol = () => {
    const next = parseTradingViewInput(symbolInput);
    if (next !== symbol) onSymbolChange(next);
    else setSymbolInput(tradingViewSymbolLabel(symbol));
  };

  return (
    <section className={`mai-tv ${expanded ? 'mai-tv--tall' : ''}`} aria-label="Chart">
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

        <span className="mai-tv__sep" aria-hidden />

        <div className="mai-tv__tfs" role="group" aria-label="Timeframe">
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

        <div className="mai-tv__actions">
          {native ? (
            <button
              type="button"
              onClick={() =>
                openExternalUrl(
                  `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`,
                )
              }
              className="mai-tv__icon"
              title="Open full chart on TradingView"
              aria-label="Open full chart on TradingView"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : null}
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
            title={closeLabel}
            aria-label={closeLabel}
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
        />
      ) : (
        <TradingViewChatChart
          symbol={symbol}
          interval={activeInterval}
          study={activeStudy}
          chartStyle={chartStyle}
          reloadKey={reloadKey}
        />
      )}
    </section>
  );
}
