/**
 * LiveWolfSession — history → poll → candle builder → analysis + reconnect.
 */
import type { MarketDataProvider } from '../marketData/MarketDataProvider';
import type { Candle, RadarTimeframe } from '../radar/radarTypes';
import { LiveCandleBuilder } from './LiveCandleBuilder';
import { analyzeMultiTimeframe, pickHtf, MIN_ANALYSIS_BARS } from './MultiTimeframeAnalysisService';
import { liveAnalysisBus, liveFeedStatusBus, liveMarketEventBus } from './MarketEventBus';
import type {
  LiveAnalysisSnapshot,
  LiveFeedStatus,
  LiveSessionState,
  MarketEvent,
} from './liveTypes';

const STALE_MS = 12_000;
const ANALYSIS_THROTTLE_MS = 2_000;
const UI_BARS_THROTTLE_MS = 250;
/** Engines need ~20–25 bars; keep shallow so chart + analysis share one fast fetch. */
const LIVE_HISTORY_BARS = 160;

function seedCandleFromQuote(
  symbol: string,
  exchange: string,
  timeframe: RadarTimeframe,
  price: number,
  volume = 0,
): Candle {
  const now = Date.now();
  return {
    symbol,
    exchange,
    timeframe,
    timestamp: now,
    open: price,
    high: price,
    low: price,
    close: price,
    volume,
  };
}

export type LiveWolfSessionOpts = {
  symbol: string;
  exchange?: string;
  timeframe: RadarTimeframe;
  provider: MarketDataProvider;
  onBars?: (candles: Candle[]) => void;
  onAnalysis?: (snap: LiveAnalysisSnapshot) => void;
  onEvent?: (evt: MarketEvent) => void;
  onStatus?: (s: LiveSessionState) => void;
};

export class LiveWolfSession {
  private builder: LiveCandleBuilder | null = null;
  private htfCandles: Candle[] = [];
  private subId: string | null = null;
  private snapshot: LiveAnalysisSnapshot | null = null;
  private lastTickAt: number | null = null;
  private lastAnalysisAt: number | null = null;
  private lastBarsUiAt = 0;
  private feedStatus: LiveFeedStatus = 'DISCONNECTED';
  private changePercent = 0;
  private stopped = false;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private historyTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnecting = false;

  constructor(private opts: LiveWolfSessionOpts) {}

  async start() {
    this.stopped = false;
    this.reconnectAttempt = 0;
    this.reconnecting = false;
    await this.bootFeed();
  }

