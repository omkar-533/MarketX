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
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { serverUnreachableMessage } from '../../constants/brandLabels';
import {
  levelsNearPrice,
  shapesNearPrice,
  type ChartLevel,
  type ChartShape,
} from '../../utils/chartAnnotations';
import { useTheme } from '../../context/ThemeContext';
import {
  atr,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  stochastic,
  supertrend,
  toHeikinAshi,
  vwap,
} from '../../services/chart/chartIndicators';
import { fetchMarketOhlc, fetchMarketQuotes } from '../../services/marketApiService';
import {
  applyLivePriceToBars,
  quoteMatchesSymbol,
} from '../../services/chart/liveCandleMerge';
import {
  getFyersCachedQuote,
  onFyersMarketUpdate,
  startFyersSocketClient,
  subscribeFyersMarketSymbols,
  unsubscribeFyersMarketSymbols,
} from '../../services/fyersSocketClient';
import { isNseFnoMarketOpen } from '../../utils/marketHours';
import type { ChartBar } from '../../types/chart';
import {
  TV_TIMEFRAMES,
  apiSymbolFromTv,
  nativeIntervalFor,
  parseStudies,
  tradingViewSymbolLabel,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';
import ChartToolRail from './ChartToolRail';
import { useChartDrawings } from './useChartDrawings';
import type { DrawingTool } from '../../services/chart/chartDrawings';

/** TradingView's own candle palette, so the chart reads exactly like theirs. */
const UP = '#26a69a';
const DOWN = '#ef5350';
const UP_FILL = 'rgba(38,166,154,0.5)';
const DOWN_FILL = 'rgba(239,83,80,0.5)';
/** Full OHLC resync (history/volume). Live LTP uses WS + fast quote poll. */
const OHLC_RESYNC_MS = 120_000;
/** Fallback LTP poll when socket is quiet (keeps candle tip moving). */
const QUOTE_POLL_MS = 2_000;

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
  shapes?: ChartShape[];
  /** Our feed has no data for this symbol — the panel can fall back elsewhere. */
  onUnavailable?: () => void;
};

const LEVEL_COLOR: Record<ChartLevel['kind'], string> = {
  support: '#26a69a',
  resistance: '#ef5350',
  pivot: '#787b86',
};

/** Studies drawn over the candles; everything else gets its own pane. */
const OVERLAY_STUDIES = new Set(['ema', 'sma', 'bb', 'vwap', 'supertrend']);

