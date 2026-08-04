import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  TickMarkType,
  createChart,
  createTextWatermark,
  type IChartApi,
  type IPriceLine,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { serverUnreachableMessage } from '../../constants/brandLabels';
import { levelsNearPrice, type ChartLevel } from '../../utils/chartAnnotations';
import { useTheme } from '../../context/ThemeContext';
import { bollinger, ema, rsi, toHeikinAshi, vwap } from '../../services/chart/chartIndicators';
import { fetchMarketOhlc } from '../../services/marketApiService';
import type { ChartBar } from '../../types/chart';
import {
  TV_TIMEFRAMES,
  apiSymbolFromTv,
  nativeIntervalFor,
  tradingViewSymbolLabel,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';

/** TradingView's own candle palette, so the chart reads exactly like theirs. */
const UP = '#26a69a';
const DOWN = '#ef5350';
const UP_FILL = 'rgba(38,166,154,0.5)';
const DOWN_FILL = 'rgba(239,83,80,0.5)';
const REFRESH_MS = 60_000;

const IST = 'Asia/Kolkata';
const istTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: 'short' });
const istMonth = new Intl.DateTimeFormat('en-IN', { timeZone: IST, month: 'short' });
const istYear = new Intl.DateTimeFormat('en-IN', { timeZone: IST, year: 'numeric' });

/** Match TradingView's axis: dates at day/month/year boundaries, clock inside a session. */
function formatTickMark(time: Time, type: TickMarkType): string {
  const ms = Number(time) * 1000;
  if (type === TickMarkType.Year) return istYear.format(ms);
  if (type === TickMarkType.Month) return istMonth.format(ms);
  if (type === TickMarkType.DayOfMonth) return istDate.format(ms);
  return istTime.format(ms);
}
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

/** TradingView compares each bar against the previous close, not its own open. */
function legendAt(bars: ChartBar[], index: number): Legend {
  const bar = bars[index];
  return {
    o: bar.open,
    h: bar.high,
    l: bar.low,
    c: bar.close,
    prevClose: index > 0 ? bars[index - 1].close : bar.open,
  };
}

export type NativeChatChartProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
  levels?: ChartLevel[];
};

const LEVEL_COLOR: Record<ChartLevel['kind'], string> = {
  support: '#26a69a',
  resistance: '#ef5350',
  pivot: '#787b86',
};

