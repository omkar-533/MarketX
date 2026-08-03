import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { serverUnreachableMessage } from '../../constants/brandLabels';
import { useTheme } from '../../context/ThemeContext';
import { bollinger, ema, rsi, toHeikinAshi, vwap } from '../../services/chart/chartIndicators';
import { fetchMarketOhlc } from '../../services/marketApiService';
import type { ChartBar } from '../../types/chart';
import {
  apiSymbolFromTv,
  nativeIntervalFor,
  tradingViewSymbolLabel,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';

const UP = '#10b981';
const DOWN = '#ef4444';
const GOLD = '#d4af37';
const REFRESH_MS = 60_000;

const IST = 'Asia/Kolkata';
const istTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: 'short' });
const istFull = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function macd(closes: number[]) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line = closes.map((_, i) => fast[i] - slow[i]);
  const signal = ema(line, 9);
  return { line, signal, hist: line.map((v, i) => v - signal[i]) };
}

function priceDecimals(bars: ChartBar[]): number {
  const last = bars[bars.length - 1]?.close ?? 0;
  if (last >= 1000) return 1;
  if (last >= 10) return 2;
  return 4;
}

const ts = (t: number) => t as UTCTimestamp;

export type NativeChatChartProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
};

type Legend = { o: number; h: number; l: number; c: number };
type ChartView = { source: ChartBar[]; closes: number[]; decimals: number };

/**
 * Candles drawn from our own market feed. Used for NSE/BSE/MCX symbols, which
 * TradingView refuses to render inside embedded widgets.
 */
