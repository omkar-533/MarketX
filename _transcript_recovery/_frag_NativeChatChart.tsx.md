# Fragments for NativeChatChart.tsx

## L9644 StrReplace

### old_string

```
export type NativeChatChartProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  /** Our feed has no data for this symbol — the panel can fall back elsewhere. */
  onUnavailable?: () => void;
};
```

### new_string

```
export type NativeChatChartProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  /** Our feed has no data for this symbol — the panel can fall back elsewhere. */
  onUnavailable?: () => void;
  /** Stretch the chart frame to fill its parent (Terminal desk). */
  fillHeight?: boolean;
  /** Show the left drawing rail (default true). */
  showRail?: boolean;
  /** When the left edge is visible, fetch older bars and prepend. */
  enableHistoryScroll?: boolean;
};
```

## L9644 StrReplace

### old_string

```
export default function NativeChatChart({
  symbol,
  interval,
  study,
  chartStyle,
  reloadKey,
  levels,
  shapes,
  onUnavailable,
}: NativeChatChartProps) {
```

### new_string

```
export default function NativeChatChart({
  symbol,
  interval,
  study,
  chartStyle,
  reloadKey,
  levels,
  shapes,
  onUnavailable,
  fillHeight = false,
  showRail = true,
  enableHistoryScroll = false,
}: NativeChatChartProps) {
```

## L9645 StrReplace

### old_string

```
      timeScale: {
        borderColor: theme.border,
        timeVisible: intradady,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 6,
        minBarSpacing: 1.5,
        // Do not leave a blank void past the first historical bar when zooming out.
        fixLeftEdge: true,
        tickMarkFormatter: formatTickMark,
      },
```

### new_string

```
      timeScale: {
        borderColor: theme.border,
        timeVisible: intraday,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 6,
        minBarSpacing: 1.5,
        // Terminal can pan into older history; chat chart keeps a solid left edge.
        fixLeftEdge: !enableHistoryScroll,
        tickMarkFormatter: formatTickMark,
      },
```

## L9646 StrReplace

### old_string

```
        // Do not leave a blank void past the first historical bar when zooming out.
        fixLeftEdge: true,
        tickMarkFormatter: formatTickMark,
      },
      localization: { timeFormatter: (t: Time) => istFull.format(Number(t) * 1000) },
    });
    chartRef.current = chart;
```

### new_string

```
        // Terminal can pan into older history; chat chart keeps a solid left edge.
        fixLeftEdge: !enableHistoryScroll,
        tickMarkFormatter: formatTickMark,
      },
      localization: { timeFormatter: (t: Time) => istFull.format(Number(t) * 1000) },
    });
    chartRef.current = chart;
```

## L9646 StrReplace

### old_string

```
  return (
    <div className="mai-tv__frame mai-tv__frame--tools">
      <ChartToolRail
        tool={tool}
        onToolChange={setTool}
        magnet={magnet}
        onMagnetToggle={() => setMagnet((v) => !v)}
        onUndo={drawings.undo}
        onClear={drawings.clear}
        canUndo={drawings.drawings.length > 0}
      />

      <div className="mai-nc__area" data-drawing={tool === 'cursor' ? undefined : 'on'}>
        <div ref={hostRef} className="mai-tv__host" />
        <canvas ref={canvasRef} className="mai-nc__draw" />
```

### new_string

```
  return (
    <div
      className={`mai-tv__frame mai-tv__frame--tools ${fillHeight ? 'mai-tv__frame--fill' : ''}`}
    >
      {showRail ? (
        <ChartToolRail
          tool={tool}
          onToolChange={setTool}
          magnet={magnet}
          onMagnetToggle={() => setMagnet((v) => !v)}
          onUndo={drawings.undo}
          onClear={drawings.clear}
          canUndo={drawings.drawings.length > 0}
        />
      ) : null}

      <div className="mai-nc__area" data-drawing={tool === 'cursor' ? undefined : 'on'}>
        <div ref={hostRef} className="mai-tv__host" />
        <canvas ref={canvasRef} className="mai-nc__draw" />

        {loadingOlder ? (
          <div className="mai-nc__history-load" aria-live="polite">
            Loading older bars…
          </div>
        ) : null}
        {historyExhausted && enableHistoryScroll ? (
          <div className="mai-nc__history-load mai-nc__history-load--done">Oldest loaded</div>
        ) : null}
```

## L9701 StrReplace

### old_string

```
      {showRail ? (
        <ChartToolRail
          tool={tool}
          onToolChange={setTool}
          magnet={magnet}
          onMagnetToggle={() => setMagnet((v) => !v)}
          onUndo={drawings.undo}
          onClear={drawings.clear}
          canUndo={drawings.drawings.length > 0}
        />
      ) : null}
```

### new_string

```
      {showRail ? (
        <ChartToolRail
          tool={tool}
          onToolChange={setTool}
          magnet={magnet}
          onMagnetToggle={() => setMagnet((v) => !v)}
          onUndo={drawings.undo}
          onClear={drawings.clear}
          canUndo={drawings.drawings.length > 0}
          variant={fillHeight ? 'desk' : 'chat'}
        />
      ) : null}
```

## L9745 StrReplace

### old_string

```
import {
  atr,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  stochastic,
  supertrend,
  toHeikinAshi,
  vwap,
} from '../../services/chart/chartIndicators';
```

### new_string

```
import {
  atr,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  stochastic,
  supertrend,
  toHeikinAshi,
  vwap,
} from '../../services/chart/chartIndicators';
import {
  getWolfIndicator,
  isInactiveWolfStudy,
  isWolfIndicatorId,
} from '../../services/chart/wolfIndicators';
```

## L9745 StrReplace

### old_string

```
    const paneStudies = studies.filter((id) => !OVERLAY_STUDIES.has(id));
```

### new_string

```
    const paneStudies = studies.filter(
      (id) => !OVERLAY_STUDIES.has(id) && !isInactiveWolfStudy(id) && !isWolfIndicatorId(id),
    );
```

## L9746 StrReplace

### old_string

```
  const studies = useMemo(() => parseStudies(study), [study]);
  const studyKey = studies.join(',');
```

### new_string

```
  const studies = useMemo(() => parseStudies(study), [study]);
  const studyKey = studies.join(',');
  const wolfActive = useMemo(
    () =>
      studies
        .map((id) => getWolfIndicator(id))
        .filter((d): d is NonNullable<typeof d> => Boolean(d)),
    [studies],
  );
```

## L9747 StrReplace

### old_string

```
    const paneStudies = studies.filter(
      (id) => !OVERLAY_STUDIES.has(id) && !isInactiveWolfStudy(id) && !isWolfIndicatorId(id),
    );
```

### new_string

```
    const paneStudies = studies.filter((id) => {
      if (OVERLAY_STUDIES.has(id)) return false;
      if (isInactiveWolfStudy(id)) return false;
      const wolf = getWolfIndicator(id);
      if (wolf) return wolf.status === 'ready' && wolf.pane === 'pane';
      return true;
    });
```

## L9747 StrReplace

### old_string

```
import {
  getWolfIndicator,
  isInactiveWolfStudy,
  isWolfIndicatorId,
} from '../../services/chart/wolfIndicators';
```

### new_string

```
import {
  getWolfIndicator,
  isInactiveWolfStudy,
} from '../../services/chart/wolfIndicators';
```

