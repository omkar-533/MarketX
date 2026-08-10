/**
 * UniverseService — scanner requests normalized universes, never hardcodes brokers.
 */
import type { MarketDataProvider } from './MarketDataProvider';
import type { NormalizedInstrument, WolfExchange } from './types';
import type { RadarMarket, RadarUniverse } from '../radar/radarTypes';

export class UniverseService {
  constructor(private provider: MarketDataProvider) {}

  setProvider(provider: MarketDataProvider) {
    this.provider = provider;
  }

  async getUniverse(universe: RadarUniverse, market: RadarMarket = 'NSE'): Promise<string[]> {
    return this.provider.getSymbols(universe, market);
  }

  async getFNOUniverse(market: RadarMarket = 'NSE'): Promise<string[]> {
    return this.getUniverse('F&O', market);
  }

  async getEquityUniverse(market: RadarMarket = 'NSE'): Promise<string[]> {
    return this.getUniverse('CASH', market);
  }

  async getIndexUniverse(market: RadarMarket = 'NSE'): Promise<string[]> {
    return this.getUniverse('NIFTY50', market);
  }

  async getInstrumentUniverse(): Promise<NormalizedInstrument[]> {
    return this.provider.getInstrumentList();
  }

  async getInstrumentsByExchange(exchange: WolfExchange): Promise<NormalizedInstrument[]> {
    const all = await this.getInstrumentUniverse();
    return all.filter((i) => String(i.exchange).toUpperCase() === exchange);
  }
}
