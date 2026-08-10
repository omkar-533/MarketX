/**
 * LiveWolfSession — one selected symbol: history → poll quotes → candle builder → analysis.
 * Frontend never talks to broker APIs directly (provider only).
 */
import type { MarketDataProvider } from '../marketData/MarketDataProvider';
import type { Candle, RadarTimeframe } from '../radar/radarTypes';
import { LiveCandleBuilder } from './LiveCandleBuilder';
import {
  analyzeMultiTimeframe,
  pickHtf,
} from './MultiTimeframeAnalysisService';
import { liveAnalysisBus, liveFeedStatusBus, liveMarketEventBus } from './MarketEventBus';
import type {
  LiveAnalysisSnapshot,
  LiveFeedStatus,
  LiveSessionState,
  MarketEvent,
} from './liveTypes';

const STALE_MS = 15_000;
const ANALYSIS_THROTTLE_MS = 4_000;

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
  private feedStatus: LiveFeedStatus = 'DISCONNECTED';
  private changePercent = 0;
  private stopped = false;
  private staleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private opts: LiveWolfSessionOpts) {}

  async start() {
    this.stopped = false;
    this.setStatus('CONNECTING');
    const { symbol, timeframe, provider } = this.opts;
    const exchange = this.opts.exchange || 'NSE';

    await provider.authenticate().catch(() => provider.connect());

    const [ltf, htf] = await Promise.all([
      provider.getCandles(symbol, timeframe, 120),
      provider.getCandles(symbol, pickHtf(timeframe), 120),
    ]);
    if (this.stopped) return;

    this.htfCandles = htf;
    this.builder = new LiveCandleBuilder(symbol, timeframe, ltf, exchange);
    this.opts.onBars?.(this.builder.getCandles());
    this.runAnalysis(true);

    this.subId = await provider.subscribeQuotes([symbol], (q) => {
      if (this.stopped || !this.builder) return;
      this.lastTickAt = Date.now();
      this.changePercent = q.changePercent ?? this.changePercent;
      if (this.feedStatus !== 'CONNECTED') this.setStatus('CONNECTED');

      const applied = this.builder.applyQuote(q.lastPrice || q.price, {
        volume: q.volume,
        high: q.dayHigh,
        low: q.dayLow,
        nowMs: q.timestamp || Date.now(),
      });
      if (!applied) return;

      this.opts.onBars?.(applied.candles);
      liveMarketEventBus.publish({
        id: `tick-${symbol}-${Date.now()}`,
        symbol,
        exchange,
        timeframe,
        type: applied.isNewBar ? 'CANDLE_CLOSE' : 'PRICE_UPDATE',
        timestamp: Date.now(),
        price: applied.updated.close,
        significance: applied.isNewBar ? 'MEDIUM' : 'LOW',
        message: applied.isNewBar ? 'Candle closed' : 'Price update',
      });

      if (applied.isNewBar || this.shouldAnalyze()) {
        this.runAnalysis(applied.isNewBar);
      }
    });

    this.staleTimer = setInterval(() => this.checkStale(), 2_000);
    this.setStatus(provider.isDemo ? 'CONNECTED' : 'CONNECTED');
  }

  async setTimeframe(timeframe: RadarTimeframe) {
    if (!this.builder) return;
    this.opts.timeframe = timeframe;
    const { symbol, provider } = this.opts;
    const [ltf, htf] = await Promise.all([
      provider.getCandles(symbol, timeframe, 120),
      provider.getCandles(symbol, pickHtf(timeframe), 120),
    ]);
    this.htfCandles = htf;
    this.builder = new LiveCandleBuilder(
      symbol,
      timeframe,
      ltf,
      this.opts.exchange || 'NSE',
    );
    this.opts.onBars?.(this.builder.getCandles());
    this.runAnalysis(true);
  }

  async stop() {
    this.stopped = true;
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
    if (this.subId) {
      await this.opts.provider.unsubscribeQuotes(this.subId).catch(() => undefined);
      this.subId = null;
    }
    this.setStatus('DISCONNECTED');
  }

  getSnapshot() {
    return this.snapshot;
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
    if (!this.lastTickAt) return;
    if (Date.now() - this.lastTickAt > STALE_MS) {
      if (this.feedStatus !== 'STALE_DATA') this.setStatus('STALE_DATA');
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