type Legend = { o: number; h: number; l: number; c: number; prevClose: number };
type ChartView = { source: ChartBar[]; closes: number[]; decimals: number };
type IndicatorLine = { label: string; color: string; values: number[]; decimals: number };

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
  shapes,
  onUnavailable,
}: NativeChatChartProps) {
  const { isDark } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  /** Set when the chart is built; pushes a fresh dataset into the live series. */
  const applyRef = useRef<((view: ChartView, fit: boolean) => void) | null>(null);
  const viewRef = useRef<ChartView | null>(null);
  const legendMapRef = useRef<Map<number, number>>(new Map());
  const priceSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const indicatorRef = useRef<IndicatorLine[]>([]);
  const [chartEpoch, setChartEpoch] = useState(0);
  const needFitRef = useRef(true);
  /** Set once the user pans or zooms, after which we stop auto-fitting. */
  const touchedRef = useRef(false);

  const [bars, setBars] = useState<ChartBar[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [fetchedAt, setFetchedAt] = useState('');
  const [liveStreaming, setLiveStreaming] = useState(false);
  const [marketOpen, setMarketOpen] = useState(() => isNseFnoMarketOpen());
  const [legend, setLegend] = useState<Legend | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [magnet, setMagnet] = useState(false);
  const [logScale, setLogScale] = useState(false);

  const apiSymbol = apiSymbolFromTv(symbol);
  const apiInterval = nativeIntervalFor(interval);
  const intraday = interval !== 'D' && interval !== 'W' && interval !== 'M';
  const studies = useMemo(() => parseStudies(study), [study]);
  const studyKey = studies.join(',');

  /** A slow reply for the previous instrument must never repaint the new one. */
  const requestRef = useRef(0);
  const barsRef = useRef<ChartBar[]>([]);
  const liveThrottleRef = useRef(0);
  const lastLiveAtRef = useRef(0);

  const load = useCallback(
    async (background: boolean) => {
      if (!apiInterval) {
        setStatus('error');
        return;
      }
      const token = ++requestRef.current;
      if (!background) {
        setBars([]);
        setStatus('loading');
      }
      // Longer history so Wolf Mentor / pan-left still shows candles (not empty void).
      const range =
        apiInterval === '1d' || apiInterval === '1w'
          ? '1y'
          : apiInterval === '1h' || apiInterval === '2h' || apiInterval === '4h'
            ? '6mo'
            : '3mo';
      const res = await fetchMarketOhlc(apiSymbol, apiInterval, range);
      if (token !== requestRef.current) return;
      const next = res?.bars ?? [];
      if (!next.length) {
        // A background refresh coming back empty should not wipe a good chart.
        if (!background) {
          setBars([]);
          setStatus(res ? 'empty' : 'error');
          onUnavailable?.();
        }
        return;
      }
      barsRef.current = next;
      setBars(next);
      setFetchedAt(res?.fetchedAt ?? new Date().toISOString());
      setStatus('ready');
    },
    [apiSymbol, apiInterval, onUnavailable],
  );

  /** Push LTP into the forming candle + lightweight-charts tip (real-time run). */
  const applyLivePrice = useCallback(
    (price: number, volume?: number) => {
      if (!(price > 0) || !apiInterval || !barsRef.current.length) return;
      const now = Date.now();
      if (now - liveThrottleRef.current < 120) return;
      liveThrottleRef.current = now;

      const merged = applyLivePriceToBars(barsRef.current, price, apiInterval, {
        nowMs: now,
        volume,
      });
      if (!merged) return;
      barsRef.current = merged.bars;
      lastLiveAtRef.current = now;
      setLiveStreaming(true);
      setFetchedAt(new Date(now).toISOString());

      const series = priceSeriesRef.current;
      const bar = merged.updated;
      if (series && chartStyle !== '8') {
        try {
          if (chartStyle === '2' || chartStyle === '3' || chartStyle === '10') {
            series.update({ time: ts(bar.time), value: bar.close });
          } else {
            series.update({
              time: ts(bar.time),
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
            });
          }
        } catch {
          /* series may be mid-rebuild */
        }
      } else {
        setBars(merged.bars);
      }

      setLegend((prev) => {
        const prevClose = prev?.prevClose ?? bar.open;
        return {
          o: bar.open,
          h: bar.high,
          l: bar.low,
          c: bar.close,
          prevClose,
        };
      });
    },
    [apiInterval, chartStyle],
  );

  // Refit the viewport only when the user actually switches instrument/timeframe.
  useEffect(() => {
    needFitRef.current = true;
    touchedRef.current = false;
    setLegend(null);
    setLiveStreaming(false);
  }, [apiSymbol, apiInterval]);

  // TradingView-style session: flip OPEN ↔ CLOSE without waiting for a full reload.
  useEffect(() => {
    const sync = () => setMarketOpen(isNseFnoMarketOpen());
    sync();
    const timer = window.setInterval(sync, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, OHLC_RESYNC_MS);
    return () => window.clearInterval(timer);
  }, [load, reloadKey]);

  // Real-time: Socket.IO ticks + quote poll fallback so the candle tip keeps running.
  useEffect(() => {
    if (!apiSymbol || !apiInterval) return;
    startFyersSocketClient();
    subscribeFyersMarketSymbols([apiSymbol]);

    const cached = getFyersCachedQuote(apiSymbol);
    if (cached?.price) applyLivePrice(cached.price, cached.volume);

    const unsub = onFyersMarketUpdate((payload) => {
      const q = payload.quotes.find((row) => quoteMatchesSymbol(row.symbol, apiSymbol));
      if (q?.price) applyLivePrice(q.price, q.volume);
    });

    const poll = window.setInterval(() => {
      if (document.hidden) return;
      // Prefer cache; if quiet > 3s, hit REST quotes.
      const cachedNow = getFyersCachedQuote(apiSymbol);
      if (cachedNow?.price && Date.now() - lastLiveAtRef.current < 3_000) {
        applyLivePrice(cachedNow.price, cachedNow.volume);
        return;
      }
      void fetchMarketQuotes([apiSymbol]).then((res) => {
        const q = res?.quotes?.find((row) => quoteMatchesSymbol(row.symbol, apiSymbol));
        if (q?.price) applyLivePrice(q.price, q.volume);
      });
    }, QUOTE_POLL_MS);

    const stale = window.setInterval(() => {
      if (Date.now() - lastLiveAtRef.current > 8_000) setLiveStreaming(false);
    }, 2_000);

    return () => {
      unsub();
      unsubscribeFyersMarketSymbols([apiSymbol]);
      window.clearInterval(poll);
      window.clearInterval(stale);
    };
  }, [apiSymbol, apiInterval, applyLivePrice, reloadKey]);

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

    const paneStudies = studies.filter((id) => !OVERLAY_STUDIES.has(id));

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
        rightOffset: 6,
        barSpacing: 6,
        minBarSpacing: 1.5,
        // Do not leave a blank void past the first historical bar when zooming out.
        fixLeftEdge: true,
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
        {
          color,
          lineWidth: width,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
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

    /** Each study registers a feed so a data refresh updates every series at once. */
    const feeds: ((view: ChartView) => IndicatorLine[])[] = [];
    const priceFormatted: ISeriesApi<SeriesType>[] = [];

    for (const id of studies) {
      if (id === 'ema' || id === 'sma') {
        const fn = id === 'ema' ? ema : sma;
        const fast = line('#38bdf8', 1);
        const slow = line('#f59e0b', 1);
        priceFormatted.push(fast, slow);
        feeds.push(({ source, closes, decimals }) => {
          const a = fn(closes, 20);
          const b = fn(closes, 50);
          fast.setData(source.map((bar, i) => ({ time: ts(bar.time), value: a[i] })));
          slow.setData(source.map((bar, i) => ({ time: ts(bar.time), value: b[i] })));
          const name = id.toUpperCase();
          return [
            { label: `${name} 20`, color: '#38bdf8', values: a, decimals },
            { label: `${name} 50`, color: '#f59e0b', values: b, decimals },
          ];
        });
      } else if (id === 'bb') {
        const upper = line('#64748b', 1);
        const mid = line('#38bdf8', 1);
        const lower = line('#64748b', 1);
        priceFormatted.push(upper, mid, lower);
        feeds.push(({ source, closes, decimals }) => {
          const bb = bollinger(closes, 20, 2);
          upper.setData(source.map((bar, i) => ({ time: ts(bar.time), value: bb.upper[i] })));
          mid.setData(source.map((bar, i) => ({ time: ts(bar.time), value: bb.middle[i] })));
          lower.setData(source.map((bar, i) => ({ time: ts(bar.time), value: bb.lower[i] })));
          return [{ label: 'BB 20/2', color: '#38bdf8', values: bb.middle, decimals }];
        });
      } else if (id === 'vwap') {
        const series = line('#a855f7', 2);
        priceFormatted.push(series);
        feeds.push(({ source, decimals }) => {
          const values = vwap(source);
          series.setData(source.map((bar, i) => ({ time: ts(bar.time), value: values[i] })));
          return [{ label: 'VWAP', color: '#a855f7', values, decimals }];
        });
      } else if (id === 'supertrend') {
        const series = line('#26a69a', 2);
        priceFormatted.push(series);
        feeds.push(({ source, decimals }) => {
          const st = supertrend(source, 10, 3);
          series.setData(
            source.map((bar, i) => ({
              time: ts(bar.time),
              value: st.line[i],
              color: st.dir[i] > 0 ? UP : DOWN,
            })),
          );
          return [{ label: 'Supertrend 10/3', color: '#26a69a', values: st.line, decimals }];
        });
      }
    }

    paneStudies.forEach((id, i) => {
      const pane = i + 1;
      if (id === 'rsi') {
        const series = line('#a855f7', 2, pane);
        series.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
        [70, 30].forEach((level) =>
          series.createPriceLine({
            price: level,
            color: theme.border,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
            title: '',
          }),
        );
        feeds.push(({ source, closes }) => {
          const values = rsi(closes, 14);
          series.setData(source.map((bar, j) => ({ time: ts(bar.time), value: values[j] })));
          return [{ label: 'RSI 14', color: '#a855f7', values, decimals: 1 }];
        });
      } else if (id === 'macd') {
        const hist = chart.addSeries(
          HistogramSeries,
          { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } },
          pane,
        );
        const fast = line('#38bdf8', 1, pane);
        const signal = line('#f59e0b', 1, pane);
        feeds.push(({ source, closes }) => {
          const m = macd(closes);
          hist.setData(
            source.map((bar, j) => ({
              time: ts(bar.time),
              value: m.hist[j],
              color: m.hist[j] >= 0 ? UP_FILL : DOWN_FILL,
            })),
          );
          fast.setData(source.map((bar, j) => ({ time: ts(bar.time), value: m.line[j] })));
          signal.setData(source.map((bar, j) => ({ time: ts(bar.time), value: m.signal[j] })));
          return [{ label: 'MACD 12/26/9', color: '#38bdf8', values: m.line, decimals: 2 }];
        });
      } else if (id === 'stoch') {
        const kLine = line('#38bdf8', 1, pane);
        const dLine = line('#f59e0b', 1, pane);
        kLine.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
        [80, 20].forEach((level) =>
          kLine.createPriceLine({
            price: level,
            color: theme.border,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
            title: '',
          }),
        );
        feeds.push(({ source }) => {
          const st = stochastic(source, 14, 3);
          kLine.setData(source.map((bar, j) => ({ time: ts(bar.time), value: st.k[j] })));
          dLine.setData(source.map((bar, j) => ({ time: ts(bar.time), value: st.d[j] })));
          return [{ label: 'Stoch 14/3', color: '#38bdf8', values: st.k, decimals: 1 }];
        });
      } else if (id === 'atr') {
        const series = line('#f59e0b', 2, pane);
        feeds.push(({ source, decimals }) => {
          const values = atr(source, 14);
          series.setData(source.map((bar, j) => ({ time: ts(bar.time), value: values[j] })));
          return [{ label: 'ATR 14', color: '#f59e0b', values, decimals }];
        });
      }
    });

    if (paneStudies.length) {
      const share = Math.min(0.26, 0.62 / paneStudies.length);
      paneStudies.forEach((_, i) => {
        chart.panes()[i + 1]?.setHeight(Math.max(52, Math.round(host.clientHeight * share)));
      });
    }

    applyRef.current = (next, fit) => {
      const { source, closes, decimals } = next;
      const priceFormat = { type: 'price' as const, precision: decimals, minMove: 1 / 10 ** decimals };
      priceSeries.applyOptions({ priceFormat });
      priceFormatted.forEach((s) => s.applyOptions({ priceFormat }));

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

      indicatorRef.current = feeds.flatMap((feed) => feed({ source, closes, decimals }));

      legendMapRef.current = new Map(source.map((b, i) => [b.time, i]));
      setHoverIndex(null);
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
      setHoverIndex(hovered ?? null);
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
      indicatorRef.current = [];
      chart.remove();
    };
    // studyKey stands in for the studies array, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, chartStyle, studyKey, theme, intraday]);

  useEffect(() => {
    if (!view || !applyRef.current) return;
    applyRef.current(view, needFitRef.current);
    needFitRef.current = false;
  }, [view]);

  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ mode: logScale ? 1 : 0 });
  }, [logScale, chartEpoch]);

  // Areas of interest Wolf AI called out, drawn as labelled price lines.
  useEffect(() => {
    const series = priceSeriesRef.current;
    if (!series) return;

    levelLinesRef.current.forEach((lineApi) => series.removePriceLine(lineApi));
    levelLinesRef.current = [];
    if (!levels?.length || !view) return;

    // Skip SUPPORT/RESISTANCE price-lines — those are canvas rays (TV style).
    levelLinesRef.current = levelsNearPrice(levels, view.source[view.source.length - 1]?.close ?? 0)
      .filter((lvl) => !/^(support|resistance)$/i.test(lvl.label || ''))
      .map((lvl) =>
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

  const lastClose = view?.source[view.source.length - 1]?.close ?? 0;
  const aiShapes = useMemo(
    () => (shapes?.length ? shapesNearPrice(shapes, lastClose) : []),
    [shapes, lastClose],
  );

  const drawings = useChartDrawings({
    hostRef,
    canvasRef,
    chartRef,
    seriesRef: priceSeriesRef,
    epoch: chartEpoch,
    bars: view?.source ?? [],
    symbol,
    aiShapes,
    tool,
    onShapeDone: useCallback(() => setTool('cursor'), []),
    magnet,
    isDark,
  });

  const resetView = useCallback(() => {
    touchedRef.current = false;
    chartRef.current?.timeScale().fitContent();
  }, []);

  const saveScreenshot = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const shot = chart.takeScreenshot();
    // The drawing canvas is a separate layer, so it is composited back in.
    const merged = document.createElement('canvas');
    merged.width = shot.width;
    merged.height = shot.height;
    const ctx = merged.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(shot, 0, 0);
    const overlay = canvasRef.current;
    if (overlay) ctx.drawImage(overlay, 0, 0, shot.width, shot.height);

    const link = document.createElement('a');
    link.href = merged.toDataURL('image/png');
    link.download = `${apiSymbol}-${interval}.png`;
    link.click();
  }, [apiSymbol, interval]);

  const label = tradingViewSymbolLabel(symbol);
  const decimals = view?.decimals ?? 2;
  const change = legend ? legend.c - legend.prevClose : 0;
  const changePct = legend && legend.prevClose ? (change / legend.prevClose) * 100 : 0;
  const tone = change >= 0 ? 'mai-nc__up' : 'mai-nc__down';
  const intervalLabel = TV_TIMEFRAMES.find((tf) => tf.id === interval)?.label ?? interval;
  const drawnLevels =
    (levels?.length && view ? levelsNearPrice(levels, lastClose).length : 0) + aiShapes.length;
  const readAt = hoverIndex ?? (view ? view.source.length - 1 : 0);

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
            {indicatorRef.current.length ? (
              <span className="mai-nc__legend-ind">
                {indicatorRef.current.map((ind) => (
                  <span key={ind.label} className="mai-nc__ind">
                    {ind.label}
                    <b style={{ color: ind.color }}>
                      {Number.isFinite(ind.values[readAt])
                        ? ind.values[readAt].toFixed(ind.decimals)
                        : '—'}
                    </b>
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}

        {status === 'ready' ? (
          <div className="mai-nc__quick">
            <button
              type="button"
              className={`mai-nc__quick-btn ${logScale ? 'mai-nc__quick-btn--on' : ''}`}
              onClick={() => setLogScale((v) => !v)}
              title="Logarithmic price scale"
            >
              log
            </button>
            <button
              type="button"
              className="mai-nc__quick-btn"
              onClick={resetView}
              title="Reset chart view"
            >
              fit
            </button>
            <button
              type="button"
              className="mai-nc__quick-btn"
              onClick={saveScreenshot}
              title="Save chart image"
            >
              PNG
            </button>
          </div>
        ) : null}

        {drawnLevels > 0 && status === 'ready' ? (
          <div className="mai-nc__aoi">
            {drawnLevels} area{drawnLevels > 1 ? 's' : ''} of interest · marked by Wolf AI
          </div>
        ) : null}

        {status === 'ready' && fetchedAt ? (
          <div
            className={`mai-nc__stamp ${
              !marketOpen
                ? 'mai-nc__stamp--closed'
                : liveStreaming
                  ? 'mai-nc__stamp--live'
                  : ''
            }`}
            title={
              marketOpen
                ? liveStreaming
                  ? 'Live market feed'
                  : `Last feed ${istFull.format(new Date(fetchedAt))} IST`
                : 'NSE cash / F&O session closed'
            }
          >
            {!marketOpen ? (
              <>CLOSE</>
            ) : liveStreaming ? (
              <>
                <span className="mai-nc__live-dot" aria-hidden />
                LIVE · running
              </>
            ) : (
              <>Feed · {istFull.format(new Date(fetchedAt))} IST</>
            )}
          </div>
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
    </div>
  );
}
