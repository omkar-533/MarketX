/**
 * HistoricalMarketDataService
 * Broker → Provider → normalize → validate → cache → consumers
 */
import type { MarketDataProvider } from './MarketDataProvider';
import { marketDataCache } from './MarketDataCache';
import { normalizeCandleSeries, validateCandles } from './DataQualityService';
import { demoRateLimitManager, type RateLimitManager } from './RateLimitManager';
import type { Candle, RadarTimeframe } from '../radar/radarTypes';
import type { DataQualityReport, MarketDataMode } from './types';

export type HistoricalFetchResult = {
  candles: Candle[];
  quality: DataQualityReport;
  mode: MarketDataMode;
  source: string;
  fromCache: boolean;
};

export class HistoricalMarketDataService {
  constructor(
    private provider: MarketDataProvider,
    private readonly cache = marketDataCache,
    private readonly rate = demoRateLimitManager as RateLimitManager,
  ) {}

  setProvider(provider: MarketDataProvider) {
    this.provider = provider;
  }

  async getCandles(
    symbol: string,
    timeframe: RadarTimeframe,
    bars = 80,
  ): Promise<HistoricalFetchResult> {
    const mode: MarketDataMode = this.provider.isDemo ? 'DEMO' : 'LIVE';
    const cacheKey = `hist:${this.provider.id}:${symbol}:${timeframe}:${bars}`;
    const cached = this.cache.get<Candle[]>(cacheKey);
    if (cached) {
      const quality = validateCandles(cached.data);
      return {
        candles: cached.data,
        quality,
        mode: cached.mode,
        source: cached.source,
        fromCache: true,
      };
    }

    await this.rate.acquire('historical');
    const raw = await this.provider.getCandles(symbol, timeframe, bars);
    const candles = normalizeCandleSeries(raw);
    const quality = validateCandles(candles);
    this.cache.set(cacheKey, candles, {
      source: this.provider.id,
      mode,
      ttlMs: this.provider.isDemo ? 30_000 : 10_000,
    });

    return {
      candles,
      quality,
      mode,
      source: this.provider.id,
      fromCache: false,
    };
  }

  async getHistoricalRange(
    symbol: string,
    timeframe: RadarTimeframe,
    from: number,
    to: number,
  ): Promise<HistoricalFetchResult> {
    const mode: MarketDataMode = this.provider.isDemo ? 'DEMO' : 'LIVE';
    await this.rate.acquire('historical');
    const raw = await this.provider.getHistoricalCandles(symbol, timeframe, from, to);
    const candles = normalizeCandleSeries(raw);
    const quality = validateCandles(candles);
    return {
      candles,
      quality,
      mode,
      source: this.provider.id,
      fromCache: false,
    };
  }
}
