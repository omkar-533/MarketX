import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { useTheme } from '../../context/ThemeContext';
import { useChartLiveTick } from '../../hooks/useChartLiveTick';
import type { ChartBar, ChartIndicator, ChartType, ChartDataSource, ChartTimeframe } from '../../types/chart';
import {
  fetchChartSeries,
  loadPlatformBarsAsync,
  patchLastBarInPlace,
} from '../../services/chart/chartDataService';
import {
  bollinger,
  ema,
  rsi,
  sma,
  toHeikinAshi,
  vwap,
} from '../../services/chart/chartIndicators';
import ProChartHeader from './ProChartHeader';

export interface ProChartProps {
  symbol: string;
  timeframe: ChartTimeframe;
  chartType: ChartType;
  indicators: ChartIndicator[];
  dataSource: ChartDataSource;
  className?: string;
}

function t(time: number): Time {
  return time as Time;
}

const INDICATOR_KEY = (inds: ChartIndicator[]) => inds.slice().sort().join(',');

function ProChart({
  symbol,
  timeframe,
  chartType,
  indicators,
  dataSource,
  className = '',
}: ProChartProps) {
  const { isDark } = useTheme();
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlayRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const barsRef = useRef<ChartBar[]>([]);
  const chartReadyRef = useRef(false);
  const chartTypeRef = useRef(chartType);
  const showRsiRef = useRef(false);
  const prevShowRsiRef = useRef(false);
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applySeriesDataRef = useRef<(opts?: { fit?: boolean }) => void>(() => {});

  const [loading, setLoading] = useState(true);
  const [chartError, setChartError] = useState('');
  const [resolvedSource, setResolvedSource] = useState<ChartDataSource>('platform');

  const colors = useMemo(
    () =>
      isDark
        ? {
            bg: '#0b0e17',
            text: '#94a3b8',
            grid: '#1a1f2e',
            border: '#1a1f2e',
            up: '#10b981',
            down: '#ef4444',
            gold: '#d4af37',
            volUp: 'rgba(16,185,129,0.45)',
            volDown: 'rgba(239,68,68,0.45)',
          }
        : {
            bg: '#ffffff',
            text: '#64748b',
            grid: '#e2e8f0',
            border: '#c8d4e3',
            up: '#059669',
            down: '#dc2626',
            gold: '#b8941f',
            volUp: 'rgba(5,150,105,0.35)',
            volDown: 'rgba(220,38,38,0.35)',
          },
    [isDark],
  );

  const showRsi = indicators.includes('rsi');
  showRsiRef.current = showRsi;

  const applySeriesData = useCallback((opts?: { fit?: boolean }) => {
    const bars = barsRef.current;
    const mainChart = mainChartRef.current;
    if (!bars.length || !mainChart) return;
    const shouldFit = opts?.fit !== false;

    try {
      overlayRefs.current.forEach((s) => mainChart.removeSeries(s));
      overlayRefs.current = [];

      const displayBars = chartType === 'heikin' ? toHeikinAshi(bars) : bars;
      const closes = displayBars.map((b) => b.close);

      const candleData = displayBars.map((b) => ({
        time: t(b.time),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));
      const lineData = displayBars.map((b) => ({ time: t(b.time), value: b.close }));
      const volData = displayBars.map((b) => ({
        time: t(b.time),
        value: b.volume,
        color: b.close >= b.open ? colors.volUp : colors.volDown,
      }));

      if (chartType === 'line') {
        (mainSeriesRef.current as ISeriesApi<'Line'>)?.setData(lineData);
      } else if (chartType === 'area') {
        (mainSeriesRef.current as ISeriesApi<'Area'>)?.setData(lineData);
      } else {
        (mainSeriesRef.current as ISeriesApi<'Candlestick'>)?.setData(candleData);
      }
      volSeriesRef.current?.setData(volData);

      const addLine = (data: number[], color: string, width = 1) => {
        const lineWidth = (Math.min(4, Math.max(1, width)) || 1) as 1 | 2 | 3 | 4;
        const s = mainChart.addSeries(LineSeries, { color, lineWidth, priceLineVisible: false });
        s.setData(displayBars.map((b, i) => ({ time: t(b.time), value: data[i] })));
        overlayRefs.current.push(s);
      };

      if (indicators.includes('ema20')) addLine(ema(closes, 20), '#22d3ee', 2);
      if (indicators.includes('ema50')) addLine(ema(closes, 50), '#a78bfa', 2);
      if (indicators.includes('sma20')) addLine(sma(closes, 20), '#fbbf24', 2);
      if (indicators.includes('vwap')) addLine(vwap(bars), '#f472b6', 2);
      if (indicators.includes('bb')) {
        const bb = bollinger(closes, 20, 2);
        addLine(bb.upper, '#64748b', 1);
        addLine(bb.middle, '#94a3b8', 1);
        addLine(bb.lower, '#64748b', 1);
      }

      if (shouldFit) mainChart.timeScale().fitContent();

      if (showRsiRef.current && rsiChartRef.current && rsiSeriesRef.current) {
        const rsiValues = rsi(closes);
        rsiSeriesRef.current.setData(displayBars.map((b, i) => ({ time: t(b.time), value: rsiValues[i] })));
        if (shouldFit) rsiChartRef.current.timeScale().fitContent();
      }

      setChartError('');
    } catch (err) {
      console.error('ProChart data error:', err);
      setChartError('Chart update failed.');
    }
  }, [chartType, indicators, colors]);

  applySeriesDataRef.current = applySeriesData;

  const loadData = useCallback(async () => {
    if (dataSource === 'platform') {
      const { bars } = await loadPlatformBarsAsync(symbol, timeframe);
      barsRef.current = bars;
      setResolvedSource('platform');
      setLoading(false);
      if (chartReadyRef.current) applySeriesDataRef.current({ fit: true });
      return;
    }

    setLoading(true);
    const bundle = await fetchChartSeries(symbol, timeframe, dataSource);
    barsRef.current = bundle.bars;
    setResolvedSource(bundle.source);
    setLoading(false);
    if (chartReadyRef.current) applySeriesDataRef.current({ fit: true });
  }, [symbol, timeframe, dataSource]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const getHeights = useCallback(() => {
    const mainHeight = Math.max(mainRef.current?.clientHeight ?? 0, 420);
    const rsiHeight = showRsiRef.current && rsiRef.current ? Math.min(130, Math.max(72, Math.floor(mainHeight * 0.22))) : 0;
    return { mainHeight, rsiHeight, chartHeight: Math.max(mainHeight - rsiHeight, 280) };
  }, []);

  const destroyCharts = useCallback(() => {
    mainChartRef.current?.remove();
    rsiChartRef.current?.remove();
    mainChartRef.current = null;
    rsiChartRef.current = null;
    mainSeriesRef.current = null;
    volSeriesRef.current = null;
    rsiSeriesRef.current = null;
    overlayRefs.current = [];
    chartReadyRef.current = false;
  }, []);

  const initCharts = useCallback(() => {
    if (!mainRef.current || !barsRef.current.length) return;

    destroyCharts();

    try {
      const { chartHeight, rsiHeight } = getHeights();
      const width = Math.max(mainRef.current.clientWidth, 300);

      const chartOpts = {
        layout: { background: { color: colors.bg }, textColor: colors.text },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
        crosshair: {
          mode: 1 as const,
          vertLine: { color: colors.gold, labelBackgroundColor: colors.gold },
          horzLine: { color: colors.gold, labelBackgroundColor: colors.gold },
        },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: timeframe === '1m' },
      };

      const mainChart = createChart(mainRef.current, { ...chartOpts, width, height: chartHeight });
      mainChartRef.current = mainChart;

      if (chartType === 'line') {
        mainSeriesRef.current = mainChart.addSeries(LineSeries, { color: colors.gold, lineWidth: 2 });
      } else if (chartType === 'area') {
        mainSeriesRef.current = mainChart.addSeries(AreaSeries, {
          lineColor: colors.gold,
          topColor: 'rgba(212,175,55,0.35)',
          bottomColor: 'rgba(212,175,55,0.02)',
          lineWidth: 2,
        });
      } else {
        mainSeriesRef.current = mainChart.addSeries(CandlestickSeries, {
          upColor: colors.up,
          downColor: colors.down,
          borderUpColor: colors.up,
          borderDownColor: colors.down,
          wickUpColor: colors.up,
          wickDownColor: colors.down,
        });
      }

      const vol = mainChart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volSeriesRef.current = vol;

      if (showRsiRef.current && rsiRef.current) {
        const rsiChart = createChart(rsiRef.current, {
          ...chartOpts,
          width: rsiRef.current.clientWidth,
          height: rsiHeight,
        });
        rsiChartRef.current = rsiChart;
        rsiSeriesRef.current = rsiChart.addSeries(LineSeries, { color: '#818cf8', lineWidth: 2 });
      }

      chartReadyRef.current = true;
      chartTypeRef.current = chartType;
      applySeriesDataRef.current({ fit: true });
    } catch (err) {
      console.error('ProChart init error:', err);
      setChartError('Chart render failed.');
    }
  }, [applySeriesData, chartType, colors, destroyCharts, getHeights, timeframe]);

  const resizeCharts = useCallback(() => {
    if (!chartReadyRef.current || !mainRef.current) return;
    const { chartHeight, rsiHeight } = getHeights();
    const width = Math.max(mainRef.current.clientWidth, 300);
    mainChartRef.current?.applyOptions({ width, height: chartHeight });
    if (rsiChartRef.current && rsiRef.current) {
      rsiChartRef.current.applyOptions({ width: rsiRef.current.clientWidth, height: rsiHeight });
    }
  }, [getHeights]);

  useEffect(() => {
    return () => destroyCharts();
  }, [destroyCharts]);

  useEffect(() => {
    if (loading || chartReadyRef.current || !barsRef.current.length) return;
    initCharts();
  }, [loading, initCharts]);

  const indicatorKey = useMemo(() => INDICATOR_KEY(indicators), [indicators]);

  useEffect(() => {
    if (!chartReadyRef.current) return;
    applySeriesData({ fit: false });
  }, [indicatorKey, applySeriesData]);

  useEffect(() => {
    if (!chartReadyRef.current) {
      chartTypeRef.current = chartType;
      return;
    }
    if (chartTypeRef.current === chartType) return;
    chartTypeRef.current = chartType;
    destroyCharts();
    initCharts();
  }, [chartType, destroyCharts, initCharts]);

  const rebuildChart = useCallback(() => {
    if (!chartReadyRef.current) return;
    destroyCharts();
    initCharts();
  }, [destroyCharts, initCharts]);

  useEffect(() => {
    if (!chartReadyRef.current) {
      prevShowRsiRef.current = showRsi;
      return;
    }
    if (prevShowRsiRef.current === showRsi) return;
    prevShowRsiRef.current = showRsi;
    rebuildChart();
  }, [showRsi, rebuildChart]);

  useEffect(() => {
    if (!chartReadyRef.current) return;
    mainChartRef.current?.applyOptions({
      layout: { background: { color: colors.bg }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    });
    rsiChartRef.current?.applyOptions({
      layout: { background: { color: colors.bg }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    });
  }, [colors]);

  useEffect(() => {
    const onResize = () => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(resizeCharts, 150);
    };
    window.addEventListener('resize', onResize);
    const ro = mainRef.current ? new ResizeObserver(onResize) : null;
    if (mainRef.current) ro?.observe(mainRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
    };
  }, [resizeCharts, loading]);

  const pushLiveUpdate = useCallback(() => {
    if (!chartReadyRef.current || !barsRef.current.length) return;
    if (!patchLastBarInPlace(barsRef.current, symbol)) return;

    const last = barsRef.current[barsRef.current.length - 1];
    const series = mainSeriesRef.current;
    if (!series) return;

    if (chartType === 'line' || chartType === 'area') {
      (series as ISeriesApi<'Line'>).update({ time: t(last.time), value: last.close });
    } else if (chartType === 'heikin') {
      const ha = toHeikinAshi(barsRef.current);
      const h = ha[ha.length - 1];
      (series as ISeriesApi<'Candlestick'>).update({
        time: t(h.time),
        open: h.open,
        high: h.high,
        low: h.low,
        close: h.close,
      });
    } else {
      (series as ISeriesApi<'Candlestick'>).update({
        time: t(last.time),
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      });
    }
    volSeriesRef.current?.update({
      time: t(last.time),
      value: last.volume,
      color: last.close >= last.open ? colors.volUp : colors.volDown,
    });
  }, [symbol, chartType, colors]);

  useChartLiveTick(pushLiveUpdate, 600, !loading);

  return (
    <div className={`flex flex-col h-full w-full bg-dark-surface ${className}`}>
      <ProChartHeader symbol={symbol} timeframe={timeframe} resolvedSource={resolvedSource} />

      <div className="flex flex-1 min-h-0 relative">
        <div className="w-9 shrink-0 flex flex-col items-center gap-1 py-2 border-r border-dark-border bg-dark-elevated/50 text-dark-muted">
          <span className="text-[9px] text-center leading-tight mt-auto px-0.5">MTX</span>
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-dark-surface/80">
              <div className="w-7 h-7 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
            </div>
          )}
          {chartError && (
            <div className="absolute top-2 left-2 z-10 text-xs text-red-400 bg-dark-surface/90 px-2 py-1 rounded">
              {chartError}
            </div>
          )}
          <div ref={mainRef} className="flex-1 min-h-[320px] w-full" />
          {showRsi && (
            <div ref={rsiRef} className="shrink-0 w-full border-t border-dark-border" style={{ height: 110 }} />
          )}
        </div>
      </div>
    </div>
  );
}

const ProChartMemo = memo(ProChart);
export default ProChartMemo;
