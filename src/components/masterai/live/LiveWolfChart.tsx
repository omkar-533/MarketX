/**
 * LIVE WOLF candlestick chart — Lightweight Charts + MarketData candles only.
 */
import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../../services/radar/radarTypes';

type Props = {
  candles: Candle[];
  levels?: { label: string; price: number }[];
};

export default function LiveWolfChart({ candles, levels = [] }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);

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
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    chartRef.current = chart;
    candleSeriesRef.current = candlesSeries;
    volSeriesRef.current = vol;

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
    };
  }, []);

  useEffect(() => {
    const series = candleSeriesRef.current;
    const vol = volSeriesRef.current;
    if (!series || !vol || !candles.length) return;

    const data = candles.map((c) => ({
      time: (c.timestamp > 1e12 ? Math.floor(c.timestamp / 1000) : Math.floor(c.timestamp)) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const vols = candles.map((c) => ({
      time: (c.timestamp > 1e12 ? Math.floor(c.timestamp / 1000) : Math.floor(c.timestamp)) as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)',
    }));
    series.setData(data);
    vol.setData(vols);

    // Incremental tip update path: setData is OK for phase 2–6; later optimize to series.update
    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles]);

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
  }, [levels, candles.length]);

  return <div className="live-wolf-chart" ref={hostRef} />;
}
