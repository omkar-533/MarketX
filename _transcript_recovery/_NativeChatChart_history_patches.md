# NativeChatChart history/fillHeight related patches

## L9644 StrReplace

### old_string
```tsx
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
```tsx
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
```tsx
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
```tsx
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

## L9644 StrReplace

### old_string
```tsx
  const [logScale, setLogScale] = useState(false);
```

### new_string
```tsx
  const [logScale, setLogScale] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyExhausted, setHistoryExhausted] = useState(false);
```

## L9644 StrReplace

### old_string
```tsx
  const liveThrottleRef = useRef(0);
  const lastLiveAtRef = useRef(0);
```

### new_string
```tsx
  const liveThrottleRef = useRef(0);
  const lastLiveAtRef = useRef(0);
  const historyBusyRef = useRef(false);
  const historyExhaustedRef = useRef(false);
```

## L9644 StrReplace

### old_string
```tsx
  // Refit the viewport only when the user actually switches instrument/timeframe.
  useEffect(() => {
    needFitRef.current = true;
    touchedRef.current = false;
    setLegend(null);
    setLiveStreaming(false);
  }, [apiSymbol, apiInterval]);
```

### new_string
```tsx
  // Refit the viewport only when the user actually switches instrument/timeframe.
  useEffect(() => {
    needFitRef.current = true;
    touchedRef.current = false;
    historyBusyRef.current = false;
    historyExhaustedRef.current = false;
    setHistoryExhausted(false);
    setLoadingOlder(false);
    setLegend(null);
    setLiveStreaming(false);
  }, [apiSymbol, apiInterval]);

  const loadOlderBars = useCallback(async () => {
    if (!enableHistoryScroll || !apiInterval || historyBusyRef.current || historyExhaustedRef.current) {
      return;
    }
    const current = barsRef.current;
    if (current.length < 40) return;

    historyBusyRef.current = true;
    setLoadingOlder(true);
    try {
      const nextCount = Math.min(8000, current.length + 1200);
      const range =
        apiInterval === '1d' || apiInterval === '1w' || apiInterval === '1M'
          ? '1y'
          : apiInterval === '1h' || apiInterval === '2h' || apiInterval === '4h'
            ? '1y'
            : '6mo';
      const res = await fetchMarketOhlc(apiSymbol, apiInterval, range, nextCount);
      const fetched = res?.bars ?? [];
      if (!fetched.length) {
        historyExhaustedRef.current = true;
        setHistoryExhausted(true);
        return;
      }
      const firstTime = current[0]?.time ?? 0;
      const older = fetched.filter((b) => b.time < firstTime);
      if (!older.length) {
        historyExhaustedRef.current = true;
        setHistoryExhausted(true);
        return;
      }
      const merged = [...older, ...current];
      // Deduplicate by time just in case overlapping windows appear.
      const byTime = new Map<number, ChartBar>();
      for (const b of merged) byTime.set(b.time, b);
      const next = [...byTime.values()].sort((a, b) => a.time - b.time);
      barsRef.current = next;
      setBars(next);
    } finally {
      historyBusyRef.current = false;
      setLoadingOlder(false);
    }
  }, [enableHistoryScroll, apiInterval, apiSymbol]);
```

## L9645 StrReplace

### old_string
```tsx
  const historyBusyRef = useRef(false);
  const historyExhaustedRef = useRef(false);
```

### new_string
```tsx
  const historyBusyRef = useRef(false);
  const historyExhaustedRef = useRef(false);
  const prependShiftRef = useRef(0);
  const loadOlderRef = useRef<() => void>(() => undefined);
```

## L9645 StrReplace

### old_string
```tsx
      const firstTime = current[0]?.time ?? 0;
      const older = fetched.filter((b) => b.time < firstTime);
      if (!older.length) {
        historyExhaustedRef.current = true;
        setHistoryExhausted(true);
        return;
      }
      const merged = [...older, ...current];
      // Deduplicate by time just in case overlapping windows appear.
      const byTime = new Map<number, ChartBar>();
      for (const b of merged) byTime.set(b.time, b);
      const next = [...byTime.values()].sort((a, b) => a.time - b.time);
      barsRef.current = next;
      setBars(next);
```

