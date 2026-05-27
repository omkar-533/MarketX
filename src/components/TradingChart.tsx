import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, LineData } from 'lightweight-charts';
import { loadPlatformBarsAsync } from '../services/chart/chartDataService';
import { subscribeAutoRefresh } from '../services/autoRefreshHub';

interface TradingChartProps {
  symbol?: string;
  height?: number;
}

export default function TradingChart({ symbol = 'NIFTY', height = 500 }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const emaRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [timeframe, setTimeframe] = useState('15m');

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0b0e17' },
        textColor: '#94a3b8',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      grid: { vertLines: { color: '#121520' }, horzLines: { color: '#121520' } },
      crosshair: {
        mode: 1,
        vertLine: { color: '#d4af37', width: 1, style: 2, labelBackgroundColor: '#d4af37' },
        horzLine: { color: '#d4af37', width: 1, style: 2, labelBackgroundColor: '#d4af37' },
      },
      rightPriceScale: { borderColor: '#1a1f2e', scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderColor: '#1a1f2e', timeVisible: true, secondsVisible: false },
      handleScroll: { vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#d4af37',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volRef.current = volumeSeries;

    const emaSeries = chart.addSeries(LineSeries, {
      color: '#d4af37',
      lineWidth: 2,
      priceLineVisible: false,
    });
    emaRef.current = emaSeries;

    const applyBars = async () => {
      const { bars } = await loadPlatformBarsAsync(symbol, timeframe as '15m');
      if (!bars.length) return;

      const cd: CandlestickData[] = bars.map((c) => ({
        time: c.time as CandlestickData['time'],
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const vd: HistogramData[] = bars.map((c) => ({
        time: c.time as HistogramData['time'],
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)',
      }));

      const period = 20;
      const emaData: LineData[] = [];
      let ema = bars[0].close;
      const multiplier = 2 / (period + 1);
      bars.forEach((c, i) => {
        if (i === 0) ema = c.close;
        else ema = (c.close - ema) * multiplier + ema;
        emaData.push({ time: c.time as LineData['time'], value: Math.round(ema * 100) / 100 });
      });

      candleSeries.setData(cd);
      volumeSeries.setData(vd);
      emaSeries.setData(emaData);
      chart.timeScale().fitContent();
    };

    void applyBars();
    const unsub = subscribeAutoRefresh(() => void applyBars());

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      unsub();
      ro.disconnect();
      chart.remove();
    };
  }, [symbol, timeframe]);

  return (
    <div className="rounded-xl border border-dark-border bg-dark-surface overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border">
        <span className="text-sm font-bold text-gold">{symbol}</span>
        {(['5m', '15m', '1h', '1d'] as const).map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={`text-xs px-2 py-1 rounded ${timeframe === tf ? 'bg-gold/20 text-gold' : 'text-slate-500'}`}
          >
            {tf}
          </button>
        ))}
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
