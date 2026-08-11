/**
 * UniverseService — scanner requests normalized universes from provider / instrument master.
 * Never fabricates NSE=6500 / F&O=209 — counts come from the authorized source.
 */
import type { MarketDataProvider } from './MarketDataProvider';
import type { NormalizedInstrument, WolfExchange } from './types';
import type { RadarMarket, RadarUniverse } from '../radar/radarTypes';
import { fetchUniversesMeta } from './marketDataApi';

export class UniverseService {
  constructor(private provider: MarketDataProvider) {}

  setProvider(provider: MarketDataProvider) {
    this.provider = provider;
  }

  async getUniverse(universe: RadarUniverse, market: RadarMarket = 'NSE'): Promise<string[]> {
    return this.provider.getSymbols(universe, market);
  }

  async getNSEEquityUniverse(): Promise<string[]> {
    return this.getUniverse('NSE', 'NSE');
  }

  async getBSEEquityUniverse(): Promise<string[]> {
    return this.getUniverse('BSE', 'BSE');
  }

  async getFNOUnderlyingUniverse(market: RadarMarket = 'NSE'): Promise<string[]> {
    return this.getUniverse('F&O', market);
  }

  /** @deprecated prefer getFNOUnderlyingUniverse */
  async getFNOUniverse(market: RadarMarket = 'NSE'): Promise<string[]> {
    return this.getFNOUnderlyingUniverse(market);
  }

  async getIndexUniverse(market: RadarMarket = 'NSE'): Promise<string[]> {
    return this.getUniverse('NIFTY50', market);
  }

  async getCustomWatchlistUniverse(symbols: string[]): Promise<string[]> {
    return [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))];
  }

  /** Live meta counts from the connected instrument master (when available). */
  async getUniverseMeta() {
    try {
      return await fetchUniversesMeta();
    } catch {
      return null;
    }
  }

  async getInstrumentUniverse(): Promise<NormalizedInstrument[]> {
    return this.provider.getInstrumentList();
  }

  async getInstrumentsByExchange(exchange: WolfExchange): Promise<NormalizedInstrument[]> {
    const all = await this.getInstrumentUniverse();
    return all.filter((i) => String(i.exchange).toUpperCase() === exchange);
  }
}
