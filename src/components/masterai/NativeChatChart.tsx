import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
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
import { barDurationMs, countdownForInterval } from '../../utils/candleCountdown';
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
  cci,
  ema,
  ichimoku,
  macd,
  momentum,
  obv,
  roc,
  rsi,
  sma,
  stochastic,
  supertrend,
  toHeikinAshi,
  vwap,
  williamsR,
} from '../../services/chart/chartIndicators';
import {
  computeWolfClustersVp,
  computeWolfConfluence,
  computeWolfLevels,
  computeWolfPressure,
  computeWolfPulse,
  computeWolfRibbon,
  computeWolfSmc,
  isWolfSmcLabel,
  isWolfStudyId,
  resolveWolfRecipe,
  wolfCmsIdFromStudy,
  wolfStudyBlurb,
  wolfStudyLabel,
  type WolfSmcShape,
} from '../../services/chart/wolfIndicators';
import {
  clustersOptsFromSettings,
  getStudySettingsSchema,
  loadIndicatorSettings,
  saveIndicatorSettings,
} from '../../services/wolfIndicatorSettings';
import { runPineIndicator, type PineRunPlot } from '../../services/indicatorLibrary';
import IndicatorSettingsForm from '../indicators/IndicatorSettingsForm';
import {
  ensurePriceVisible,
  tvZoomPrice,
} from '../../services/chart/chartNavActions';
import { Eye, EyeOff, Settings2, X } from 'lucide-react';
import { fetchMarketOhlc, fetchMarketQuotes } from '../../services/marketApiService';
import {
  applyLivePriceToBars,
  barTimeSec,
  mergeLiveTipIntoHistory,
  quoteMatchesSymbol,
} from '../../services/chart/liveCandleMerge';
import {
  getFyersCachedQuote,
  onFyersMarketTicks,
  startFyersSocketClient,
  subscribeFyersMarketSymbols,
  unsubscribeFyersMarketSymbols,
} from '../../services/fyersSocketClient';
import { getMarketSession } from '../../utils/marketHours';
import type { ChartBar } from '../../types/chart';
import {
  TV_TIMEFRAMES,
  apiSymbolFromTv,
  joinStudies,
  nativeIntervalFor,
  parseStudies,
  technicalStudyLabel,
  tradingViewSymbolLabel,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';
import ChartNavControls from './ChartNavControls';
import ChartContextMenu, { type ChartCtxPayload } from './ChartContextMenu';
import ChartToolRail from './ChartToolRail';
import DrawingObjectToolbar from './DrawingObjectToolbar';
import DrawingSettingsSheet from './DrawingSettingsSheet';
import TerminalTradeStrip from '../terminal/TerminalTradeStrip';
import { useChartDrawings } from './useChartDrawings';
import type { Drawing, DrawingKind, DrawingTool, MagnetMode } from '../../services/chart/chartDrawings';
import { alwaysReleaseCursor, isEphemeralKind } from '../../services/chart/chartDrawings';
import {
  addChartPriceAlert,
  listChartTemplates,
  peekCopiedPrice,
  rememberCopiedPrice,
  saveChartTemplate,
} from '../../services/chart/chartContextActions';
import type { TerminalPaperHandoff } from '../../services/paperTradingBridge';
import { executeTerminalPaperTrade } from '../../services/paperTradingBridge';

/** TradingView's own candle palette, so the chart reads exactly like theirs. */
const UP = '#26a69a';
const DOWN = '#ef5350';
const UP_FILL = 'rgba(38,166,154,0.5)';
const DOWN_FILL = 'rgba(239,83,80,0.5)';
/** Full OHLC resync (history/volume). Live LTP uses WS + fast quote poll. */
const OHLC_RESYNC_MS = 120_000;
/** Fallback quotes when socket is quiet — keep snappy for tip motion. */
const QUOTE_POLL_MS = 500;
/** Soft-expand locked price scale at most this often (ms). */
const PRICE_ENSURE_MS = 180;

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
  /** Stretch the chart frame to fill its parent (Terminal desk). */
  fillHeight?: boolean;
  /** Show the left drawing rail (default true). */
  showRail?: boolean;
  /** When the left edge is visible, fetch older bars and prepend. */
  enableHistoryScroll?: boolean;
  /** Controlled log scale (Terminal bottom bar). */
  logScale?: boolean;
  /** Terminal bottom range chips → visible logical window. */
  rangePreset?: string;
  /** Clear overlay studies (Terminal study string). */
  onClearIndicators?: () => void;
  /** Replace the full study key (comma-joined ids). */
  onStudyChange?: (study: string) => void;
  /** Apply a saved chart template's study key. */
  onApplyStudy?: (study: string) => void;
  /** Paper trade handoff (defaults to session queue + optional navigate). */
  onPaperTrade?: (handoff: TerminalPaperHandoff) => void;
  /** Navigate to another app tab (alerts / paper). */
  onNavigate?: (tab: string) => void;
};

const LEVEL_COLOR: Record<ChartLevel['kind'], string> = {
  support: '#26a69a',
  resistance: '#ef5350',
  pivot: '#787b86',
};

/** Studies drawn over the candles; everything else gets its own pane. */
const OVERLAY_STUDIES = new Set(['ema', 'sma', 'bb', 'vwap', 'supertrend', 'ichimoku']);
const PANE_STUDIES = new Set(['rsi', 'macd', 'stoch', 'atr', 'cci', 'willr', 'obv', 'mom', 'roc']);
const VOLUME_STUDY = 'volume';

type Legend = { o: number; h: number; l: number; c: number; prevClose: number };
type ChartView = { source: ChartBar[]; closes: number[]; decimals: number };
type IndicatorLine = {
  studyId?: string;
  label: string;
  color: string;
  values: number[];
  decimals: number;
  detail?: string;
};

const TECH_LABEL_HINTS: Record<string, string[]> = {
  ema: ['EMA'],
  sma: ['SMA'],
  bb: ['BB'],
  vwap: ['VWAP'],
  supertrend: ['SUPERTREND'],
  ichimoku: ['TENKAN', 'KIJUN'],
  rsi: ['RSI'],
  macd: ['MACD'],
  stoch: ['STOCH'],
  atr: ['ATR'],
  volume: ['VOL'],
  cci: ['CCI'],
  willr: ['WILLIAMS'],
  obv: ['OBV'],
  mom: ['MOM'],
  roc: ['ROC'],
};

function displayStudyName(id: string): string {
  if (isWolfStudyId(id)) return wolfStudyLabel(id);
  return technicalStudyLabel(id);
}