### new_string
```tsx
      const firstTime = current[0]?.time ?? 0;
      const older = fetched.filter((b) => b.time < firstTime);
      if (!older.length) {
        historyExhaustedRef.current = true;
        setHistoryExhausted(true);
        return;
      }
      const merged = [...older, ...current];
      const byTime = new Map<number, ChartBar>();
      for (const b of merged) byTime.set(b.time, b);
      const next = [...byTime.values()].sort((a, b) => a.time - b.time);
      const added = next.length - current.length;
      if (added > 0) prependShiftRef.current = added;
      barsRef.current = next;
      setBars(next);
```

## L9645 StrReplace

### old_string
```tsx
  }, [enableHistoryScroll, apiInterval, apiSymbol]);

  // TradingView-style session: flip OPEN ↔ CLOSE without waiting for a full reload.
```

### new_string
```tsx
  }, [enableHistoryScroll, apiInterval, apiSymbol]);

  useEffect(() => {
    loadOlderRef.current = () => {
      void loadOlderBars();
    };
  }, [loadOlderBars]);

  // TradingView-style session: flip OPEN ↔ CLOSE without waiting for a full reload.
```

## L9645 StrReplace

### old_string
```tsx
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
```tsx
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
```tsx
        // Do not leave a blank void past the first historical bar when zooming out.
        fixLeftEdge: true,
        tickMarkFormatter: formatTickMark,
      },
      localization: { timeFormatter: (t: Time) => istFull.format(Number(t) * 1000) },
    });
    chartRef.current = chart;
```

### new_string
```tsx
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
```tsx
    chart.subscribeCrosshairMove((param) => {
      const source = viewRef.current?.source;
      if (!source?.length) return;
      const hovered = param.time ? legendMapRef.current.get(Number(param.time)) : undefined;
      setHoverIndex(hovered ?? null);
      setLegend(legendAt(source, hovered ?? source.length - 1));
    });

    priceSeriesRef.current = priceSeries;
```

### new_string
```tsx
    chart.subscribeCrosshairMove((param) => {
      const source = viewRef.current?.source;
      if (!source?.length) return;
      const hovered = param.time ? legendMapRef.current.get(Number(param.time)) : undefined;
      setHoverIndex(hovered ?? null);
      setLegend(legendAt(source, hovered ?? source.length - 1));
    });

    const onVisibleRange = () => {
      if (!enableHistoryScroll) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      // Near the left edge of loaded history — pull older bars.
      if (range.from < 8) loadOlderRef.current();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRange);

    priceSeriesRef.current = priceSeries;
```

## L9646 StrReplace

### old_string
```tsx
    // studyKey stands in for the studies array, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, chartStyle, studyKey, theme, intraday]);

  useEffect(() => {
    if (!view || !applyRef.current) return;
    applyRef.current(view, needFitRef.current);
    needFitRef.current = false;
  }, [view]);
```

### new_string
```tsx
    // studyKey stands in for the studies array, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, chartStyle, studyKey, theme, intraday, enableHistoryScroll]);

  useEffect(() => {
    if (!view || !applyRef.current) return;
    const chart = chartRef.current;
    const shift = prependShiftRef.current;
    const range = shift > 0 ? chart?.timeScale().getVisibleLogicalRange() : null;
    applyRef.current(view, needFitRef.current);
    needFitRef.current = false;
    if (shift > 0 && range && chart) {
      prependShiftRef.current = 0;
      chart.timeScale().setVisibleLogicalRange({
        from: range.from + shift,
        to: range.to + shift,
      });
    }
  }, [view]);
```

## L9646 StrReplace

### old_string
```tsx
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
```tsx
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
```tsx
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
```tsx
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