export default function NativeChatChart({
  symbol,
  interval,
  study,
  chartStyle,
  reloadKey,
}: NativeChatChartProps) {
  const { isDark } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  /** Set when the chart is built; pushes a fresh dataset into the live series. */
  const applyRef = useRef<((view: ChartView, fit: boolean) => void) | null>(null);
  const viewRef = useRef<ChartView | null>(null);
  const legendMapRef = useRef<Map<number, ChartBar>>(new Map());
  const needFitRef = useRef(true);

  const [bars, setBars] = useState<ChartBar[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [fetchedAt, setFetchedAt] = useState('');
  const [legend, setLegend] = useState<Legend | null>(null);

  const apiSymbol = apiSymbolFromTv(symbol);
  const apiInterval = nativeIntervalFor(interval);
  const intraday = interval !== 'D' && interval !== 'W' && interval !== 'M';

  const load = useCallback(
    async (background: boolean) => {
      if (!apiInterval) {
        setStatus('error');
        return;
      }
      if (!background) setStatus('loading');
      const res = await fetchMarketOhlc(apiSymbol, apiInterval);
      const next = res?.bars ?? [];
      if (!next.length) {
        // A background refresh coming back empty should not wipe a good chart.
        if (!background) {
          setBars([]);
          setStatus(res ? 'empty' : 'error');
        }
        return;
      }
      setBars(next);
      setFetchedAt(res?.fetchedAt ?? new Date().toISOString());
      setStatus('ready');
    },
    [apiSymbol, apiInterval],
  );

  // Refit the viewport only when the user actually switches instrument/timeframe.
  useEffect(() => {
    needFitRef.current = true;
    setLegend(null);
  }, [apiSymbol, apiInterval]);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load, reloadKey]);

  const view = useMemo<ChartView | null>(() => {
    if (!bars.length) return null;
    const source = chartStyle === '8' ? toHeikinAshi(bars) : bars;
    return { source, closes: source.map((b) => b.close), decimals: priceDecimals(source) };
  }, [bars, chartStyle]);
  viewRef.current = view;

  const theme = useMemo(
    () =>
      isDark
        ? { bg: '#0b0e17', text: '#94a3b8', grid: '#1a1f2e', border: '#1a1f2e' }
        : { bg: '#ffffff', text: '#64748b', grid: '#e2e8f0', border: '#c8d4e3' },
    [isDark],
  );

  const hasData = bars.length > 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasData) return;

    const lowerPane = study === 'rsi' || study === 'macd';

    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: { background: { color: theme.bg }, textColor: theme.text, fontSize: 11 },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      crosshair: {
        mode: 1,
        vertLine: { color: theme.text, width: 1, labelBackgroundColor: GOLD },
        horzLine: { color: theme.text, width: 1, labelBackgroundColor: GOLD },
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: {
        borderColor: theme.border,
        timeVisible: intraday,
        secondsVisible: false,
        tickMarkFormatter: (t: Time) =>
          intraday ? istTime.format(Number(t) * 1000) : istDate.format(Number(t) * 1000),
      },
      localization: { timeFormatter: (t: Time) => istFull.format(Number(t) * 1000) },
    });
    chartRef.current = chart;

    const line = (color: string, width: 1 | 2, pane = 0) =>
      chart.addSeries(
        LineSeries,
        { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        pane,
      );

    const priceSeries =
      chartStyle === '2'
        ? chart.addSeries(LineSeries, { color: GOLD, lineWidth: 2 })
        : chartStyle === '3' || chartStyle === '10'
          ? chart.addSeries(AreaSeries, {
              lineColor: GOLD,
              topColor: 'rgba(212,175,55,0.28)',
              bottomColor: 'rgba(212,175,55,0.02)',
              lineWidth: 2,
            })
          : chart.addSeries(CandlestickSeries, {
              upColor: chartStyle === '9' ? 'transparent' : UP,
              downColor: chartStyle === '9' ? 'transparent' : DOWN,
              borderUpColor: UP,
              borderDownColor: DOWN,
              wickUpColor: UP,
              wickDownColor: DOWN,
            });
    const isLineLike = chartStyle === '2' || chartStyle === '3' || chartStyle === '10';

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    const overlays =
      study === 'ema'
        ? [line('#38bdf8', 1), line('#f59e0b', 1)]
        : study === 'bb'
          ? [line('#64748b', 1), line('#38bdf8', 1), line('#64748b', 1)]
          : study === 'vwap'
            ? [line('#a855f7', 2)]
            : [];

    const rsiSeries = study === 'rsi' ? line('#a855f7', 2, 1) : null;
    if (rsiSeries) {
      rsiSeries.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
      [70, 30].forEach((level) =>
        rsiSeries.createPriceLine({
          price: level,
          color: theme.border,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: '',
        }),
      );
    }

    const macdHist =
      study === 'macd'
        ? chart.addSeries(HistogramSeries, { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }, 1)
        : null;
    const macdLine = study === 'macd' ? line('#38bdf8', 1, 1) : null;
    const macdSignal = study === 'macd' ? line('#f59e0b', 1, 1) : null;

    if (lowerPane) {
      chart.panes()[1]?.setHeight(Math.max(56, Math.round(host.clientHeight * 0.26)));
    }

    applyRef.current = (next, fit) => {
      const { source, closes, decimals } = next;
      const priceFormat = { type: 'price' as const, precision: decimals, minMove: 1 / 10 ** decimals };
      priceSeries.applyOptions({ priceFormat });
      overlays.forEach((s) => s.applyOptions({ priceFormat }));

      if (isLineLike) {
        priceSeries.setData(source.map((b) => ({ time: ts(b.time), value: b.close })));
      } else {
        priceSeries.setData(
          source.map((b) => ({
            time: ts(b.time),
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
        );
      }

      volume.setData(
        source.map((b) => ({
          time: ts(b.time),
          value: b.volume,
          color: b.close >= b.open ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
        })),
      );

      const overlayValues =
        study === 'ema'
          ? [ema(closes, 20), ema(closes, 50)]
          : study === 'bb'
            ? (() => {
                const bb = bollinger(closes, 20, 2);
                return [bb.upper, bb.middle, bb.lower];
              })()
            : study === 'vwap'
              ? [vwap(source)]
              : [];
      overlays.forEach((s, i) =>
        s.setData(source.map((b, j) => ({ time: ts(b.time), value: overlayValues[i][j] }))),
      );

      if (rsiSeries) {
        const values = rsi(closes, 14);
        rsiSeries.setData(source.map((b, i) => ({ time: ts(b.time), value: values[i] })));
      }
      if (macdHist && macdLine && macdSignal) {
        const m = macd(closes);
        macdHist.setData(
          source.map((b, i) => ({
            time: ts(b.time),
            value: m.hist[i],
            color: m.hist[i] >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)',
          })),
        );
        macdLine.setData(source.map((b, i) => ({ time: ts(b.time), value: m.line[i] })));
        macdSignal.setData(source.map((b, i) => ({ time: ts(b.time), value: m.signal[i] })));
      }

      legendMapRef.current = new Map(source.map((b) => [b.time, b]));
      const last = source[source.length - 1];
      setLegend({ o: last.open, h: last.high, l: last.low, c: last.close });
      if (fit) chart.timeScale().fitContent();
    };

    chart.subscribeCrosshairMove((param) => {
      const source = viewRef.current?.source;
      if (!source?.length) return;
      const hovered = param.time ? legendMapRef.current.get(Number(param.time)) : undefined;
      const bar = hovered ?? source[source.length - 1];
      setLegend({ o: bar.open, h: bar.high, l: bar.low, c: bar.close });
    });

    if (viewRef.current) {
      applyRef.current(viewRef.current, needFitRef.current);
      needFitRef.current = false;
    }

    const observer = new ResizeObserver(() => {
      const el = hostRef.current;
      if (!el) return;
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      applyRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [hasData, chartStyle, study, theme, intraday]);

  useEffect(() => {
    if (!view || !applyRef.current) return;
    applyRef.current(view, needFitRef.current);
    needFitRef.current = false;
  }, [view]);

  const label = tradingViewSymbolLabel(symbol);
  const decimals = view?.decimals ?? 2;
  const change = legend ? legend.c - legend.o : 0;
  const changePct = legend && legend.o ? (change / legend.o) * 100 : 0;

  return (
    <div className="mai-tv__frame">
      <div ref={hostRef} className="mai-tv__host" />

      {legend && status === 'ready' ? (
        <div className="mai-nc__legend">
          <span className="mai-nc__legend-sym">{label}</span>
          <span>O {legend.o.toFixed(decimals)}</span>
          <span>H {legend.h.toFixed(decimals)}</span>
          <span>L {legend.l.toFixed(decimals)}</span>
          <span>C {legend.c.toFixed(decimals)}</span>
          <span className={change >= 0 ? 'mai-nc__up' : 'mai-nc__down'}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(decimals)} ({changePct.toFixed(2)}%)
          </span>
        </div>
      ) : null}

      {status === 'ready' && fetchedAt ? (
        <div className="mai-nc__stamp">Live feed · {istFull.format(new Date(fetchedAt))} IST</div>
      ) : null}

      {status !== 'ready' ? (
        <div className="mai-tv__overlay">
          {status === 'loading' ? (
            `Loading ${label}…`
          ) : (
            <div className="mai-nc__msg">
              <p>
                {status === 'empty'
                  ? `No candles available for ${label} on this timeframe.`
                  : serverUnreachableMessage()}
              </p>
              <button type="button" className="mai-nc__retry" onClick={() => void load(false)}>
                Retry
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
