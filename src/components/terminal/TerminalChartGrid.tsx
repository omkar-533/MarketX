import { useMemo, useState } from 'react';
import TerminalChartHost from './TerminalChartHost';
import TerminalTvEmbed from './TerminalTvEmbed';
import {
  tradingViewSymbolLabel,
  usesNativeChart,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';
import { chartLayoutCols, chartLayoutRows, type TerminalChartCount } from '../../services/terminalChartLayouts';

export type TerminalChartGridProps = {
  chartCount: TerminalChartCount;
  chartSymbols: string[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
  logScale: boolean;
  rangePreset: string;
  onClearIndicators?: () => void;
  onApplyStudy?: (study: string) => void;
  onStudyChange?: (study: string) => void;
  onNavigate?: (tab: string) => void;
};

function PaneChart({
  symbol,
  interval,
  study,
  chartStyle,
  reloadKey,
  logScale,
  rangePreset,
  showRail,
  onClearIndicators,
  onApplyStudy,
  onStudyChange,
  onNavigate,
}: {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
  logScale: boolean;
  rangePreset: string;
  showRail: boolean;
  onClearIndicators?: () => void;
  onApplyStudy?: (study: string) => void;
  onStudyChange?: (study: string) => void;
  onNavigate?: (tab: string) => void;
}) {
  const [nativeFailed, setNativeFailed] = useState(false);
  const preferNative = usesNativeChart(symbol);
  const native = preferNative && !nativeFailed;

  if (native) {
    return (
      <TerminalChartHost
        symbol={symbol}
        interval={interval}
        study={study}
        chartStyle={chartStyle}
        reloadKey={reloadKey}
        nativeFailed={false}
        logScale={logScale}
        rangePreset={rangePreset}
        showRail={showRail}
        onNativeUnavailable={() => setNativeFailed(true)}
        onClearIndicators={onClearIndicators}
        onApplyStudy={onApplyStudy}
        onStudyChange={onStudyChange}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <TerminalTvEmbed
      symbol={symbol}
      interval={interval}
      study={study}
      chartStyle={chartStyle}
      reloadKey={reloadKey}
    />
  );
}

/**
 * Multi-asset chart desk — equal CSS grid panes (1…16).
 */
export default function TerminalChartGrid({
  chartCount,
  chartSymbols,
  activeIndex,
  onActiveIndexChange,
  interval,
  study,
  chartStyle,
  reloadKey,
  logScale,
  rangePreset,
  onClearIndicators,
  onApplyStudy,
  onStudyChange,
  onNavigate,
}: TerminalChartGridProps) {
  const cols = chartLayoutCols(chartCount);
  const rows = chartLayoutRows(chartCount);
  const multi = chartCount > 1;

  const panes = useMemo(() => {
    return Array.from({ length: chartCount }, (_, i) => ({
      index: i,
      symbol: chartSymbols[i] || chartSymbols[0] || 'NSE:NIFTY',
    }));
  }, [chartCount, chartSymbols]);

  return (
    <div
      className={`wolf-term__grid ${multi ? 'wolf-term__grid--multi' : 'wolf-term__grid--single'}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
      data-count={chartCount}
    >
      {panes.map((pane) => {
        const active = pane.index === activeIndex;
        return (
          <div
            key={`${pane.index}:${pane.symbol}`}
            className={`wolf-term__pane ${active ? 'is-active' : ''}`}
            onMouseDown={() => onActiveIndexChange(pane.index)}
            role="group"
            aria-label={`Chart ${pane.index + 1}: ${tradingViewSymbolLabel(pane.symbol)}`}
          >
            {multi ? (
              <div className="wolf-term__pane-head">
                <button
                  type="button"
                  className={`wolf-term__pane-sym ${active ? 'on' : ''}`}
                  title="Select this chart"
                  onClick={() => onActiveIndexChange(pane.index)}
                >
                  {tradingViewSymbolLabel(pane.symbol)}
                </button>
                <span className="wolf-term__pane-meta">{interval}</span>
              </div>
            ) : null}
            <div className="wolf-term__pane-chart">
              <PaneChart
                symbol={pane.symbol}
                interval={interval}
                study={study}
                chartStyle={chartStyle}
                reloadKey={reloadKey}
                logScale={logScale}
                rangePreset={rangePreset}
                showRail={!multi || active}
                onClearIndicators={active ? onClearIndicators : undefined}
                onApplyStudy={active ? onApplyStudy : undefined}
                onStudyChange={active ? onStudyChange : undefined}
                onNavigate={onNavigate}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
