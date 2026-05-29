import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { hasRemoteApi } from '../../constants/brandLabels';
import { useTheme } from '../../context/ThemeContext';
import type { FuturesChartBar } from '../../services/futuresOiChart';
import { barToChartTime, formatOiAxis, formatVolAxis } from '../../services/futuresOiChart';

function t(time: string): Time {
  return time as Time;
}

const CHART_HEIGHT = 720;
const MIN_CHART_WIDTH = 320;

interface FuturesOiTradeXChartsProps {
  bars: FuturesChartBar[];
  symbol: string;
}

function FuturesOiTradeXChartsInner({ bars, symbol }: FuturesOiTradeXChartsProps) {
  const { isDark } = useTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);
  const oiRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<IChartApi[]>([]);
  const syncingRef = useRef(false);
  const fittedRef = useRef(false);
  const chartReadyRef = useRef(false);
  const seriesRef = useRef<{
    candle: ISeriesApi<'Candlestick'> | null;
    vol: ISeriesApi<'Histogram'> | null;
    oiHist: ISeriesApi<'Histogram'> | null;
    oiLine: ISeriesApi<'Line'> | null;
    delivery: ISeriesApi<'Line'> | null;
  }>({ candle: null, vol: null, oiHist: null, oiLine: null, delivery: null });
  const barsRef = useRef(bars);
  barsRef.current = bars;

  const [hover, setHover] = useState<{
    label: string;
    buildup: string;
    oi: number;
    vol: number;
    close: number;
  } | null>(null);

  const paneHeights = useMemo(() => {
    const priceH = Math.floor(CHART_HEIGHT * 0.48);
    const volH = Math.floor(CHART_HEIGHT * 0.22);
    const oiH = CHART_HEIGHT - priceH - volH - 8;
    return { priceH, volH, oiH };
  }, []);

  const chartTheme = useMemo(
    () =>
      isDark
        ? {
            bg: '#0b0e17',
            text: '#94a3b8',
            grid: '#1a1f2e',
            border: '#1a1f2e',
            hoverBg: 'rgba(18, 21, 32, 0.95)',
            hoverBorder: '#1a1f2e',
            legendBg: '#121520',
          }
        : {
            bg: '#ffffff',
            text: '#64748b',
            grid: '#e2e8f0',
            border: '#c8d4e3',
            hoverBg: '#f4f7fb',
            hoverBorder: '#dce4ef',
            legendBg: '#f8fafc',
          },
    [isDark],
  );

  const chartOpts = useMemo(
    () => ({
      layout: { background: { color: chartTheme.bg }, textColor: chartTheme.text, fontSize: 11 },
      grid: { vertLines: { color: chartTheme.grid }, horzLines: { color: chartTheme.grid } },
      crosshair: {
        mode: 1 as const,
        vertLine: { color: chartTheme.text, width: 1 as const, labelBackgroundColor: '#d4af37' },
        horzLine: { color: chartTheme.text, width: 1 as const, labelBackgroundColor: '#d4af37' },
      },
      rightPriceScale: { borderColor: chartTheme.border },
      timeScale: { borderColor: chartTheme.border, timeVisible: true, secondsVisible: false },
    }),
    [chartTheme],
  );

  const getWidth = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return MIN_CHART_WIDTH;
    return Math.max(el.clientWidth, el.offsetWidth, MIN_CHART_WIDTH);
  }, []);

  const destroyCharts = useCallback(() => {
    chartsRef.current.forEach((ch) => ch.remove());
    chartsRef.current = [];
    seriesRef.current = { candle: null, vol: null, oiHist: null, oiLine: null, delivery: null };
    chartReadyRef.current = false;
    fittedRef.current = false;
  }, []);

  const applyBarData = useCallback((data: FuturesChartBar[], fit = false) => {
    const { candle, vol, oiHist, oiLine, delivery } = seriesRef.current;
    if (!candle || !vol || !oiHist || !oiLine || !delivery || !data.length) return;

    candle.setData(
      data.map((b) => ({
        time: t(barToChartTime(b)),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    vol.setData(
      data.map((b) => ({
        time: t(barToChartTime(b)),
        value: b.volume,
        color: 'rgba(99, 102, 241, 0.7)',
      })),
    );
    oiHist.setData(
      data.map((b) => ({
        time: t(barToChartTime(b)),
        value: b.combinedOi,
        color: b.buildupColor,
      })),
    );
    oiLine.setData(
      data.map((b) => ({
        time: t(barToChartTime(b)),
        value: b.combinedOi,
      })),
    );
    delivery.setData(
      data.map((b) => ({
        time: t(barToChartTime(b)),
        value: b.combinedOi * (b.deliveryPct / 100),
      })),
    );

    if (fit && !fittedRef.current && chartsRef.current[0]) {
      chartsRef.current.forEach((ch) => ch.timeScale().fitContent());
      fittedRef.current = true;
    }
  }, []);

  useLayoutEffect(() => {
    if (!bars.length || !priceRef.current || !volRef.current || !oiRef.current) {
      destroyCharts();
      return;
    }

    const width = getWidth();
    if (width < 50) return;

    destroyCharts();

    const priceChart = createChart(priceRef.current, {
      ...chartOpts,
      width,
      height: paneHeights.priceH,
      leftPriceScale: { visible: true, borderColor: chartTheme.border },
    });
    const volChart = createChart(volRef.current, {
      ...chartOpts,
      width,
      height: paneHeights.volH,
    });
    const oiChart = createChart(oiRef.current, {
      ...chartOpts,
      width,
      height: paneHeights.oiH,
      leftPriceScale: { visible: true, borderColor: chartTheme.border },
    });

    chartsRef.current = [priceChart, volChart, oiChart];
    seriesRef.current = {
      candle: priceChart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      }),
      vol: volChart.addSeries(HistogramSeries, {
        color: '#6366f1',
        priceFormat: { type: 'custom', formatter: formatVolAxis },
        priceScaleId: 'right',
      }),
      oiHist: oiChart.addSeries(HistogramSeries, {
        priceFormat: { type: 'custom', formatter: formatOiAxis },
        priceScaleId: 'left',
      }),
      oiLine: oiChart.addSeries(LineSeries, {
        color: '#94a3b8',
        lineWidth: 1,
        priceScaleId: 'left',
        crosshairMarkerVisible: false,
      }),
      delivery: oiChart.addSeries(LineSeries, {
        color: isDark ? '#475569' : '#cbd5e1',
        lineWidth: 1,
        priceScaleId: 'right',
        crosshairMarkerVisible: false,
      }),
    };

    priceChart.priceScale('left').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.05 } });
    oiChart.priceScale('left').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.05 } });
    oiChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.05 } });

    const syncRange = (source: IChartApi, targets: IChartApi[]) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncingRef.current || !range) return;
        syncingRef.current = true;
        targets.forEach((ch) => ch.timeScale().setVisibleLogicalRange(range));
        syncingRef.current = false;
      });
    };
    syncRange(priceChart, [volChart, oiChart]);
    syncRange(volChart, [priceChart, oiChart]);
    syncRange(oiChart, [priceChart, volChart]);

    const onCrosshair = (chart: IChartApi) => {
      chart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          setHover(null);
          return;
        }
        const key = String(param.time);
        const bar = barsRef.current.find((b) => barToChartTime(b) === key);
        if (!bar) return;
        setHover({
          label: bar.label || bar.date,
          buildup: bar.buildupType,
          oi: bar.combinedOi,
          vol: bar.volume,
          close: bar.close,
        });
      });
    };
    onCrosshair(priceChart);
    onCrosshair(volChart);
    onCrosshair(oiChart);

    chartReadyRef.current = true;
    applyBarData(barsRef.current, true);

    return destroyCharts;
  }, [
    bars.length,
    chartOpts,
    chartTheme.border,
    destroyCharts,
    getWidth,
    isDark,
    paneHeights.oiH,
    paneHeights.priceH,
    paneHeights.volH,
    applyBarData,
  ]);

  useEffect(() => {
    if (!chartReadyRef.current) return;
    applyBarData(bars, false);
  }, [bars, applyBarData]);

  useEffect(() => {
    if (!chartReadyRef.current || !wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      const width = getWidth();
      chartsRef.current.forEach((ch) => ch.applyOptions({ width }));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [getWidth, bars.length]);

  const hoverBar = (
    <div
      className="min-h-[36px] px-3 py-2 border-b flex flex-wrap items-center gap-3 text-[11px]"
      style={{
        backgroundColor: chartTheme.hoverBg,
        borderColor: chartTheme.hoverBorder,
      }}
    >
      {hover ? (
        <>
          <span className="font-bold text-gold">{hover.label}</span>
          <span className="text-dark-muted">
            Close <b className="text-slate-100">{hover.close.toLocaleString('en-IN')}</b>
          </span>
          <span className="text-dark-muted">
            Vol <b className="text-indigo-400">{formatVolAxis(hover.vol)}</b>
          </span>
          <span className="text-dark-muted">
            OI <b className="text-slate-200">{formatOiAxis(hover.oi)}</b>
          </span>
          <span className="text-dark-muted">
            Buildup <b className="text-emerald-400">{hover.buildup}</b>
          </span>
        </>
      ) : (
        <span className="text-dark-muted">Hover chart for OHLC · volume · OI · buildup</span>
      )}
    </div>
  );

  if (!bars.length) {
    return (
      <div
        className="app-card flex flex-col items-center justify-center gap-2 text-dark-muted text-sm px-4"
        style={{ height: CHART_HEIGHT }}
      >
        <p>No data for {symbol}.</p>
        <p className="text-xs text-center max-w-md">
          {hasRemoteApi
            ? 'Live server waking up — wait ~1 min or refresh.'
            : 'Run npm run dev to start TradeX server, then refresh.'}
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="app-card overflow-hidden p-0 w-full">
      {hoverBar}
      <div className="border-b border-dark-border relative">
        <span className="absolute left-3 top-1 text-[10px] font-bold text-dark-muted z-10 pointer-events-none">
          Price
        </span>
        <div ref={priceRef} style={{ height: paneHeights.priceH, width: '100%' }} />
      </div>
      <div className="border-b border-dark-border relative">
        <span className="absolute left-3 top-1 text-[10px] font-bold text-dark-muted z-10 pointer-events-none">
          Futures Volume
        </span>
        <div ref={volRef} style={{ height: paneHeights.volH, width: '100%' }} />
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1 text-[10px] font-bold text-dark-muted z-10 pointer-events-none">
          Open Interest & Buildup
        </span>
        <span className="absolute right-3 top-1 text-[10px] font-bold text-dark-muted/60 z-10 pointer-events-none">
          Cash Delivery
        </span>
        <div ref={oiRef} style={{ height: paneHeights.oiH, width: '100%' }} />
      </div>
      <div
        className="flex flex-wrap items-center justify-center gap-3 px-3 py-2 border-t border-dark-border text-[10px] font-semibold text-dark-muted"
        style={{ backgroundColor: chartTheme.legendBg }}
      >
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Candles
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-indigo-500" /> Volume
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Long Buildup
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Short Buildup
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-lime-500" /> Short Covering
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Long Unwinding
        </span>
      </div>
    </div>
  );
}

const FuturesOiTradeXCharts = memo(FuturesOiTradeXChartsInner);
export default FuturesOiTradeXCharts;