type Legend = { o: number; h: number; l: number; c: number; prevClose: number };
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
  levels,
}: NativeChatChartProps) {
  const { isDark } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  /** Set when the chart is built; pushes a fresh dataset into the live series. */
  const applyRef = useRef<((view: ChartView, fit: boolean) => void) | null>(null);
  const viewRef = useRef<ChartView | null>(null);
  const legendMapRef = useRef<Map<number, number>>(new Map());
  const priceSeriesRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const [chartEpoch, setChartEpoch] = useState(0);
  const needFitRef = useRef(true);
  /** Set once the user pans or zooms, after which we stop auto-fitting. */
  const touchedRef = useRef(false);

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
    touchedRef.current = false;
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
        ? {
            bg: '#131722',
            text: '#b2b5be',
            grid: '#1e222d',
            border: '#2a2e39',
            crosshair: '#758696',
            label: '#2a2e39',
            watermark: 'rgba(178,181,190,0.09)',
          }
        : {
            bg: '#ffffff',
            text: '#131722',
            grid: '#e0e3eb',
            border: '#d6dcde',
            crosshair: '#9598a1',
            label: '#131722',
            watermark: 'rgba(19,23,34,0.06)',
          },
    [isDark],
  );

  const hasData = bars.length > 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasData) return;

    const lowerPane = study === 'rsi' || study === 'macd';

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { color: theme.bg },
        textColor: theme.text,
        fontSize: 11,
        fontFamily: "'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        attributionLogo: false,
      },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      crosshair: {
        mode: 0,
        vertLine: {
          color: theme.crosshair,
          width: 1,
          style: 3,
          labelBackgroundColor: theme.label,
        },
        horzLine: {
          color: theme.crosshair,
          width: 1,
          style: 3,
          labelBackgroundColor: theme.label,
        },
      },
      rightPriceScale: {
        borderColor: theme.border,
        scaleMargins: { top: 0.08, bottom: 0.24 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: theme.border,
        timeVisible: intraday,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 7,
        tickMarkFormatter: formatTickMark,
      },
      localization: { timeFormatter: (t: Time) => istFull.format(Number(t) * 1000) },
    });
    chartRef.current = chart;

    const mainPane = chart.panes()[0];
    if (mainPane) {
      createTextWatermark(mainPane, {
        horzAlign: 'center',
        vertAlign: 'center',
        lines: [{ text: 'Wolf Trade AI', color: theme.watermark, fontSize: 34, fontStyle: 'bold' }],
      });
    }

    const line = (color: string, width: 1 | 2, pane = 0) =>
      chart.addSeries(
        LineSeries,
        { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
        pane,
      );

    const priceSeries =
      chartStyle === '2'
        ? chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2 })
        : chartStyle === '3' || chartStyle === '10'
          ? chart.addSeries(AreaSeries, {
              lineColor: '#2962ff',
              topColor: 'rgba(41,98,255,0.28)',
              bottomColor: 'rgba(41,98,255,0.02)',
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
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

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
          color: b.close >= b.open ? UP_FILL : DOWN_FILL,
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
            color: m.hist[i] >= 0 ? UP_FILL : DOWN_FILL,
          })),
        );
        macdLine.setData(source.map((b, i) => ({ time: ts(b.time), value: m.line[i] })));
        macdSignal.setData(source.map((b, i) => ({ time: ts(b.time), value: m.signal[i] })));
      }

      legendMapRef.current = new Map(source.map((b, i) => [b.time, i]));
      setLegend(legendAt(source, source.length - 1));
      if (fit) {
        chart.timeScale().fitContent();
        // The card animates in, so the first layout pass can be narrower than final.
        requestAnimationFrame(() => {
          if (!touchedRef.current) chart.timeScale().fitContent();
        });
      }
    };

    chart.subscribeCrosshairMove((param) => {
      const source = viewRef.current?.source;
      if (!source?.length) return;
      const hovered = param.time ? legendMapRef.current.get(Number(param.time)) : undefined;
      setLegend(legendAt(source, hovered ?? source.length - 1));
    });

    priceSeriesRef.current = priceSeries;
    setChartEpoch((n) => n + 1);

    if (viewRef.current) {
      applyRef.current(viewRef.current, needFitRef.current);
      needFitRef.current = false;
    }

    // autoSize keeps the canvas in step; a widened card still needs a refit so
    // candles do not stay bunched on the left with dead space on the right.
    const markTouched = () => {
      touchedRef.current = true;
    };
    host.addEventListener('wheel', markTouched, { passive: true });
    host.addEventListener('pointerdown', markTouched);

    let lastWidth = host.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = hostRef.current?.clientWidth ?? 0;
      if (width === lastWidth) return;
      lastWidth = width;
      if (!touchedRef.current) chart.timeScale().fitContent();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      host.removeEventListener('wheel', markTouched);
      host.removeEventListener('pointerdown', markTouched);
      applyRef.current = null;
      chartRef.current = null;
      priceSeriesRef.current = null;
      levelLinesRef.current = [];
      chart.remove();
    };
  }, [hasData, chartStyle, study, theme, intraday]);

  useEffect(() => {
    if (!view || !applyRef.current) return;
    applyRef.current(view, needFitRef.current);
    needFitRef.current = false;
  }, [view]);

  // Areas of interest Wolf AI called out, drawn as labelled price lines.
  useEffect(() => {
    const series = priceSeriesRef.current;
    if (!series) return;

    levelLinesRef.current.forEach((lineApi) => series.removePriceLine(lineApi));
    levelLinesRef.current = [];
    if (!levels?.length || !view) return;

    const lastClose = view.source[view.source.length - 1]?.close ?? 0;
    levelLinesRef.current = levelsNearPrice(levels, lastClose).map((lvl) =>
      series.createPriceLine({
        price: lvl.price,
        color: LEVEL_COLOR[lvl.kind],
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: lvl.label || lvl.kind,
      }),
    );
  }, [levels, view, chartEpoch]);

  const label = tradingViewSymbolLabel(symbol);
  const decimals = view?.decimals ?? 2;
  const change = legend ? legend.c - legend.prevClose : 0;
  const changePct = legend && legend.prevClose ? (change / legend.prevClose) * 100 : 0;
  const tone = change >= 0 ? 'mai-nc__up' : 'mai-nc__down';
  const intervalLabel = TV_TIMEFRAMES.find((tf) => tf.id === interval)?.label ?? interval;
  const drawnLevels =
    levels?.length && view
      ? levelsNearPrice(levels, view.source[view.source.length - 1]?.close ?? 0).length
      : 0;

  return (
    <div className="mai-tv__frame">
      <div ref={hostRef} className="mai-tv__host" />

      {legend && status === 'ready' ? (
        <div className="mai-nc__legend">
          <span className="mai-nc__legend-sym">{label}</span>
          <span className="mai-nc__legend-tf">{intervalLabel}</span>
          <span className="mai-nc__legend-ohlc">
            <b>O</b>
            <span className={tone}>{legend.o.toFixed(decimals)}</span>
            <b>H</b>
            <span className={tone}>{legend.h.toFixed(decimals)}</span>
            <b>L</b>
            <span className={tone}>{legend.l.toFixed(decimals)}</span>
            <b>C</b>
            <span className={tone}>{legend.c.toFixed(decimals)}</span>
            <span className={tone}>
              {change >= 0 ? '+' : ''}
              {change.toFixed(decimals)} ({change >= 0 ? '+' : ''}
              {changePct.toFixed(2)}%)
            </span>
          </span>
        </div>
      ) : null}

      {drawnLevels > 0 && status === 'ready' ? (
        <div className="mai-nc__aoi">
          {drawnLevels} area{drawnLevels > 1 ? 's' : ''} of interest · marked by Wolf AI
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