function linesForStudy(id: string, lines: IndicatorLine[]): IndicatorLine[] {
  const tagged = lines.filter((l) => l.studyId === id);
  if (tagged.length) return tagged;
  if (isWolfStudyId(id)) {
    const name = wolfStudyLabel(id);
    return lines.filter((l) => l.label === name || l.label.startsWith(name));
  }
  const hints = TECH_LABEL_HINTS[id] || [id.toUpperCase()];
  return lines.filter((l) => hints.some((h) => l.label.toUpperCase().includes(h)));
}

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
  fillHeight = false,
  showRail = true,
  enableHistoryScroll = false,
  logScale: logScaleProp,
  rangePreset,
  onClearIndicators,
  onStudyChange,
  onApplyStudy,
  onPaperTrade,
  onNavigate,
}: NativeChatChartProps) {
  const { isDark } = useTheme();
  const areaRef = useRef<HTMLDivElement>(null);
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
  const [studyLegend, setStudyLegend] = useState<IndicatorLine[]>([]);
  const [hiddenStudyIds, setHiddenStudyIds] = useState<string[]>([]);
  const [studySettingsId, setStudySettingsId] = useState<string | null>(null);
  const [wolfSettingsRev, setWolfSettingsRev] = useState(0);
  /** Zones / rays / labels from Wolf SMC (and future Pine drawings). */
  const [studyShapes, setStudyShapes] = useState<ChartShape[]>([]);
  const studyShapesTipRef = useRef('');
  const [studyParamValues, setStudyParamValues] = useState<
    Record<string, string | number | boolean>
  >({});
  const [chartEpoch, setChartEpoch] = useState(0);
  const needFitRef = useRef(true);
  /** Set once the user pans or zooms, after which we stop auto-fitting. */
  const touchedRef = useRef(false);
  /** After first layout / user price zoom, freeze Y so live ticks do not bounce the scale. */
  const priceLockedRef = useRef(false);

  const [bars, setBars] = useState<ChartBar[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading');
  const [fetchedAt, setFetchedAt] = useState('');
  const [liveStreaming, setLiveStreaming] = useState(false);
  const [marketOpen, setMarketOpen] = useState(true);
  const [marketSessionLabel, setMarketSessionLabel] = useState('Market session');
  const [legend, setLegend] = useState<Legend | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [magnetMode, setMagnetMode] = useState<MagnetMode>('weak');
  const [snapIndicators, setSnapIndicators] = useState(false);
  const [stayDrawing, setStayDrawing] = useState(false);
  const [lockDrawings, setLockDrawings] = useState(false);
  const [hideDrawings, setHideDrawings] = useState(false);
  const [hideIndicators, setHideIndicators] = useState(false);
  const [hidePositions, setHidePositions] = useState(false);
  const [removeLocked, setRemoveLocked] = useState(false);
  const [valuesTooltip, setValuesTooltip] = useState(false);
  const [logScale, setLogScale] = useState(() => Boolean(logScaleProp));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyExhausted, setHistoryExhausted] = useState(false);
  const [barCountdown, setBarCountdown] = useState<string | null>(null);
  const [barCountdownUrgent, setBarCountdownUrgent] = useState(false);
  /** Pixel Y of live LTP on the right axis — countdown sits just under this. */
  const [axisCdTop, setAxisCdTop] = useState<number | null>(null);
  const [axisCdUp, setAxisCdUp] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<ChartCtxPayload | null>(null);
  const [cursorLocked, setCursorLocked] = useState(false);
  const [panel, setPanel] = useState<'none' | 'settings' | 'objects' | 'table' | 'draw'>('none');
  const [drawSettingsId, setDrawSettingsId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [templatesTick, setTemplatesTick] = useState(0);
  const lockLineIdRef = useRef<string | null>(null);
  const lastPointerRef = useRef<{ price: number; time: number } | null>(null);

  useEffect(() => {
    if (typeof logScaleProp === 'boolean') setLogScale(logScaleProp);
  }, [logScaleProp]);

  // TradingView-style candle close countdown — only while the market session is open.
  useEffect(() => {
    const durOk = Boolean(barDurationMs(interval));
    if (!durOk || !marketOpen) {
      setBarCountdown(null);
      return;
    }
    const tick = () => {
      if (!marketOpen) {
        setBarCountdown(null);
        return;
      }
      const last = barsRef.current[barsRef.current.length - 1];
      const next = countdownForInterval(interval, last?.time);
      if (!next) {
        setBarCountdown(null);
        return;
      }
      setBarCountdown(next.text);
      setBarCountdownUrgent(next.urgent);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [interval, bars.length, status, marketOpen]);

  const apiSymbol = apiSymbolFromTv(symbol);
  const apiInterval = nativeIntervalFor(interval);
  const intraday = interval !== 'D' && interval !== 'W' && interval !== 'M';
  const studies = useMemo(() => parseStudies(study), [study]);
  const plotStudies = useMemo(
    () => studies.filter((id) => !hiddenStudyIds.includes(id)),
    [studies, hiddenStudyIds],
  );
  const studyKey = `${studies.join(',')}|hide:${hiddenStudyIds.slice().sort().join(',')}|cfg:${wolfSettingsRev}`;

  useEffect(() => {
    const onChange = () => setWolfSettingsRev((n) => n + 1);
    window.addEventListener('wolf-indicator-settings-changed', onChange);
    return () => window.removeEventListener('wolf-indicator-settings-changed', onChange);
  }, []);

  useEffect(() => {
    if (!studySettingsId || !isWolfStudyId(studySettingsId)) {
      setStudyParamValues({});
      return;
    }
    setStudyParamValues(loadIndicatorSettings(studySettingsId));
  }, [studySettingsId, wolfSettingsRev]);

  /** A slow reply for the previous instrument must never repaint the new one. */
  const requestRef = useRef(0);
  const barsRef = useRef<ChartBar[]>([]);
  /** rAF id — coalesce legend React updates only; tip paints sync. */
  const liveRafRef = useRef(0);
  const liveStreamingRef = useRef(false);
  const pendingLegendBarRef = useRef<ChartBar | null>(null);
  const lastEnsureMsRef = useRef(0);
  const lastLiveAtRef = useRef(0);
  const haThrottleRef = useRef(0);
  const historyBusyRef = useRef(false);
  const historyExhaustedRef = useRef(false);
  const prependShiftRef = useRef(0);
  const loadOlderRef = useRef<() => void>(() => undefined);

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
      // Background resync must keep the live tip (history often lags LTP).
      let preserved = background ? mergeLiveTipIntoHistory(next, barsRef.current) : next;
      const cached = getFyersCachedQuote(apiSymbol);
      if (cached?.price) {
        const tip = applyLivePriceToBars(preserved, cached.price, apiInterval, {
          volume: cached.volume,
        });
        if (tip) preserved = tip.bars;
      }
      barsRef.current = preserved;
      setBars(preserved);
      setFetchedAt(res?.fetchedAt ?? new Date().toISOString());
      setStatus('ready');
    },
    [apiSymbol, apiInterval, onUnavailable],
  );

  const paintLiveTip = useCallback(
    (bar: ChartBar) => {
      const series = priceSeriesRef.current;
      if (!series || chartStyle === '8') return;
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
        const chart = chartRef.current;
        const now = Date.now();
        if (chart && priceLockedRef.current && now - lastEnsureMsRef.current >= PRICE_ENSURE_MS) {
          lastEnsureMsRef.current = now;
          ensurePriceVisible(chart, bar.high, bar.low);
        }
      } catch {
        /* mid-rebuild — tip retries on next tick */
      }
    },
    [chartStyle],
  );

  /** Push LTP into the forming candle — series.update sync (TradingView-tight tip). */
  const applyLivePrice = useCallback(
    (
      price: number,
      volume?: number,
      extremes?: { high?: number; low?: number },
    ) => {
      if (!(price > 0) || !apiInterval || !barsRef.current.length) return;
      const now = Date.now();

      const merged = applyLivePriceToBars(barsRef.current, price, apiInterval, {
        nowMs: now,
        volume,
        high: extremes?.high,
        low: extremes?.low,
      });
      if (!merged) return;
      barsRef.current = merged.bars;
      lastLiveAtRef.current = now;

      const bar = merged.updated;

      // Heikin Ashi needs a full source rebuild — soft-throttle React setBars only.
      if (chartStyle === '8') {
        if (!liveStreamingRef.current) {
          liveStreamingRef.current = true;
          setLiveStreaming(true);
        }
        if (merged.isNewBar || now - haThrottleRef.current >= 80) {
          haThrottleRef.current = now;
          setBars(merged.bars);
        }
        pendingLegendBarRef.current = bar;
        if (!liveRafRef.current) {
          liveRafRef.current = requestAnimationFrame(() => {
            liveRafRef.current = 0;
            const tip = pendingLegendBarRef.current;
            if (!tip) return;
            setLegend((prev) => ({
              o: tip.open,
              h: tip.high,
              l: tip.low,
              c: tip.close,
              prevClose: prev?.prevClose ?? tip.open,
            }));
          });
        }
        return;
      }

      // Paint candle tip immediately — do not wait for React / rAF.
      paintLiveTip(bar);

      if (!liveStreamingRef.current) {
        liveStreamingRef.current = true;
        setLiveStreaming(true);
      }

      // Legend OHLC via rAF so React re-renders never starve series.update.
      pendingLegendBarRef.current = bar;
      if (!liveRafRef.current) {
        liveRafRef.current = requestAnimationFrame(() => {
          liveRafRef.current = 0;
          const tip = pendingLegendBarRef.current;
          if (!tip) return;
          setLegend((prev) => {
            if (
              prev &&
              prev.o === tip.open &&
              prev.h === tip.high &&
              prev.l === tip.low &&
              prev.c === tip.close
            ) {
              return prev;
            }
            return {
              o: tip.open,
              h: tip.high,
              l: tip.low,
              c: tip.close,
              prevClose: prev?.prevClose ?? tip.open,
            };
          });
        });
      }

      if (merged.isNewBar) {
        setFetchedAt(new Date(now).toISOString());
      }
    },
    [apiInterval, chartStyle, paintLiveTip],
  );

  // Drop hide flags for studies that were removed from the desk.
  useEffect(() => {
    setHiddenStudyIds((prev) => {
      const next = prev.filter((id) => studies.includes(id));
      return next.length === prev.length ? prev : next;
    });
    setStudySettingsId((cur) => (cur && studies.includes(cur) ? cur : null));
  }, [studies]);

  // Refit the viewport only when the user actually switches instrument/timeframe.
  useEffect(() => {
    needFitRef.current = true;
    touchedRef.current = false;
    priceLockedRef.current = false;
    historyBusyRef.current = false;
    historyExhaustedRef.current = false;
    setHistoryExhausted(false);
    setLoadingOlder(false);
    setLegend(null);
    setLiveStreaming(false);
    liveStreamingRef.current = false;
  }, [apiSymbol, apiInterval]);

  const loadOlderBars = useCallback(async () => {
    if (!enableHistoryScroll || !apiInterval || historyBusyRef.current || historyExhaustedRef.current) {
      return;
    }
    const current = barsRef.current;
    if (current.length < 40) return;

    historyBusyRef.current = true;
    setLoadingOlder(true);
    try {
      const nextCount = Math.min(8000, current.length + 1200);
      const range =
        apiInterval === '1d' || apiInterval === '1w' || apiInterval === '1M'
          ? '1y'
          : apiInterval === '1h' || apiInterval === '2h' || apiInterval === '4h'
            ? '1y'
            : '6mo';
      const res = await fetchMarketOhlc(apiSymbol, apiInterval, range, nextCount);
      const fetched = res?.bars ?? [];
      if (!fetched.length) {
        historyExhaustedRef.current = true;
        setHistoryExhausted(true);
        return;
      }
      const firstTime = current[0]?.time ?? 0;
      const older = fetched.filter((b) => b.time < firstTime);
      if (!older.length) {
        historyExhaustedRef.current = true;
        setHistoryExhausted(true);
        return;
      }
      const merged = [...older, ...current];
      const byTime = new Map<number, ChartBar>();
      for (const b of merged) byTime.set(b.time, b);
      const next = [...byTime.values()].sort((a, b) => a.time - b.time);
      const added = next.length - current.length;
      if (added > 0) prependShiftRef.current = added;
      barsRef.current = next;
      setBars(next);
    } finally {
      historyBusyRef.current = false;
      setLoadingOlder(false);
    }
  }, [enableHistoryScroll, apiInterval, apiSymbol]);

  useEffect(() => {
    loadOlderRef.current = () => {
      void loadOlderBars();
    };
  }, [loadOlderBars]);

  // Per-asset session clock (NSE ≠ Gold ≠ Crypto ≠ US).
  useEffect(() => {
    const sync = () => {
      const session = getMarketSession(symbol);
      setMarketOpen(session.open);
      setMarketSessionLabel(session.label);
    };
    sync();
    const timer = window.setInterval(sync, 15_000);
    return () => window.clearInterval(timer);
  }, [symbol]);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => {
      void load(true);
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

    const unsub = onFyersMarketTicks((payload) => {
      const q = payload.quotes.find((row) => quoteMatchesSymbol(row.symbol, apiSymbol));
      if (!q) return;

      // Prefer forming 1m candle close when server includes it (same-TF feel).
      const forming =
        payload.candles?.[apiSymbol] ||
        payload.candles?.[String(q.symbol || '').toUpperCase()] ||
        q.candle;

      let px = Number(q.price) || 0;
      // Bid/ask mid fills gaps between sparse last-print ticks.
      if (!(px > 0) && Number(q.bid) > 0 && Number(q.ask) > 0) {
        px = (Number(q.bid) + Number(q.ask)) / 2;
      }
      if (forming?.close && apiInterval === '1m') {
        px = forming.close;
        applyLivePrice(px, forming.volume ?? q.volume, {
          high: forming.high,
          low: forming.low,
        });
        return;
      }
      if (!(px > 0) && forming?.close) px = forming.close;
      if (px > 0) applyLivePrice(px, q.volume ?? forming?.volume);
    });

    const poll = window.setInterval(() => {
      const quietMs = Date.now() - lastLiveAtRef.current;
      const cachedNow = getFyersCachedQuote(apiSymbol);
      // While ticks are fresh, keep painting tip from hottest cache (no REST wait).
      if (cachedNow?.price && quietMs < 1_500) {
        applyLivePrice(cachedNow.price, cachedNow.volume);
        return;
      }
      void fetchMarketQuotes([apiSymbol]).then((res) => {
        const q = res?.quotes?.find((row) => quoteMatchesSymbol(row.symbol, apiSymbol));
        if (q?.price) applyLivePrice(q.price, q.volume);
      });
    }, QUOTE_POLL_MS);

    const stale = window.setInterval(() => {
      if (Date.now() - lastLiveAtRef.current > 8_000) {
        liveStreamingRef.current = false;
        setLiveStreaming(false);
      }
    }, 2_000);

    return () => {
      unsub();
      unsubscribeFyersMarketSymbols([apiSymbol]);
      window.clearInterval(poll);
      window.clearInterval(stale);
      if (liveRafRef.current) {
        cancelAnimationFrame(liveRafRef.current);
        liveRafRef.current = 0;
      }
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

    const paneStudies = plotStudies.filter((id) => PANE_STUDIES.has(id));
    const wolfStudies = plotStudies.filter((id) => isWolfStudyId(id));
    const showVolume = plotStudies.includes(VOLUME_STUDY);

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
        mode: CrosshairMode.Normal,
        vertLine: {
          color: theme.crosshair,
          width: 1,
          style: 3,
          labelVisible: true,
          labelBackgroundColor: theme.label,
        },
        horzLine: {
          color: theme.crosshair,
          width: 1,
          style: 3,
          labelVisible: true,
          labelBackgroundColor: theme.label,
        },
      },
      rightPriceScale: {
        borderColor: theme.border,
        scaleMargins: { top: 0.08, bottom: 0.24 },
        entireTextOnly: true,
        autoScale: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      timeScale: {
        borderColor: theme.border,
        timeVisible: intraday,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 6,
        minBarSpacing: 1.5,
        // Terminal can pan into older history; chat chart keeps a solid left edge.
        fixLeftEdge: !enableHistoryScroll,
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
        lines: [{ text: 'Wolf AI', color: theme.watermark, fontSize: 34, fontStyle: 'bold' }],
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
        ? chart.addSeries(LineSeries, {
            color: '#2962ff',
            lineWidth: 2,
            lastValueVisible: true,
            priceLineVisible: true,
            priceLineWidth: 1,
            priceLineStyle: LineStyle.Dotted,
          })
        : chartStyle === '3' || chartStyle === '10'
          ? chart.addSeries(AreaSeries, {
              lineColor: '#2962ff',
              topColor: 'rgba(41,98,255,0.28)',
              bottomColor: 'rgba(41,98,255,0.02)',
              lineWidth: 2,
              lastValueVisible: true,
              priceLineVisible: true,
              priceLineWidth: 1,
              priceLineStyle: LineStyle.Dotted,
            })
          : chart.addSeries(CandlestickSeries, {
              upColor: chartStyle === '9' ? 'transparent' : UP,
              downColor: chartStyle === '9' ? 'transparent' : DOWN,
              borderUpColor: UP,
              borderDownColor: DOWN,
              wickUpColor: UP,
              wickDownColor: DOWN,
              lastValueVisible: true,
              priceLineVisible: true,
              priceLineWidth: 1,
              priceLineStyle: LineStyle.Dotted,
            });
    const isLineLike = chartStyle === '2' || chartStyle === '3' || chartStyle === '10';

    const volume = showVolume
      ? chart.addSeries(HistogramSeries, {
          priceScaleId: 'vol',
          priceFormat: { type: 'volume' },
          lastValueVisible: false,
          priceLineVisible: false,
        })
      : null;
    if (volume) {
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }

    /** Each study registers a feed so a data refresh updates every series at once. */
    const feeds: ((view: ChartView) => IndicatorLine[])[] = [];
    const priceFormatted: ISeriesApi<SeriesType>[] = [];
    /** CMS Pine results — source stays server-side; cache avoids re-run every tick. */
    const pinePlotCache = new Map<
      string,
      {
        tip: string;
        plots: PineRunPlot[];
        hlines: Array<{ price: number; color: string }>;
        drawings: Array<{
          type: string;
          tone: 'bull' | 'bear' | 'neutral';
          label: string;
          p1?: number;
          p2?: number;
          i1?: number;
          i2?: number;
          color?: string;
          borderColor?: string;
          fillColor?: string;
          lineStyle?: 'solid' | 'dotted';
        }>;
        version: number;
        nativeSmc?: boolean;
      }
    >();
    const pinePlotInflight = new Set<string>();

    for (const id of plotStudies) {
      if (!OVERLAY_STUDIES.has(id)) continue;
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
          const name = id === 'ema' ? 'EMA' : 'SMA';
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
      } else if (id === 'ichimoku') {
        const tenkan = line('#2962ff', 1);
        const kijun = line('#ef5350', 1);
        const spanA = line('#26a69a', 1);
        const spanB = line('#f23645', 1);
        const chikou = line('#787b86', 1);
        priceFormatted.push(tenkan, kijun, spanA, spanB, chikou);
        feeds.push(({ source, decimals }) => {
          const cloud = ichimoku(source);
          const displace = cloud.displacement;
          tenkan.setData(source.map((bar, i) => ({ time: ts(bar.time), value: cloud.tenkan[i] })));
          kijun.setData(source.map((bar, i) => ({ time: ts(bar.time), value: cloud.kijun[i] })));
          spanA.setData(
            source
              .map((_, i) => {
                const ti = i + displace;
                if (ti >= source.length) return null;
                return { time: ts(source[ti].time), value: cloud.spanA[i] };
              })
              .filter(Boolean) as { time: UTCTimestamp; value: number }[],
          );
          spanB.setData(
            source
              .map((_, i) => {
                const ti = i + displace;
                if (ti >= source.length) return null;
                return { time: ts(source[ti].time), value: cloud.spanB[i] };
              })
              .filter(Boolean) as { time: UTCTimestamp; value: number }[],
          );
          chikou.setData(
            source
              .map((_, i) => {
                const ti = i - displace;
                if (ti < 0) return null;
                return { time: ts(source[ti].time), value: cloud.chikou[i] };
              })
              .filter(Boolean) as { time: UTCTimestamp; value: number }[],
          );
          return [
            { label: 'Tenkan', color: '#2962ff', values: cloud.tenkan, decimals },
            { label: 'Kijun', color: '#ef5350', values: cloud.kijun, decimals },
          ];
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
      } else if (id === 'cci') {
        const series = line('#22d3ee', 2, pane);
        feeds.push(({ source }) => {
          const values = cci(source, 20);
          series.setData(source.map((bar, j) => ({ time: ts(bar.time), value: values[j] })));
          return [{ label: 'CCI 20', color: '#22d3ee', values, decimals: 1 }];
        });
      } else if (id === 'willr') {
        const series = line('#f472b6', 2, pane);
        series.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
        feeds.push(({ source }) => {
          const values = williamsR(source, 14);
          series.setData(source.map((bar, j) => ({ time: ts(bar.time), value: values[j] })));
          return [{ label: 'Williams %R', color: '#f472b6', values, decimals: 1 }];
        });
      } else if (id === 'obv') {
        const series = line('#94a3b8', 2, pane);
        series.applyOptions({ priceFormat: { type: 'volume' } });
        feeds.push(({ source }) => {
          const values = obv(source);
          series.setData(source.map((bar, j) => ({ time: ts(bar.time), value: values[j] })));
          return [{ label: 'OBV', color: '#94a3b8', values, decimals: 0 }];
        });
      } else if (id === 'mom') {
        const series = line('#38bdf8', 2, pane);
        feeds.push(({ source, closes }) => {
          const values = momentum(closes, 10);
          series.setData(source.map((bar, j) => ({ time: ts(bar.time), value: values[j] })));
          return [{ label: 'Momentum 10', color: '#38bdf8', values, decimals: 2 }];
        });
      } else if (id === 'roc') {
        const series = line('#a78bfa', 2, pane);
        feeds.push(({ source, closes }) => {
          const values = roc(closes, 12);
          series.setData(source.map((bar, j) => ({ time: ts(bar.time), value: values[j] })));
          return [{ label: 'ROC 12', color: '#a78bfa', values, decimals: 2 }];
        });
      }
    });

    /* Wolf proprietary packs — plot on chart (no TradingView unlock needed). */
    let wolfPaneCursor = paneStudies.length;
    for (const id of wolfStudies) {
      const recipe = resolveWolfRecipe(id);
      const title = wolfStudyLabel(id);

      if (recipe === 'cfd') {
        const fast = line('#26a69a', 1);
        const mid = line('#42a5f5', 1);
        const slow = line('#ef5350', 2);
        priceFormatted.push(fast, mid, slow);
        feeds.push(({ source, decimals }) => {
          const w = computeWolfConfluence(source);
          fast.setData(source.map((bar, j) => ({ time: ts(bar.time), value: w.emaFast[j] })));
          mid.setData(source.map((bar, j) => ({ time: ts(bar.time), value: w.emaMid[j] })));
          slow.setData(source.map((bar, j) => ({ time: ts(bar.time), value: w.emaSlow[j] })));
          const lean = w.lean[w.lean.length - 1] ?? 0;
          const bull = w.bullScore[w.bullScore.length - 1] ?? 0;
          const bear = w.bearScore[w.bearScore.length - 1] ?? 0;
          return [
            {
              studyId: id,
              label: title,
              detail: `${lean > 0 ? 'Bull' : lean < 0 ? 'Bear' : 'Flat'} ${bull}/${bear}`,
              color: lean > 0 ? '#26a69a' : lean < 0 ? '#ef5350' : '#f0b90b',
              values: w.emaFast,
              decimals,
            },
          ];
        });
      } else if (recipe === 'ribbon') {
        const a = line('#26a69a', 1);
        const b = line('#42a5f5', 1);
        const c = line('#ab47bc', 1);
        const d = line('#ef5350', 2);
        priceFormatted.push(a, b, c, d);
        feeds.push(({ source, decimals }) => {
          const r = computeWolfRibbon(source);
          a.setData(source.map((bar, j) => ({ time: ts(bar.time), value: r.e20[j] })));
          b.setData(source.map((bar, j) => ({ time: ts(bar.time), value: r.e50[j] })));
          c.setData(source.map((bar, j) => ({ time: ts(bar.time), value: r.e100[j] })));
          d.setData(source.map((bar, j) => ({ time: ts(bar.time), value: r.e200[j] })));
          return [{ studyId: id, label: title, detail: 'EMA ribbon', color: '#f0b90b', values: r.e50, decimals }];
        });
      } else if (recipe === 'levels') {
        const hi = line('#ef5350', 1);
        const lo = line('#26a69a', 1);
        priceFormatted.push(hi, lo);
        feeds.push(({ source, decimals }) => {
          const lv = computeWolfLevels(source);
          hi.setData(source.map((bar, j) => ({ time: ts(bar.time), value: lv.swingHigh[j] })));
          lo.setData(source.map((bar, j) => ({ time: ts(bar.time), value: lv.swingLow[j] })));
          return [{ studyId: id, label: title, detail: 'Structure', color: '#f0b90b', values: lv.swingHigh, decimals }];
        });
      } else if (recipe === 'clusters') {
        const clusterColors = [
          '#2196f3',
          '#f44336',
          '#4caf50',
          '#ff9800',
          '#9c27b0',
          '#00bcd4',
          '#ffeb3b',
          '#e91e63',
          '#795548',
          '#607d8b',
        ];
        const pocLines: IPriceLine[] = [];
        const pocSeries = clusterColors.map((color) => {
          const s = line(color, 1);
          s.applyOptions({ lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
          priceFormatted.push(s);
          return s;
        });
        feeds.push(({ source, decimals }) => {
          while (pocLines.length) {
            try {
              priceSeries.removePriceLine(pocLines.pop()!);
            } catch {
              /* series torn down */
            }
          }
          const r = computeWolfClustersVp(
            source,
            clustersOptsFromSettings(loadIndicatorSettings(id)),
          );
          const lookbackStart = Math.max(0, source.length - 200);
          for (let i = 0; i < pocSeries.length; i += 1) {
            const cluster = r.clusters[i];
            if (!cluster) {
              pocSeries[i].setData([]);
              continue;
            }
            pocSeries[i].setData(
              source.slice(lookbackStart).map((bar) => ({ time: ts(bar.time), value: cluster.poc })),
            );
            pocLines.push(
              priceSeries.createPriceLine({
                price: cluster.poc,
                color: cluster.color,
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: `C${cluster.id + 1}`,
              }),
            );
          }
          try {
            const markers = source
              .map((bar, j) => {
                const a = r.assignments[j];
                if (a < 0) return null;
                const cluster = r.clusters.find((c) => c.id === a);
                if (!cluster) return null;
                return {
                  time: ts(bar.time),
                  position: 'inBar' as const,
                  color: cluster.color,
                  shape: 'circle' as const,
                  size: 0.4,
                };
              })
              .filter((m): m is NonNullable<typeof m> => Boolean(m));
            // Candlestick / line series marker API (ignore if unsupported)
            (priceSeries as { setMarkers?: (m: typeof markers) => void }).setMarkers?.(markers);
          } catch {
            /* markers optional */
          }
          const detail = r.clusters.length
            ? `${r.clusters.length} POC · ${r.clusters.map((c) => c.poc.toFixed(decimals)).join(' / ')}`
            : 'No clusters';
          return [
            {
              studyId: id,
              label: title,
              detail,
              color: '#2196f3',
              values: r.clusters[0] ? source.map(() => r.clusters[0].poc) : source.map((b) => b.close),
              decimals,
            },
          ];
        });
      } else if (recipe === 'pulse') {
        wolfPaneCursor += 1;
        const pane = wolfPaneCursor;
        const series = line('#f0b90b', 2, pane);
        const sig = line('#42a5f5', 1, pane);
        series.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
        feeds.push(({ source }) => {
          const p = computeWolfPulse(source);
          series.setData(source.map((bar, j) => ({ time: ts(bar.time), value: p.rsi[j] })));
          sig.setData(source.map((bar, j) => ({ time: ts(bar.time), value: p.signal[j] })));
          return [{ studyId: id, label: title, detail: 'RSI pulse', color: '#f0b90b', values: p.rsi, decimals: 1 }];
        });
      } else if (recipe === 'pressure') {
        wolfPaneCursor += 1;
        const pane = wolfPaneCursor;
        const hist = chart.addSeries(
          HistogramSeries,
          { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } },
          pane,
        );
        feeds.push(({ source }) => {
          const p = computeWolfPressure(source);
          hist.setData(
            source.map((bar, j) => ({
              time: ts(bar.time),
              value: p.pressure[j],
              color: p.pressure[j] >= 0 ? UP_FILL : DOWN_FILL,
            })),
          );
          return [{ studyId: id, label: title, detail: 'Vol pressure', color: '#f0b90b', values: p.pressure, decimals: 2 }];
        });
      } else if (recipe === 'smc') {
        const hi = line('#ef5350', 1);
        const lo = line('#26a69a', 1);
        hi.applyOptions({ lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
        lo.applyOptions({ lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
        priceFormatted.push(hi, lo);
        feeds.push(({ source, decimals }) => {
          const r = computeWolfSmc(source, 5);
          hi.setData(
            source
              .map((bar, j) =>
                Number.isFinite(r.swingHigh[j])
                  ? { time: ts(bar.time), value: r.swingHigh[j] }
                  : null,
              )
              .filter((pt): pt is { time: UTCTimestamp; value: number } => Boolean(pt)),
          );
          lo.setData(
            source
              .map((bar, j) =>
                Number.isFinite(r.swingLow[j])
                  ? { time: ts(bar.time), value: r.swingLow[j] }
                  : null,
              )
              .filter((pt): pt is { time: UTCTimestamp; value: number } => Boolean(pt)),
          );
          const tip = source.length
            ? `${source.length}|${barTimeSec(source[source.length - 1].time)}`
            : '0';
          if (studyShapesTipRef.current !== `${id}|${tip}`) {
            studyShapesTipRef.current = `${id}|${tip}`;
            const chartShapes: ChartShape[] = r.shapes.map((s: WolfSmcShape) => {
              const x1 =
                typeof s.i1 === 'number' && source[s.i1]
                  ? barTimeSec(source[s.i1].time)
                  : undefined;
              const x2 =
                typeof s.i2 === 'number' && source[s.i2]
                  ? barTimeSec(source[s.i2].time)
                  : typeof s.i1 === 'number' && source[Math.min(source.length - 1, (s.i1 || 0) + 12)]
                    ? barTimeSec(source[Math.min(source.length - 1, (s.i1 || 0) + 12)].time)
                    : undefined;
              return {
                type: s.type,
                tone: s.tone,
                label: s.label,
                p1: s.p1,
                p2: s.p2,
                x1,
                x2,
                color: s.color,
                borderColor: s.borderColor,
                fillColor: s.fillColor,
                lineStyle: s.lineStyle,
              };
            });
            queueMicrotask(() => setStudyShapes(chartShapes));
          }
          const detail = `SMC · ${r.bosCount} BOS · ${r.fvgCount} FVG · ${r.obCount} OB`;
          return [
            {
              studyId: id,
              label: title,
              detail,
              color: '#f0b90b',
              values: r.swingHigh.map((v, j) => (Number.isFinite(v) ? v : source[j]?.close ?? NaN)),
              decimals,
            },
          ];
        });
      } else if (recipe === 'pine') {
        const cmsId = wolfCmsIdFromStudy(id);
        if (!cmsId) continue;
        const pineColors = ['#f0b90b', '#26a69a', '#42a5f5', '#ef5350', '#ab47bc', '#ff9800'];
        const pineSeries = pineColors.map((color, idx) => {
          const s = line(color, idx === 0 ? 2 : 1);
          priceFormatted.push(s);
          return s;
        });
        const pineHlines: IPriceLine[] = [];
        feeds.push(({ source, decimals }) => {
          const tipBar = source[source.length - 1];
          // Tip by bar open time + count only — not live LTP (avoids full Pine re-run every tick).
          const tipKey = tipBar ? `${source.length}|${barTimeSec(tipBar.time)}` : '0';
          const settings = loadIndicatorSettings(id);
          const cacheKey = `${cmsId}|${JSON.stringify(settings)}`;
          const cached = pinePlotCache.get(cacheKey);
          if (!cached || cached.tip !== tipKey) {
            if (!pinePlotInflight.has(`${cacheKey}|${tipKey}`)) {
              pinePlotInflight.add(`${cacheKey}|${tipKey}`);
              const barsPayload = source.map((b) => ({
                time: barTimeSec(b.time),
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
                volume: b.volume,
              }));
                  void runPineIndicator(cmsId, { bars: barsPayload, inputs: settings })
                .then((result) => {
                  const pineDrawings = result.drawings || [];
                  const useNativeSmcFallback =
                    isWolfSmcLabel(id, title) && pineDrawings.length === 0;
                  pinePlotCache.set(cacheKey, {
                    tip: tipKey,
                    plots: result.plots,
                    hlines: result.hlines,
                    drawings: pineDrawings,
                    version: result.version,
                    nativeSmc: useNativeSmcFallback,
                  });
                  if (pineDrawings.length) {
                    const chartShapes: ChartShape[] = pineDrawings.map((s) => {
                      const x1 =
                        typeof s.i1 === 'number' && source[s.i1]
                          ? barTimeSec(source[s.i1].time)
                          : undefined;
                      const x2 =
                        typeof s.i2 === 'number' && source[s.i2]
                          ? barTimeSec(source[s.i2].time)
                          : undefined;
                      return {
                        type: (s.type as ChartShape['type']) || 'zone',
                        tone: s.tone || 'neutral',
                        label: s.label || '',
                        p1: s.p1,
                        p2: s.p2,
                        x1,
                        x2,
                        color: s.color,
                        borderColor: s.borderColor,
                        fillColor: s.fillColor,
                        lineStyle: s.lineStyle,
                      };
                    });
                    queueMicrotask(() => setStudyShapes(chartShapes));
                  } else if (useNativeSmcFallback) {
                    const r = computeWolfSmc(source, 5);
                    const chartShapes: ChartShape[] = r.shapes.map((s: WolfSmcShape) => {
                      const x1 =
                        typeof s.i1 === 'number' && source[s.i1]
                          ? barTimeSec(source[s.i1].time)
                          : undefined;
                      const x2 =
                        typeof s.i2 === 'number' && source[s.i2]
                          ? barTimeSec(source[s.i2].time)
                          : typeof s.i1 === 'number' &&
                              source[Math.min(source.length - 1, (s.i1 || 0) + 12)]
                            ? barTimeSec(
                                source[Math.min(source.length - 1, (s.i1 || 0) + 12)].time,
                              )
                            : undefined;
                      return {
                        type: s.type,
                        tone: s.tone,
                        label: s.label,
                        p1: s.p1,
                        p2: s.p2,
                        x1,
                        x2,
                        color: s.color,
                        borderColor: s.borderColor,
                        fillColor: s.fillColor,
                        lineStyle: s.lineStyle,
                      };
                    });
                    queueMicrotask(() => setStudyShapes(chartShapes));
                  }
                  if (viewRef.current && applyRef.current) {
                    applyRef.current(viewRef.current, false);
                  }
                })
                .catch(() => {
                  if (isWolfSmcLabel(id, title)) {
                    const r = computeWolfSmc(source, 5);
                    pinePlotCache.set(cacheKey, {
                      tip: tipKey,
                      plots: [],
                      hlines: [],
                      drawings: [],
                      version: 0,
                      nativeSmc: true,
                    });
                    const chartShapes: ChartShape[] = r.shapes.map((s: WolfSmcShape) => {
                      const x1 =
                        typeof s.i1 === 'number' && source[s.i1]
                          ? barTimeSec(source[s.i1].time)
                          : undefined;
                      const x2 =
                        typeof s.i2 === 'number' && source[s.i2]
                          ? barTimeSec(source[s.i2].time)
                          : undefined;
                      return {
                        type: s.type,
                        tone: s.tone,
                        label: s.label,
                        p1: s.p1,
                        p2: s.p2,
                        x1,
                        x2,
                        color: s.color,
                        borderColor: s.borderColor,
                        fillColor: s.fillColor,
                        lineStyle: s.lineStyle,
                      };
                    });
                    queueMicrotask(() => setStudyShapes(chartShapes));
                    if (viewRef.current && applyRef.current) {
                      applyRef.current(viewRef.current, false);
                    }
                  }
                })
                .finally(() => {
                  pinePlotInflight.delete(`${cacheKey}|${tipKey}`);
                });
            }
          }
          const plots = cached?.plots || [];
          for (let i = 0; i < pineSeries.length; i += 1) {
            const plot = plots[i];
            if (!plot) {
              pineSeries[i].setData([]);
              continue;
            }
            if (plot.color) {
              try {
                pineSeries[i].applyOptions({ color: plot.color });
              } catch {
                /* ignore */
              }
            }
            pineSeries[i].setData(
              source
                .map((bar, j) => {
                  const v = plot.values[j];
                  if (v == null || !Number.isFinite(Number(v))) return null;
                  return { time: ts(bar.time), value: Number(v) };
                })
                .filter((pt): pt is { time: UTCTimestamp; value: number } => Boolean(pt)),
            );
          }
          while (pineHlines.length) {
            try {
              priceSeries.removePriceLine(pineHlines.pop()!);
            } catch {
              /* ignore */
            }
          }
          for (const h of cached?.hlines || []) {
            if (!Number.isFinite(h.price)) continue;
            pineHlines.push(
              priceSeries.createPriceLine({
                price: h.price,
                color: h.color || '#94a3b8',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: '',
              }),
            );
          }
          const primary = plots[0];
          const detail = cached?.nativeSmc
            ? 'SMC · native fallback'
            : primary
              ? `Pine v${cached?.version || ''} · ${primary.title}`
              : 'Running Pine…';
          return [
            {
              studyId: id,
              label: title,
              detail: detail.trim(),
              color: primary?.color || '#f0b90b',
              values: (primary?.values || []).map((v) => (v == null ? NaN : Number(v))),
              decimals,
            },
          ];
        });
      }
    }

    if (paneStudies.length || wolfPaneCursor > paneStudies.length) {
      const paneCount = Math.max(paneStudies.length, wolfPaneCursor);
      const share = Math.min(0.26, 0.62 / Math.max(1, paneCount));
      for (let i = 0; i < paneCount; i += 1) {
        chart.panes()[i + 1]?.setHeight(Math.max(52, Math.round(host.clientHeight * share)));
      }
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

      if (volume) {
        volume.setData(
          source.map((b) => ({
            time: ts(b.time),
            value: b.volume,
            color: b.close >= b.open ? UP_FILL : DOWN_FILL,
          })),
        );
      }

      // Re-apply live tip after setData so OHLC resync never stalls the print.
      const liveTip = barsRef.current[barsRef.current.length - 1];
      const histTip = source[source.length - 1];
      if (
        liveTip &&
        histTip &&
        barTimeSec(liveTip.time) === barTimeSec(histTip.time) &&
        (liveTip.close !== histTip.close ||
          liveTip.high !== histTip.high ||
          liveTip.low !== histTip.low)
      ) {
        try {
          if (isLineLike) {
            priceSeries.update({ time: ts(liveTip.time), value: liveTip.close });
          } else {
            priceSeries.update({
              time: ts(liveTip.time),
              open: liveTip.open,
              high: liveTip.high,
              low: liveTip.low,
              close: liveTip.close,
            });
          }
        } catch {
          /* ignore */
        }
      }

      indicatorRef.current = feeds.flatMap((feed) => feed({ source, closes, decimals }));
      setStudyLegend(indicatorRef.current);

      legendMapRef.current = new Map(source.map((b, i) => [b.time, i]));
      setHoverIndex(null);
      setLegend(legendAt(source, source.length - 1));
      if (fit) {
        chart.timeScale().fitContent();
        // The card animates in, so the first layout pass can be narrower than final.
        requestAnimationFrame(() => {
          if (!touchedRef.current) chart.timeScale().fitContent();
          // Freeze Y after the initial fit so live tip updates do not bounce the scale.
          if (!priceLockedRef.current) {
            try {
              chart.priceScale('right').setAutoScale(false);
              priceLockedRef.current = true;
            } catch {
              /* ignore */
            }
          }
        });
      } else if (priceLockedRef.current) {
        // Preserve locked range after full setData resyncs.
        try {
          chart.priceScale('right').setAutoScale(false);
        } catch {
          /* ignore */
        }
      }
    };

    chart.subscribeCrosshairMove((param) => {
      const source = viewRef.current?.source;
      if (!source?.length) return;
      const hovered = param.time ? legendMapRef.current.get(Number(param.time)) : undefined;
      setHoverIndex(hovered ?? null);
      setLegend(legendAt(source, hovered ?? source.length - 1));

      // Track pointer for context actions — do NOT edge-pan the price scale on hover
      // (that was fighting autoScale / live tip and bouncing the chart).
      if (!param.point) return;
      const price = priceSeries.coordinateToPrice(param.point.y);
      if (price === null || !Number.isFinite(Number(price))) return;
      const t =
        param.time != null
          ? Number(param.time)
          : chart.timeScale().coordinateToTime(param.point.x);
      lastPointerRef.current = {
        price: Number(price),
        time: typeof t === 'number' && Number.isFinite(t) ? t : Date.now() / 1000,
      };
    });

    const onVisibleRange = () => {
      if (!enableHistoryScroll) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return;
      // Near the left edge of loaded history — pull older bars.
      if (range.from < 8) loadOlderRef.current();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRange);

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
    const onWheel = (e: WheelEvent) => {
      touchedRef.current = true;
      const axisW = Math.max(48, chart.priceScale('right').width() || 56);
      const rect = host.getBoundingClientRect();
      const overPriceAxis = e.clientX >= rect.right - axisW - 2;
      if (!overPriceAxis) return;
      e.preventDefault();
      e.stopPropagation();
      const direction = e.deltaY < 0 ? 'in' : 'out';
      let anchor: number | null = null;
      try {
        const y = e.clientY - rect.top;
        const p = priceSeries.coordinateToPrice(y);
        if (p !== null && Number.isFinite(Number(p))) anchor = Number(p);
      } catch {
        anchor = null;
      }
      priceLockedRef.current = true;
      tvZoomPrice(chart, direction, anchor);
    };
    host.addEventListener('wheel', onWheel, { passive: false, capture: true });
    host.addEventListener('pointerdown', markTouched);

    let lastWidth = host.clientWidth;
    let lastHeight = host.clientHeight;
    const observer = new ResizeObserver(() => {
      const el = hostRef.current;
      if (!el) return;
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      // Force light-weight charts to accept the new box (autoSize can lag on first flex settle).
      try {
        chart.resize(width, height, true);
      } catch {
        /* chart may be mid-remove */
      }
      if (!touchedRef.current) chart.timeScale().fitContent();
    });
    observer.observe(host);
    // First paint: flex parents often settle after createChart — nudge once more.
    requestAnimationFrame(() => {
      const el = hostRef.current;
      if (!el || !chartRef.current) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        try {
          chart.resize(w, h, true);
        } catch {
          /* ignore */
        }
        if (!touchedRef.current) chart.timeScale().fitContent();
      }
    });

    return () => {
      observer.disconnect();
      host.removeEventListener('wheel', onWheel, true);
      host.removeEventListener('pointerdown', markTouched);
      host.removeEventListener('pointerdown', markTouched);
      applyRef.current = null;
      chartRef.current = null;
      priceSeriesRef.current = null;
      levelLinesRef.current = [];
      indicatorRef.current = [];
      setStudyLegend([]);
      setStudySettingsId(null);
      chart.remove();
    };
    // studyKey stands in for the studies array, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, chartStyle, studyKey, theme, intraday, enableHistoryScroll]);

  useEffect(() => {
    if (!view || !applyRef.current) return;
    const chart = chartRef.current;
    const shift = prependShiftRef.current;
    const range = shift > 0 ? chart?.timeScale().getVisibleLogicalRange() : null;
    applyRef.current(view, needFitRef.current);
    needFitRef.current = false;
    if (shift > 0 && range && chart) {
      prependShiftRef.current = 0;
      chart.timeScale().setVisibleLogicalRange({
        from: range.from + shift,
        to: range.to + shift,
      });
    }
  }, [view]);

  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ mode: logScale ? 1 : 0 });
  }, [logScale, chartEpoch]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !rangePreset) return;
    const bars = barsRef.current.length;
    if (bars < 2) return;
    if (rangePreset === 'All') {
      chart.timeScale().fitContent();
      return;
    }
    const VISIBLE: Record<string, number> = {
      '1D': 90,
      '5D': 450,
      '1M': 1400,
      '3M': 2800,
      '6M': 4000,
      YTD: 3200,
      '1Y': 5000,
      '5Y': 9000,
    };
    const n = VISIBLE[rangePreset] ?? 120;
    const from = Math.max(-10, bars - n);
    chart.timeScale().setVisibleLogicalRange({ from, to: bars + 4 });
  }, [rangePreset, chartEpoch, view]);

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

  // Keep AI drawings inside the visible price scale — otherwise priceToCoordinate
  // returns null and trend/OB/liq marks silently vanish off-canvas.
  useEffect(() => {
    const series = priceSeriesRef.current;
    if (!series) return;
    const prices: number[] = [];
    for (const s of shapes ?? []) {
      if (typeof s.p1 === 'number' && s.p1 > 0) prices.push(s.p1);
      if (typeof s.p2 === 'number' && s.p2 > 0) prices.push(s.p2);
    }
    for (const l of levels ?? []) {
      if (typeof l.price === 'number' && l.price > 0) prices.push(l.price);
    }
    if (!prices.length) {
      series.applyOptions({ autoscaleInfoProvider: undefined });
      return;
    }
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    series.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const base = original();
        if (!base?.priceRange) {
          return { priceRange: { minValue: lo * 0.998, maxValue: hi * 1.002 } };
        }
        return {
          priceRange: {
            minValue: Math.min(base.priceRange.minValue, lo),
            maxValue: Math.max(base.priceRange.maxValue, hi),
          },
        };
      },
    });
  }, [shapes, levels, chartEpoch]);

  const lastClose = view?.source[view.source.length - 1]?.close ?? 0;
  const aiShapes = useMemo(() => {
    const merged = [...(shapes ?? []), ...studyShapes];
    return merged.length ? shapesNearPrice(merged, lastClose) : [];
  }, [shapes, studyShapes, lastClose]);

  // Clear study drawings when Wolf SMC / Pine studies are turned off.
  useEffect(() => {
    const hasDrawStudy = studies.some((id) => {
      if (!isWolfStudyId(id)) return false;
      const r = resolveWolfRecipe(id);
      return r === 'smc' || r === 'pine';
    });
    if (!hasDrawStudy) {
      setStudyShapes([]);
      studyShapesTipRef.current = '';
    }
  }, [studies]);

  // Pin countdown under the live price label on the right price axis (TV behaviour).
  useEffect(() => {
    if (!barCountdown || status !== 'ready' || chartEpoch <= 0) {
      setAxisCdTop(null);
      return;
    }

    const sync = () => {
      const series = priceSeriesRef.current;
      const chart = chartRef.current;
      const host = hostRef.current;
      const bars = barsRef.current;
      const last = bars[bars.length - 1];
      if (!series || !chart || !host || !last) {
        setAxisCdTop(null);
        return;
      }
      const y = series.priceToCoordinate(last.close);
      if (y == null || !Number.isFinite(Number(y))) {
        setAxisCdTop(null);
        return;
      }
      const paneH = chart.panes()[0]?.getHeight() ?? host.clientHeight;
      // LWC last-value chip is ~18px tall; sit flush under it.
      const top = Math.min(paneH - 22, Math.max(2, Number(y) + 12));
      // Match forming candle body: green when close ≥ open, else red.
      setAxisCdTop(top);
      setAxisCdUp(Number(last.close) >= Number(last.open));
    };

    sync();
    const id = window.setInterval(sync, 200);
    const chart = chartRef.current;
    const onRange = () => sync();
    try {
      chart?.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    } catch {
      /* chart disposing */
    }
    return () => {
      window.clearInterval(id);
      try {
        chart?.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      } catch {
        /* ignore */
      }
    };
  }, [barCountdown, status, chartEpoch, lastClose, liveStreaming]);

  const stayRef = useRef(stayDrawing);
  stayRef.current = stayDrawing;

  const drawings = useChartDrawings({
    areaRef,
    hostRef,
    canvasRef,
    chartRef,
    seriesRef: priceSeriesRef,
    epoch: chartEpoch,
    bars: view?.source ?? [],
    symbol,
    aiShapes,
    tool,
    onShapeDone: useCallback((info?: { kind: DrawingKind }) => {
      // Measure / zoom always free the cursor. Stay-drawing only keeps other tools armed.
      if (!info?.kind || alwaysReleaseCursor(info.kind) || !stayRef.current) {
        setTool('cursor');
      }
    }, []),
    onOpenDrawingSettings: useCallback((id: string) => {
      setDrawSettingsId(id);
      setPanel('draw');
    }, []),
    magnetMode,
    lockDrawings,
    hideDrawings,
    hideIndicators,
    removeLocked,
    isDark,
  });

  const selectedDrawing =
    drawings.selectedId != null
      ? drawings.drawings.find((d) => d.id === drawings.selectedId) ?? null
      : null;

  const settingsDrawing =
    drawSettingsId != null
      ? drawings.drawings.find((d) => d.id === drawSettingsId) ?? selectedDrawing
      : null;

  const onHideMode = useCallback(
    (mode: 'drawings' | 'indicators' | 'positions' | 'all' | 'none') => {
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
    },
    [],
  );

  const resetView = useCallback(() => {
    touchedRef.current = false;
    priceLockedRef.current = false;
    const chart = chartRef.current;
    if (!chart) return;
    // TradingView reset = default zoom + realtime edge, not fit-all history.
    chart.priceScale('right').setAutoScale(true);
    chart.timeScale().resetTimeScale();
    // Re-lock after a frame so live ticks do not immediately bounce Y again.
    requestAnimationFrame(() => {
      try {
        chart.priceScale('right').setAutoScale(false);
        priceLockedRef.current = true;
      } catch {
        /* ignore */
      }
    });
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }, []);

  const pointerPrice = useCallback(() => {
    return (
      lastPointerRef.current?.price ??
      legend?.c ??
      viewRef.current?.source[viewRef.current.source.length - 1]?.close ??
      0
    );
  }, [legend]);

  const paperHandoff = useCallback(
    (partial: Omit<TerminalPaperHandoff, 'tvSymbol' | 'at'>) => {
      const handoff: TerminalPaperHandoff = {
        tvSymbol: symbol,
        at: new Date().toISOString(),
        ...partial,
      };
      const result = executeTerminalPaperTrade(handoff);
      showToast(result.message);
      onPaperTrade?.(handoff);
    },
    [symbol, onPaperTrade, showToast],
  );

  const copyPrice = useCallback(
    async (price: number) => {
      const text = price.toLocaleString('en-US', { maximumFractionDigits: 8 });
      rememberCopiedPrice(price);
      try {
        await navigator.clipboard.writeText(text);
        showToast(`Copied ${text}`);
      } catch {
        showToast('Copy failed');
      }
    },
    [showToast],
  );

  const pastePriceLine = useCallback(async () => {
    let price = peekCopiedPrice();
    try {
      const clip = (await navigator.clipboard.readText()).replace(/,/g, '').trim();
      const n = Number(clip);
      if (Number.isFinite(n) && n > 0) price = n;
    } catch {
      /* permission / empty */
    }
    if (price == null || !Number.isFinite(price)) {
      showToast('Clipboard has no price');
      return;
    }
    const bars = viewRef.current?.source ?? [];
    const t = lastPointerRef.current?.time ?? bars[bars.length - 1]?.time ?? Date.now() / 1000;
    drawings.addDrawing({
      id: `paste-${Date.now()}`,
      kind: 'hline',
      points: [{ time: t, price }],
      color: '#2962ff',
      label: price.toLocaleString('en-US', { maximumFractionDigits: 4 }),
    });
    showToast(`Pasted line @ ${price.toLocaleString('en-US')}`);
  }, [drawings, showToast]);

  const addAlertAt = useCallback(
    (price: number) => {
      addChartPriceAlert(apiSymbol, price);
      showToast(`Alert on ${apiSymbol} @ ${price.toLocaleString('en-US')}`);
      onNavigate?.('alerts');
    },
    [apiSymbol, showToast, onNavigate],
  );

  const toggleLockCursor = useCallback(() => {
    const bars = viewRef.current?.source ?? [];
    const time = lastPointerRef.current?.time ?? bars[bars.length - 1]?.time;
    const price = pointerPrice();
    if (!time) return;
    if (lockLineIdRef.current) {
      const id = lockLineIdRef.current;
      drawings.replaceAll(drawings.drawings.filter((d) => d.id !== id));
      lockLineIdRef.current = null;
      setCursorLocked(false);
      showToast('Cursor unlocked');
      return;
    }
    const id = `vlock-${Date.now()}`;
    drawings.addDrawing({
      id,
      kind: 'vline',
      points: [{ time, price }],
      color: '#787b86',
      label: 'Lock',
      locked: true,
    });
    lockLineIdRef.current = id;
    setCursorLocked(true);
    showToast('Vertical cursor locked');
  }, [drawings, pointerPrice, showToast]);

  // Right-click context menu (TradingView control menu).
  useEffect(() => {
    const area = areaRef.current;
    if (!area || status !== 'ready') return;
    const onCtx = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const chart = chartRef.current;
      const series = priceSeriesRef.current;
      const host = hostRef.current;
      if (!chart || !series || !host) return;
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const rawPrice = series.coordinateToPrice(y);
      const rawTime = chart.timeScale().coordinateToTime(x);
      const price =
        rawPrice != null && Number.isFinite(Number(rawPrice))
          ? Number(rawPrice)
          : pointerPrice();
      const time =
        typeof rawTime === 'number' && Number.isFinite(rawTime)
          ? rawTime
          : lastPointerRef.current?.time ?? Date.now() / 1000;
      lastPointerRef.current = { price, time };
      setCtxMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        price,
        symbolLabel: tradingViewSymbolLabel(symbol),
        shortSymbol: apiSymbol,
        drawingCount: drawings.drawings.filter((d) => !isEphemeralKind(d.kind)).length,
        indicatorCount: studies.length,
        cursorLocked,
      });
    };
    area.addEventListener('contextmenu', onCtx);
    return () => area.removeEventListener('contextmenu', onCtx);
  }, [status, chartEpoch, symbol, apiSymbol, drawings.drawings, studies.length, pointerPrice]);

  // Chart hotkeys (same shortcuts as TradingView menu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!areaRef.current) return;
      const price = pointerPrice();
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        resetView();
        return;
      }
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        addAlertAt(price);
        return;
      }
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        paperHandoff({ side: 'SELL', qty: 1, price, orderType: 'LIMIT' });
        return;
      }
      if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        paperHandoff({ side: 'BUY', qty: 1, price, orderType: 'LIMIT' });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        void pastePriceLine();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pointerPrice, resetView, addAlertAt, paperHandoff, pastePriceLine, showToast]);

  const label = tradingViewSymbolLabel(symbol);
  const decimals = view?.decimals ?? 2;
  const change = legend ? legend.c - legend.prevClose : 0;
  const changePct = legend && legend.prevClose ? (change / legend.prevClose) * 100 : 0;
  const tone = change >= 0 ? 'mai-nc__up' : 'mai-nc__down';
  const intervalLabel = TV_TIMEFRAMES.find((tf) => tf.id === interval)?.label ?? interval;
  const drawnLevels =
    (levels?.length && view ? levelsNearPrice(levels, lastClose).length : 0) + aiShapes.length;
  const readAt = hoverIndex ?? (view ? view.source.length - 1 : 0);
  const templates = listChartTemplates();
  void templatesTick;

  const studyChips = studies.map((id) => {
    const lines = linesForStudy(id, studyLegend);
    const primary = lines[0];
    const hidden = hiddenStudyIds.includes(id);
    const values = lines
      .slice(0, 3)
      .map((line) => {
        const v = line.values[readAt];
        return Number.isFinite(v) ? v.toFixed(line.decimals) : '—';
      })
      .join(' · ');
    return {
      id,
      name: displayStudyName(id),
      color: primary?.color || (isWolfStudyId(id) ? '#f0b90b' : '#38bdf8'),
      values: hidden ? 'hidden' : values || '—',
      detail: primary?.detail,
      hidden,
      wolf: isWolfStudyId(id),
    };
  });

  const removeStudy = (id: string) => {
    const next = studies.filter((s) => s !== id);
    onStudyChange?.(joinStudies(next));
    setHiddenStudyIds((prev) => prev.filter((x) => x !== id));
    setStudySettingsId((cur) => (cur === id ? null : cur));
  };

  const toggleStudyHidden = (id: string) => {
    setHiddenStudyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div
      className={`mai-tv__frame mai-tv__frame--tools ${fillHeight ? 'mai-tv__frame--fill' : ''}`}
    >
      {showRail ? (
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
          indicatorCount={studies.length}
          onUndo={drawings.undo}
          onClearDrawings={drawings.clear}
          onClearIndicators={() => {
            /* studies live on parent study prop — clear via rail stub */
          }}
          onClearAll={() => {
            drawings.clear();
          }}
          removeLocked={removeLocked}
          onRemoveLocked={setRemoveLocked}
          valuesTooltip={valuesTooltip}
          onValuesTooltip={setValuesTooltip}
          variant={fillHeight ? 'desk' : 'chat'}
        />
      ) : null}

      <div
        ref={areaRef}
        className="mai-nc__area"
        data-drawing={
          tool === 'cursor' || tool === 'crosshair' || tool === 'dot' || tool === 'arrowCursor'
            ? undefined
            : 'on'
        }
        data-tool={tool}
        data-cursor={tool === 'dot' ? 'dot' : tool === 'arrowCursor' ? 'arrow' : undefined}
        data-tooltip={valuesTooltip ? 'on' : undefined}
        data-hide-pos={hidePositions ? 'on' : undefined}
      >
        <div ref={hostRef} className="mai-tv__host" />
        <canvas ref={canvasRef} className="mai-nc__draw" />

        {loadingOlder ? (
          <div className="mai-nc__history-load" aria-live="polite">
            Loading older bars…
          </div>
        ) : null}
        {historyExhausted && enableHistoryScroll ? (
          <div className="mai-nc__history-load mai-nc__history-load--done">Oldest loaded</div>
        ) : null}

        {legend && status === 'ready' ? (
          <div className="mai-nc__legend">
            <div className="mai-nc__legend-head">
              <span className="mai-nc__legend-sym">{label}</span>
              <span className="mai-nc__legend-tf">{intervalLabel}</span>
              {!marketOpen ? (
                <span className="mai-nc__session mai-nc__session--closed" title={marketSessionLabel}>
                  CLOSE
                </span>
              ) : liveStreaming ? (
                <span className="mai-nc__session mai-nc__session--live" title={marketSessionLabel}>
                  LIVE
                </span>
              ) : (
                <span className="mai-nc__session mai-nc__session--live" title={marketSessionLabel}>
                  OPEN
                </span>
              )}
            </div>
            {fillHeight ? (
              <TerminalTradeStrip
                symbol={symbol}
                variant="legend"
                onTrade={(side, qty, livePx) =>
                  paperHandoff({
                    side,
                    qty,
                    price: livePx && livePx > 0 ? livePx : legend.c,
                    orderType: 'MARKET',
                  })
                }
              />
            ) : null}
            <span className="mai-nc__legend-ohlc">
              <b>O</b>
              <span className={tone}>{legend.o.toFixed(decimals)}</span>
              <b>H</b>
              <span className={tone}>{legend.h.toFixed(decimals)}</span>
              <b>L</b>
              <span className={tone}>{legend.l.toFixed(decimals)}</span>
              <b>C</b>
              <span className={tone}>{legend.c.toFixed(decimals)}</span>
              <span className={`mai-nc__legend-chg ${tone}`}>
                {change >= 0 ? '+' : ''}
                {change.toFixed(decimals)} ({change >= 0 ? '+' : ''}
                {changePct.toFixed(2)}%)
              </span>
            </span>
            {studyChips.length ? (
              <div className="mai-nc__legend-studies">
                {studyChips.map((chip) => (
                  <div
                    key={chip.id}
                    className={`mai-nc__study-chip ${chip.wolf ? 'mai-nc__study-chip--wolf' : ''} ${
                      chip.hidden ? 'is-hidden' : ''
                    } ${studySettingsId === chip.id ? 'is-open' : ''}`}
                  >
                    <button
                      type="button"
                      className="mai-nc__study-chip-main"
                      title={chip.name}
                      onClick={() =>
                        setStudySettingsId((cur) => (cur === chip.id ? null : chip.id))
                      }
                    >
                      <i className="mai-nc__study-swatch" style={{ background: chip.color }} />
                      <span className="mai-nc__study-name">{chip.name}</span>
                      {chip.detail ? <em className="mai-nc__study-detail">{chip.detail}</em> : null}
                      <b style={{ color: chip.color }}>{chip.values}</b>
                    </button>
                    <span className="mai-nc__study-chip-acts">
                      <button
                        type="button"
                        title={chip.hidden ? 'Show' : 'Hide'}
                        aria-label={chip.hidden ? 'Show indicator' : 'Hide indicator'}
                        onClick={() => toggleStudyHidden(chip.id)}
                      >
                        {chip.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        title="Settings"
                        aria-label="Indicator settings"
                        onClick={() =>
                          setStudySettingsId((cur) => (cur === chip.id ? null : chip.id))
                        }
                      >
                        <Settings2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Remove"
                        aria-label="Remove indicator"
                        onClick={() => removeStudy(chip.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {status === 'ready' && marketOpen && barCountdown && axisCdTop != null ? (
          <div
            className={`mai-nc__bar-cd mai-nc__bar-cd--axis ${
              barCountdownUrgent ? 'mai-nc__bar-cd--urgent' : ''
            } ${axisCdUp ? 'mai-nc__bar-cd--up' : 'mai-nc__bar-cd--dn'}`}
            style={{ top: axisCdTop }}
            title="Time until this candle closes"
          >
            <span className="mai-nc__bar-cd-val">{barCountdown}</span>
          </div>
        ) : null}

        {status === 'ready' && !fillHeight ? (
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

        {status === 'ready' && chartEpoch > 0 ? (
          <ChartNavControls
            chart={chartRef.current}
            anchorRef={areaRef}
            onReset={resetView}
            onInteract={() => {
              touchedRef.current = true;
            }}
          />
        ) : null}

        {status === 'ready' && selectedDrawing ? (
          <DrawingObjectToolbar
            drawing={selectedDrawing}
            anchorRef={areaRef}
            onPatch={(patch) => {
              if (selectedDrawing) drawings.updateDrawing(selectedDrawing.id, patch);
            }}
            onOpenSettings={() => {
              setDrawSettingsId(selectedDrawing.id);
              setPanel('draw');
            }}
            onClone={() => drawings.cloneSelected()}
            onRemove={() => drawings.removeSelected()}
            onReorder={(dir) => drawings.reorderSelected(dir)}
          />
        ) : null}

        {status === 'ready' ? (
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
                  ? marketSessionLabel
                  : fetchedAt
                    ? `Last feed ${istFull.format(new Date(fetchedAt))} IST · ${marketSessionLabel}`
                    : marketSessionLabel
                : marketSessionLabel
            }
          >
            {!marketOpen ? (
              <>Market closed</>
            ) : liveStreaming ? (
              <>
                <span className="mai-nc__live-dot" aria-hidden />
                LIVE · running
              </>
            ) : fetchedAt ? (
              <>Feed · {istFull.format(new Date(fetchedAt))} IST</>
            ) : (
              <>OPEN</>
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

        {toast ? <div className="mai-nc__toast">{toast}</div> : null}

        {studySettingsId && status === 'ready' ? (
          <div className="mai-nc__study-sheet" role="dialog" aria-label="Indicator settings">
            <div className="mai-nc__study-sheet-head">
              <b>{displayStudyName(studySettingsId)}</b>
              <button type="button" onClick={() => setStudySettingsId(null)} aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mai-nc__study-sheet-blurb">
              {isWolfStudyId(studySettingsId)
                ? wolfStudyBlurb(studySettingsId)
                : technicalStudyLabel(studySettingsId)}
            </p>
            {isWolfStudyId(studySettingsId) && getStudySettingsSchema(studySettingsId).length ? (
              <div className="mai-nc__study-sheet-params">
                <IndicatorSettingsForm
                  dense
                  fields={getStudySettingsSchema(studySettingsId)}
                  values={studyParamValues}
                  onChange={(next) => {
                    setStudyParamValues(next);
                    saveIndicatorSettings(studySettingsId, next);
                  }}
                />
              </div>
            ) : null}
            <div className="mai-nc__study-sheet-actions">
              <button type="button" onClick={() => toggleStudyHidden(studySettingsId)}>
                {hiddenStudyIds.includes(studySettingsId) ? (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Show on chart
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5" /> Hide on chart
                  </>
                )}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => removeStudy(studySettingsId)}
              >
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
            <p className="mai-nc__study-sheet-hint">
              Adjust inputs above — Pine Script source is never shown. Hide or remove the study anytime.
            </p>
          </div>
        ) : null}

        {panel === 'settings' ? (
          <div className="mai-nc__sheet" role="dialog" aria-label="Chart settings">
            <header className="mai-nc__sheet-h">
              <b>Settings</b>
              <button type="button" onClick={() => setPanel('none')}>
                Close
              </button>
            </header>
            <div className="mai-nc__sheet-body">
              <button
                type="button"
                className={logScale ? 'on' : ''}
                onClick={() => setLogScale((v) => !v)}
              >
                Logarithmic scale
              </button>
              <button type="button" onClick={resetView}>
                Auto price scale + reset time
              </button>
              <button type="button" onClick={() => setHideDrawings((v) => !v)}>
                {hideDrawings ? 'Show drawings' : 'Hide drawings'}
              </button>
              <button type="button" onClick={() => setHideIndicators((v) => !v)}>
                {hideIndicators ? 'Show indicators' : 'Hide indicators'}
              </button>
              <button type="button" onClick={saveScreenshot}>
                Save screenshot (PNG)
              </button>
            </div>
          </div>
        ) : null}

        {panel === 'draw' && settingsDrawing ? (
          <DrawingSettingsSheet
            drawing={settingsDrawing}
            onPatch={(patch) => drawings.updateDrawing(settingsDrawing.id, patch)}
            onClose={() => {
              setPanel('none');
              setDrawSettingsId(null);
            }}
            onClone={() => {
              drawings.selectDrawing(settingsDrawing.id);
              drawings.cloneSelected();
            }}
            onRemove={() => {
              drawings.selectDrawing(settingsDrawing.id);
              drawings.removeSelected();
              setPanel('none');
              setDrawSettingsId(null);
            }}
          />
        ) : null}

        {panel === 'objects' ? (
          <div className="mai-nc__sheet" role="dialog" aria-label="Object tree">
            <header className="mai-nc__sheet-h">
              <b>Object tree</b>
              <button type="button" onClick={() => setPanel('none')}>
                Close
              </button>
            </header>
            <div className="mai-nc__sheet-body mai-nc__sheet-body--list">
              {!drawings.drawings.length ? (
                <p className="mai-nc__sheet-empty">No drawings on this chart</p>
              ) : (
                drawings.drawings.map((d) => (
                  <div
                    key={d.id}
                    className={`mai-nc__obj-row ${drawings.selectedId === d.id ? 'on' : ''} ${
                      d.visible === false ? 'is-hidden' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="mai-nc__obj-pick"
                      onClick={() => {
                        drawings.selectDrawing(d.id);
                        setTool('cursor');
                      }}
                    >
                      <span
                        className="mai-nc__obj-dot"
                        style={{ background: d.color }}
                        aria-hidden
                      />
                      {d.kind}
                      {d.label ? ` · ${d.label}` : ''}
                      {d.locked ? ' · locked' : ''}
                      {d.visible === false ? ' · hidden' : ''}
                    </button>
                    <button
                      type="button"
                      title="Settings"
                      onClick={() => {
                        drawings.selectDrawing(d.id);
                        setDrawSettingsId(d.id);
                        setPanel('draw');
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        drawings.replaceAll(drawings.drawings.filter((x) => x.id !== d.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {panel === 'table' && legend ? (
          <div className="mai-nc__sheet mai-nc__sheet--table" role="dialog" aria-label="Table view">
            <header className="mai-nc__sheet-h">
              <b>Table view · {label}</b>
              <button type="button" onClick={() => setPanel('none')}>
                Close
              </button>
            </header>
            <div className="mai-nc__sheet-body">
              <table className="mai-nc__ohlc-table">
                <tbody>
                  <tr>
                    <th>Open</th>
                    <td>{legend.o.toFixed(decimals)}</td>
                  </tr>
                  <tr>
                    <th>High</th>
                    <td>{legend.h.toFixed(decimals)}</td>
                  </tr>
                  <tr>
                    <th>Low</th>
                    <td>{legend.l.toFixed(decimals)}</td>
                  </tr>
                  <tr>
                    <th>Close</th>
                    <td>{legend.c.toFixed(decimals)}</td>
                  </tr>
                  <tr>
                    <th>Change</th>
                    <td className={tone}>
                      {change >= 0 ? '+' : ''}
                      {change.toFixed(decimals)} ({changePct.toFixed(2)}%)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <ChartContextMenu
        open={ctxMenu}
        onClose={() => setCtxMenu(null)}
        decimals={decimals}
        onResetView={resetView}
        onCopyPrice={(p) => void copyPrice(p)}
        onPaste={() => void pastePriceLine()}
        onAddAlert={addAlertAt}
        onSellLimit={(p) => {
          paperHandoff({ side: 'SELL', qty: 1, price: p, orderType: 'LIMIT' });
        }}
        onBuyStop={(p) => {
          paperHandoff({ side: 'BUY', qty: 1, price: p, orderType: 'STOP' });
        }}
        onAddOrder={(p) => {
          paperHandoff({ side: 'BUY', qty: 1, price: p, orderType: 'LIMIT' });
        }}
        onToggleLockCursor={toggleLockCursor}
        onTableView={() => setPanel('table')}
        onObjectTree={() => setPanel('objects')}
        onRemoveDrawings={() => {
          drawings.clear();
          lockLineIdRef.current = null;
          setCursorLocked(false);
          showToast('Drawings removed');
        }}
        onRemoveIndicators={() => {
          onClearIndicators?.();
          showToast(onClearIndicators ? 'Indicators removed' : 'Open Terminal to clear indicators');
        }}
        onSettings={() => setPanel('settings')}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        onSaveTemplate={() => {
          saveChartTemplate({
            name: `${apiSymbol} · ${new Date().toLocaleString('en-IN')}`,
            drawingsJson: JSON.stringify(drawings.drawings),
            study,
          });
          setTemplatesTick((n) => n + 1);
          showToast('Template saved');
        }}
        onApplyTemplate={(id) => {
          const tpl = listChartTemplates().find((t) => t.id === id);
          if (!tpl) return;
          if (tpl.drawingsJson) {
            try {
              const parsed = JSON.parse(tpl.drawingsJson) as Drawing[];
              if (Array.isArray(parsed)) drawings.replaceAll(parsed);
            } catch {
              /* ignore */
            }
          }
          if (tpl.study) onApplyStudy?.(tpl.study);
          showToast(`Applied ${tpl.name}`);
        }}
        onClearTemplateLayout={() => {
          drawings.clear();
          lockLineIdRef.current = null;
          setCursorLocked(false);
          showToast('Layout cleared');
        }}
      />
    </div>
  );
}
