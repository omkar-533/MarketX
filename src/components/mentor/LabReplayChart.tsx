import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useTheme } from '../../context/ThemeContext';
import type { ChartBar } from '../../types/chart';
import type { LabPosition } from '../../services/tradingLab';

type Props = {
  bars: ChartBar[];
  position: LabPosition | null;
  className?: string;
};

const UP = '#26a69a';
const DOWN = '#ef5350';

function ts(t: number): UTCTimestamp {
  return Math.floor(t > 1e12 ? t / 1000 : t) as UTCTimestamp;
}

export default function LabReplayChart({ bars, position, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const { isDark: dark } = useTheme();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { color: 'transparent' },
        textColor: dark ? '#94a3b8' : '#64748b',
      },
      grid: {
        vertLines: { color: dark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)' },
        horzLines: { color: dark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 4 },
      crosshair: { mode: 0 },
      height: el.clientHeight || 320,
      width: el.clientWidth || 480,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: wrapRef.current.clientWidth,
        height: wrapRef.current.clientHeight,
      });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [dark]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data = bars.map((b) => ({
      time: ts(b.time),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    series.setData(data);
    chart.timeScale().scrollToRealTime();

    for (const line of linesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* ignore */
      }
    }
    linesRef.current = [];
    if (position) {
      linesRef.current.push(
        series.createPriceLine({
          price: position.entry,
          color: '#d4af37',
          lineWidth: 1,
          axisLabelVisible: true,
          title: 'Entry',
        }),
      );
      if (position.stopLoss != null) {
        linesRef.current.push(
          series.createPriceLine({
            price: position.stopLoss,
            color: '#ef5350',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'SL',
          }),
        );
      }
      if (position.takeProfit != null) {
        linesRef.current.push(
          series.createPriceLine({
            price: position.takeProfit,
            color: '#26a69a',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'TP',
          }),
        );
      }
    }
  }, [bars, position]);

  return <div ref={wrapRef} className={className || 'wm-lab__chart-canvas'} />;
}
