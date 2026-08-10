/**
 * LIVE WOLF chart — LWC with incremental tip updates + event markers.
 */
import { useEffect, useRef } from 'react';
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
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../../../services/radar/radarTypes';
import type { MarketEvent } from '../../../services/live/liveTypes';
import { ema, closes as candleCloses } from '../../../services/radar/TechnicalEngine';

export type LiveChartToggles = {
  levels: boolean;
  markers: boolean;
  ema: boolean;
};

type Props = {
  candles: Candle[];
  levels?: { label: string; price: number }[];
  events?: MarketEvent[];
  focusTime?: number | null;
  toggles?: LiveChartToggles;
};

const DEFAULT_TOGGLES: LiveChartToggles = { levels: true, markers: true, ema: true };

function toUtc(ts: number): UTCTimestamp {
  return (ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts)) as UTCTimestamp;
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
  levels = [],
  events = [],
  focusTime = null,
  toggles = DEFAULT_TOGGLES,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const seededRef = useRef(false);
  const lastLenRef = useRef(0);
  const lastCloseRef = useRef(0);

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
    volSeriesRef.current = vol;
    emaSeriesRef.current = emaLine;
    seededRef.current = false;

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

    if (!seededRef.current || candles.length < lastLenRef.current || candles.length - lastLenRef.current > 1) {
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
      if (toggles.ema && candles.length >= 21) {
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

    // Markers (best-effort for LWC 5)
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
  }, [candles, events, toggles.markers, toggles.ema]);

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
    const t = toUtc(focusTime);
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, candles.length - 40),
      to: candles.length + 2,
    });
    void t;
  }, [focusTime, candles.length]);

  return <div className="live-wolf-chart" ref={hostRef} />;
}