  private async bootFeed() {
    if (this.stopped) return;
    this.setStatus(this.reconnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING');
    const { symbol, timeframe, provider } = this.opts;
    const exchange = this.opts.exchange || 'NSE';

    try {
      await provider.authenticate().catch(() => provider.connect());
      let [ltf, htf] = await Promise.all([
        provider.getCandles(symbol, timeframe, LIVE_HISTORY_BARS),
        provider.getCandles(symbol, pickHtf(timeframe), LIVE_HISTORY_BARS),
      ]);

      // LIVE soft-empty / short history: one retry, then seed from quote so ticks can attach
      if ((!ltf || ltf.length < MIN_ANALYSIS_BARS) && !provider.isDemo) {
        await new Promise((r) => setTimeout(r, 400));
        const retry = await Promise.all([
          provider.getCandles(symbol, timeframe, LIVE_HISTORY_BARS),
          provider.getCandles(symbol, pickHtf(timeframe), LIVE_HISTORY_BARS),
        ]);
        if (retry[0].length > (ltf?.length || 0)) ltf = retry[0];
        if (retry[1].length > (htf?.length || 0)) htf = retry[1];
      }

      if ((!ltf || ltf.length === 0) && !provider.isDemo) {
        try {
          const q = await provider.getQuote(symbol);
          const px = q.lastPrice || q.price;
          if (px > 0) {
            ltf = [
              seedCandleFromQuote(symbol, exchange, timeframe, px, q.volume || 0),
            ];
            this.changePercent = q.changePercent ?? 0;
          }
        } catch {
          /* analysis stays WAIT until history arrives */
        }
      }

      if (this.stopped) return;

      this.htfCandles = htf || [];
      this.builder = new LiveCandleBuilder(symbol, timeframe, ltf || [], exchange);
      this.emitBars(true);
      this.runAnalysis(true);

      // LIVE: keep pulling history after a quote-stub so analysis is never stuck at 1/20.
      if (!provider.isDemo && (ltf?.length || 0) < MIN_ANALYSIS_BARS) {
        this.scheduleHistoryRefill(0);
      }

      if (this.subId) {
        await provider.unsubscribeQuotes(this.subId).catch(() => undefined);
        this.subId = null;
      }

      this.subId = await provider.subscribeQuotes([symbol], (q) => {
        if (this.stopped || !this.builder) return;
        this.lastTickAt = Date.now();
        this.changePercent = q.changePercent ?? this.changePercent;
        this.reconnectAttempt = 0;
        if (this.feedStatus !== 'CONNECTED') this.setStatus('CONNECTED');

        const applied = this.builder.applyQuote(q.lastPrice || q.price, {
          volume: q.volume,
          high: q.dayHigh,
          low: q.dayLow,
          nowMs: q.timestamp || Date.now(),
        });
        if (!applied) return;

        this.emitBars(applied.isNewBar);
        if (applied.isNewBar) {
          liveMarketEventBus.publish({
            id: `tick-${symbol}-${Date.now()}`,
            symbol,
            exchange,
            timeframe: this.opts.timeframe,
            type: 'CANDLE_CLOSE',
            timestamp: Date.now(),
            price: applied.updated.close,
            significance: 'MEDIUM',
            message: 'Candle closed',
          });
        }

        if (applied.isNewBar || this.shouldAnalyze()) {
          this.runAnalysis(applied.isNewBar);
        }
      });

      if (this.staleTimer) clearInterval(this.staleTimer);
      this.staleTimer = setInterval(() => this.checkStale(), 2_000);
      this.reconnecting = false;
      this.setStatus('CONNECTED');
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnecting) return;
    this.reconnecting = true;
    this.setStatus('RECONNECTING');
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt, 4));
    this.reconnectAttempt += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnecting = false;
      void this.bootFeed();
    }, delay);
  }

  async setTimeframe(timeframe: RadarTimeframe) {
    if (this.stopped) return;
    this.opts.timeframe = timeframe;
    const { symbol, provider } = this.opts;
    const [ltf, htf] = await Promise.all([
      provider.getCandles(symbol, timeframe, LIVE_HISTORY_BARS),
      provider.getCandles(symbol, pickHtf(timeframe), LIVE_HISTORY_BARS),
    ]);
    this.htfCandles = htf;
    this.builder = new LiveCandleBuilder(symbol, timeframe, ltf, this.opts.exchange || 'NSE');
    this.emitBars(true);
    this.runAnalysis(true);
  }

  async stop() {
    this.stopped = true;
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = null;
    if (this.subId) {
      await this.opts.provider.unsubscribeQuotes(this.subId).catch(() => undefined);
      this.subId = null;
    }
    this.setStatus('DISCONNECTED');
  }

  getSnapshot() {
    return this.snapshot;
  }

  private scheduleHistoryRefill(attempt: number) {
    if (this.stopped || this.opts.provider.isDemo) return;
    if (attempt > 8) return;
    const delay = Math.min(8_000, 700 * 2 ** attempt);
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = setTimeout(() => {
      void this.refillHistory(attempt);
    }, delay);
  }

  private async refillHistory(attempt: number) {
    if (this.stopped) return;
    const { symbol, timeframe, provider } = this.opts;
    try {
      const [ltf, htf] = await Promise.all([
        provider.getCandles(symbol, timeframe, LIVE_HISTORY_BARS),
        provider.getCandles(symbol, pickHtf(timeframe), LIVE_HISTORY_BARS),
      ]);
      if (this.stopped) return;
      if (htf.length > (this.htfCandles?.length || 0)) this.htfCandles = htf;
      if (ltf.length >= MIN_ANALYSIS_BARS) {
        if (this.builder) this.builder.replaceHistory(ltf);
        else {
          this.builder = new LiveCandleBuilder(
            symbol,
            timeframe,
            ltf,
            this.opts.exchange || 'NSE',
          );
        }
        this.emitBars(true);
        this.runAnalysis(true);
        return;
      }
    } catch {
      /* retry */
    }
    this.scheduleHistoryRefill(attempt + 1);
  }

  private emitBars(force: boolean) {
    if (!this.builder) return;
    const now = Date.now();
    if (!force && now - this.lastBarsUiAt < UI_BARS_THROTTLE_MS) return;
    this.lastBarsUiAt = now;
    this.opts.onBars?.(this.builder.getCandles());
  }

  private shouldAnalyze() {
    if (!this.lastAnalysisAt) return true;
    return Date.now() - this.lastAnalysisAt >= ANALYSIS_THROTTLE_MS;
  }

  private runAnalysis(force: boolean) {
    if (!this.builder) return;
    if (!force && !this.shouldAnalyze()) return;
    const candles = this.builder.getCandles();
    const price = candles[candles.length - 1]?.close || 0;
    const { snapshot, events } = analyzeMultiTimeframe({
      symbol: this.opts.symbol,
      exchange: this.opts.exchange || 'NSE',
      timeframe: this.opts.timeframe,
      ltf: candles,
      htf: this.htfCandles,
      price,
      changePercent: this.changePercent,
      dataMode: this.opts.provider.isDemo ? 'DEMO' : 'LIVE',
      previous: this.snapshot,
    });
    this.snapshot = snapshot;
    this.lastAnalysisAt = Date.now();
    this.opts.onAnalysis?.(snapshot);
    liveAnalysisBus.publish(snapshot);

    for (const evt of events) {
      if (evt.type === 'PRICE_UPDATE' || evt.type === 'ANALYSIS_UPDATE') continue;
      if (evt.significance === 'LOW' && !force) continue;
      this.opts.onEvent?.(evt);
      liveMarketEventBus.publish(evt);
    }
  }

  private checkStale() {
    if (!this.lastTickAt || this.reconnecting) return;
    if (Date.now() - this.lastTickAt > STALE_MS) {
      if (this.feedStatus !== 'STALE_DATA') this.setStatus('STALE_DATA');
      if (Date.now() - this.lastTickAt > STALE_MS * 2.5) {
        this.scheduleReconnect();
      }
    }
  }

  private setStatus(feedStatus: LiveFeedStatus) {
    this.feedStatus = feedStatus;
    const state: LiveSessionState = {
      feedStatus,
      lastTickAt: this.lastTickAt,
      lastCandleAt: this.builder?.getCandles().at(-1)?.timestamp ?? null,
      lastAnalysisAt: this.lastAnalysisAt,
      providerLabel: this.opts.provider.label,
      dataMode: this.opts.provider.isDemo ? 'DEMO' : 'LIVE',
      stale: feedStatus === 'STALE_DATA',
    };
    this.opts.onStatus?.(state);
    liveFeedStatusBus.publish(state);
  }
}
