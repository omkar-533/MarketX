/**
 * LIVE WOLF chart — LWC live tip updates + Terminal drawing tool rail.
 * Reuses ChartToolRail / useChartDrawings (same stack as NativeChatChart / Terminal).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../../../services/radar/radarTypes';
import type { MarketEvent } from '../../../services/live/liveTypes';
import { ema, closes as candleCloses } from '../../../services/radar/TechnicalEngine';
import type { ChartBar } from '../../../types/chart';
import type { DrawingKind, DrawingTool, MagnetMode } from '../../../services/chart/chartDrawings';
import ChartToolRail from '../ChartToolRail';
import DrawingObjectToolbar from '../DrawingObjectToolbar';
import DrawingSettingsSheet from '../DrawingSettingsSheet';
import ChartNavControls from '../ChartNavControls';
import { useChartDrawings } from '../useChartDrawings';

export type LiveChartToggles = {
  levels: boolean;
  markers: boolean;
  ema: boolean;
};

type Props = {
  candles: Candle[];
  symbol?: string;
  levels?: { label: string; price: number }[];
  events?: MarketEvent[];
  focusTime?: number | null;
  toggles?: LiveChartToggles;
};

const DEFAULT_TOGGLES: LiveChartToggles = { levels: true, markers: true, ema: true };

function toUtc(ts: number): UTCTimestamp {
  return (ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts)) as UTCTimestamp;
}

function candlesToBars(candles: Candle[]): ChartBar[] {
  return candles.map((c) => ({
    time: c.timestamp > 1e12 ? Math.floor(c.timestamp / 1000) : Math.floor(c.timestamp),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

function markerFor(evt: MarketEvent): {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle' | 'arrowUp' | 'arrowDown';
  text: string;
} | null {
  if (evt.significance === 'LOW') return null;
  if (evt.type === 'PRICE_UPDATE' || evt.type === 'ANALYSIS_UPDATE') return null;
  const bull =
    evt.type === 'LIQUIDITY_SWEEP' ||
    evt.type === 'STRUCTURE_SHIFT' ||
    evt.type === 'BREAKOUT' ||
    evt.type === 'SETUP_CONFIRMED' ||
    evt.type === 'SETUP_DETECTED';
  const bear = evt.type === 'BREAKDOWN' || evt.type === 'SETUP_INVALIDATED';
  return {
    time: toUtc(evt.timestamp),
    position: bear ? 'aboveBar' : 'belowBar',
    color: bear ? '#fb7185' : evt.type === 'VOLUME_EXPANSION' ? '#fbbf24' : '#d4af37',
    shape: bear ? 'arrowDown' : bull ? 'arrowUp' : 'circle',
    text: evt.type.replace(/_/g, ' ').slice(0, 18),
  };
}

export default function LiveWolfChart({
  candles,
  symbol = 'LIVE',
  levels = [],
  events = [],
  focusTime = null,
  toggles = DEFAULT_TOGGLES,
}: Props) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const seededRef = useRef(false);
  const lastLenRef = useRef(0);
  const lastCloseRef = useRef(0);

  const [chartEpoch, setChartEpoch] = useState(0);
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [magnetMode, setMagnetMode] = useState<MagnetMode>('off');
  const [snapIndicators, setSnapIndicators] = useState(true);
  const [stayDrawing, setStayDrawing] = useState(false);
  const [lockDrawings, setLockDrawings] = useState(false);
  const [hideDrawings, setHideDrawings] = useState(false);
  const [hideIndicators, setHideIndicators] = useState(false);
  const [hidePositions, setHidePositions] = useState(false);
  const [removeLocked, setRemoveLocked] = useState(false);
  const [valuesTooltip, setValuesTooltip] = useState(true);
  const [drawSettingsId, setDrawSettingsId] = useState<string | null>(null);

  const bars = useMemo(() => candlesToBars(candles), [candles]);
  const stayRef = useRef(stayDrawing);
  stayRef.current = stayDrawing;

  const drawings = useChartDrawings({
    areaRef,
    hostRef,
    canvasRef,
    chartRef,
    seriesRef,
    epoch: chartEpoch,
    bars,
    symbol: `live:${symbol}`,
    aiShapes: [],
    tool,
    onShapeDone: useCallback((info?: { kind: DrawingKind }) => {
      if (!info?.kind || !stayRef.current) setTool('cursor');
    }, []),
    onOpenDrawingSettings: useCallback((id: string) => {
      setDrawSettingsId(id);
    }, []),
    magnetMode,
    lockDrawings,
    hideDrawings,
    hideIndicators,
    removeLocked,
    isDark: true,
  });

  const selectedDrawing =
    drawings.selectedId != null
      ? drawings.drawings.find((d) => d.id === drawings.selectedId) ?? null
      : null;
  const settingsDrawing =
    drawSettingsId != null
      ? drawings.drawings.find((d) => d.id === drawSettingsId) ?? selectedDrawing
      : null;

  const onHideMode = useCallback((mode: 'drawings' | 'indicators' | 'positions' | 'all' | 'none') => {
    if (mode === 'none') {
      setHideDrawings(false);
      setHideIndicators(false);
      setHidePositions(false);
      return;
    }
    if (mode === 'all') {
      setHideDrawings(true);
      setHideIndicators(true);
      setHidePositions(true);
      return;
    }
    if (mode === 'drawings') setHideDrawings((v) => !v);
    if (mode === 'indicators') setHideIndicators((v) => !v);
    if (mode === 'positions') setHidePositions((v) => !v);
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0b0c' },
        textColor: '#b7b7b0',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
      width: el.clientWidth,
      height: el.clientHeight || 420,
    });
    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#fb7185',
      borderVisible: false,
      wickUpColor: '#34d399',
      wickDownColor: '#fb7185',
    });
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const emaLine = chart.addSeries(LineSeries, {
      color: 'rgba(212,175,55,0.85)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candlesSeries;
    seriesRef.current = candlesSeries as unknown as ISeriesApi<SeriesType>;
    volSeriesRef.current = vol;
    emaSeriesRef.current = emaLine;
    seededRef.current = false;
    setChartEpoch((e) => e + 1);

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: hostRef.current.clientWidth,
        height: hostRef.current.clientHeight || 420,
      });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      seriesRef.current = null;
      volSeriesRef.current = null;
      emaSeriesRef.current = null;
      priceLinesRef.current = [];
      seededRef.current = false;
    };
  }, []);

  useEffect(() => {
    const series = candleSeriesRef.current;
    const vol = volSeriesRef.current;
    const emaSeries = emaSeriesRef.current;
    if (!series || !vol || !candles.length) return;

    const tip = candles[candles.length - 1];
    const tipTime = toUtc(tip.timestamp);
    const tipCandle = {
      time: tipTime,
      open: tip.open,
      high: tip.high,
      low: tip.low,
      close: tip.close,
    };
    const tipVol = {
      time: tipTime,
      value: tip.volume,
      color: tip.close >= tip.open ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)',
    };

    const sameLen = seededRef.current && candles.length === lastLenRef.current;
    const onlyTipMoved = sameLen && tip.close !== lastCloseRef.current;

    if (
      !seededRef.current ||
      candles.length < lastLenRef.current ||
      candles.length - lastLenRef.current > 1
    ) {
      const data = candles.map((c) => ({
        time: toUtc(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const vols = candles.map((c) => ({
        time: toUtc(c.timestamp),
        value: c.volume,
        color: c.close >= c.open ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)',
      }));
      series.setData(data);
      vol.setData(vols);
      seededRef.current = true;
      chartRef.current?.timeScale().scrollToRealTime();
    } else if (candles.length > lastLenRef.current) {
      series.update(tipCandle);
      vol.update(tipVol);
      chartRef.current?.timeScale().scrollToRealTime();
    } else if (onlyTipMoved || sameLen) {
      series.update(tipCandle);
      vol.update(tipVol);
    }

    if (emaSeries) {
      if (toggles.ema && !hideIndicators && candles.length >= 21) {
        const cs = candleCloses(candles);
        const points: { time: UTCTimestamp; value: number }[] = [];
        for (let i = 20; i < candles.length; i++) {
          const v = ema(cs.slice(0, i + 1), 21);
          if (v != null) points.push({ time: toUtc(candles[i].timestamp), value: v });
        }
        emaSeries.setData(points);
        emaSeries.applyOptions({ visible: true });
      } else {
        emaSeries.setData([]);
        emaSeries.applyOptions({ visible: false });
      }
    }

    lastLenRef.current = candles.length;
    lastCloseRef.current = tip.close;

    if (toggles.markers) {
      const markers = events
        .map(markerFor)
        .filter(Boolean)
        .slice(0, 24) as NonNullable<ReturnType<typeof markerFor>>[];
      const api = series as unknown as { setMarkers?: (m: typeof markers) => void };
      api.setMarkers?.(markers);
    } else {
      const api = series as unknown as { setMarkers?: (m: unknown[]) => void };
      api.setMarkers?.([]);
    }
  }, [candles, events, toggles.markers, toggles.ema, hideIndicators]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* ignore */
      }
    }
    priceLinesRef.current = [];
    if (!toggles.levels) return;
    priceLinesRef.current = levels.slice(0, 6).map((lv) =>
      series.createPriceLine({
        price: lv.price,
        color: 'rgba(212,175,55,0.65)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: lv.label,
      }),
    );
  }, [levels, toggles.levels, candles.length]);

  useEffect(() => {
    if (!focusTime || !chartRef.current) return;
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, candles.length - 40),
      to: candles.length + 2,
    });
  }, [focusTime, candles.length]);

  const drawingArmed =
    tool !== 'cursor' && tool !== 'crosshair' && tool !== 'dot' && tool !== 'arrowCursor';

  return (
    <div className="live-wolf-chart-shell mai-tv__frame mai-tv__frame--tools mai-tv__frame--fill">
      <ChartToolRail
        tool={tool}
        onToolChange={setTool}
        magnetMode={magnetMode}
        onMagnetMode={setMagnetMode}
        snapIndicators={snapIndicators}
        onSnapIndicators={setSnapIndicators}
        stayDrawing={stayDrawing}
        onStayDrawing={setStayDrawing}
        lockDrawings={lockDrawings}
        onLockDrawings={setLockDrawings}
        hideDrawings={hideDrawings}
        hideIndicators={hideIndicators}
        hidePositions={hidePositions}
        onHideMode={onHideMode}
        drawingCount={drawings.drawings.length}
        indicatorCount={0}
        onUndo={drawings.undo}
        onClearDrawings={drawings.clear}
        onClearIndicators={() => undefined}
        onClearAll={() => drawings.clear()}
        removeLocked={removeLocked}
        onRemoveLocked={setRemoveLocked}
        valuesTooltip={valuesTooltip}
        onValuesTooltip={setValuesTooltip}
        variant="desk"
      />

      <div
        ref={areaRef}
        className="mai-nc__area live-wolf-chart__area"
        data-drawing={drawingArmed ? 'on' : undefined}
        data-tool={tool}
        data-cursor={tool === 'dot' ? 'dot' : tool === 'arrowCursor' ? 'arrow' : undefined}
        data-tooltip={valuesTooltip ? 'on' : undefined}
      >
        <div className="mai-tv__host live-wolf-chart" ref={hostRef} />
        <canvas ref={canvasRef} className="mai-nc__draw" />

        {chartEpoch > 0 ? (
          <ChartNavControls
            chart={chartRef.current}
            anchorRef={areaRef}
            onReset={() => chartRef.current?.timeScale().scrollToRealTime()}
            onInteract={() => undefined}
          />
        ) : null}

        {selectedDrawing ? (
          <DrawingObjectToolbar
            drawing={selectedDrawing}
            anchorRef={areaRef}
            onPatch={(patch) => {
              if (selectedDrawing) drawings.updateDrawing(selectedDrawing.id, patch);
            }}
            onOpenSettings={() => setDrawSettingsId(selectedDrawing.id)}
            onClone={() => drawings.cloneSelected()}
            onRemove={() => drawings.removeSelected()}
            onReorder={(dir) => drawings.reorderSelected(dir)}
          />
        ) : null}

        {settingsDrawing ? (
          <DrawingSettingsSheet
            drawing={settingsDrawing}
            onPatch={(patch) => drawings.updateDrawing(settingsDrawing.id, patch)}
            onClose={() => setDrawSettingsId(null)}
            onClone={() => {
              drawings.selectDrawing(settingsDrawing.id);
              drawings.cloneSelected();
            }}
            onRemove={() => {
              drawings.selectDrawing(settingsDrawing.id);
              drawings.removeSelected();
              setDrawSettingsId(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
