/**
 * Server-backed LIVE MarketDataProvider.
 * Calls WOLF /api/market-data/* — broker tokens never touch this class.
 * Live updates: official REST polling (not undocumented WS scrape).
 */
import type { MarketDataProvider, QuoteSubscriptionCallback } from './MarketDataProvider';
import type {
  MarketStatusInfo,
  NormalizedInstrument,
  NormalizedQuote,
  ProviderCapabilities,
  WolfTimeframe,
} from './types';
import { ALL_WOLF_TIMEFRAMES } from './types';
import type { Candle, RadarMarket, RadarTimeframe, RadarUniverse } from '../radar/radarTypes';
import { fetchLiveCandles, fetchLiveQuote, fetchLiveSymbols } from './marketDataApi';

export class ServerMarketDataProvider implements MarketDataProvider {
  readonly id = 'indstocks-live';
  readonly label = 'INDstocks MARKET DATA';
  readonly isDemo = false;

  private connected = false;
  private subSeq = 0;
  private readonly polls = new Map<string, ReturnType<typeof setInterval>>();
  /** Last symbols() meta — catalog vs actually resolvable */
  lastUniverseMeta: {
    universeLoaded: number;
    dataAvailable: number;
    dataUnavailable: number;
    source?: string;
    note?: string;
  } | null = null;

  async getSymbols(universe: RadarUniverse, _market: RadarMarket = 'NSE'): Promise<string[]> {
    try {
      const data = await fetchLiveSymbols(universe, 'scannable');
      const loaded = data.universeLoaded ?? data.catalog?.length ?? data.symbols?.length ?? 0;
      const available = data.dataAvailable ?? data.scannable?.length ?? data.symbols?.length ?? 0;
      this.lastUniverseMeta = {
        universeLoaded: loaded,
        dataAvailable: available,
        dataUnavailable: data.dataUnavailable ?? Math.max(0, loaded - available),
        source: data.source,
        note: data.note,
      };
      if (data.symbols?.length) return data.symbols;
      const catalog = await fetchLiveSymbols(universe, 'catalog');
      this.lastUniverseMeta = {
        universeLoaded: catalog.universeLoaded ?? catalog.symbols?.length ?? 0,
        dataAvailable: 0,
        dataUnavailable: catalog.universeLoaded ?? catalog.symbols?.length ?? 0,
        source: catalog.source,
        note: catalog.note,
      };
      return catalog.symbols || [];
    } catch (err) {
      console.warn('[ServerMarketDataProvider] getSymbols failed', err);
      this.lastUniverseMeta = null;
      throw err;
    }
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async authenticate(): Promise<void> {
    return this.connect();
  }

  async disconnect(): Promise<void> {
    for (const id of [...this.polls.keys()]) {
      await this.unsubscribeQuotes(id);
    }
    this.connected = false;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      historicalCandles: true,
      liveQuotes: true,
      bidAsk: true,
      marketDepth: false,
      instrumentList: true,
      marketStatus: false,
      orderExecution: false,
    };
  }

  getSupportedTimeframes(): WolfTimeframe[] {
    return [...ALL_WOLF_TIMEFRAMES];
  }

  async getMarketStatus(exchange = 'NSE'): Promise<MarketStatusInfo> {
    return {
      exchange,
      isOpen: true,
      session: 'UNKNOWN',
      serverTime: Date.now(),
      raw: 'provider-status-unknown',
    };
  }

  async getInstrumentList(): Promise<NormalizedInstrument[]> {
    const symbols = await this.getSymbols('F&O');
    return symbols.map((symbol) => ({
      wolfInstrumentId: `NSE:EQ:${symbol}`,
      symbol,
      exchange: 'NSE',
      instrumentToken: symbol,
      tradingSymbol: symbol,
      instrumentType: 'EQUITY',
      expiry: null,
      strike: null,
      optionType: null,
      lotSize: 1,
      tickSize: 0.05,
      currency: 'INR',
    }));
  }

  async getQuote(symbol: string): Promise<NormalizedQuote> {
    void this.connected;
    try {
      const { quote } = await fetchLiveQuote(symbol);
      const lastPrice = quote.lastPrice || quote.price;
      return {
        symbol: quote.symbol || symbol,
        exchange: quote.exchange || 'NSE',
        timestamp: quote.timestamp || Date.now(),
        lastPrice,
        price: lastPrice,
        changePercent: quote.changePercent ?? 0,
      };
    } catch {
      return {
        symbol,
        exchange: 'NSE',
        timestamp: Date.now(),
        lastPrice: 0,
        price: 0,
        changePercent: 0,
      };
    }
  }

  async getCandles(symbol: string, timeframe: RadarTimeframe, bars = 80): Promise<Candle[]> {
    try {
      const { candles } = await fetchLiveCandles(symbol, timeframe, Math.max(bars, 120));
      return Array.isArray(candles) ? candles : [];
    } catch (err) {
      // Soft-fail — scanner marks unavailable; LIVE session retries / seeds from quote
      console.warn('[ServerMarketDataProvider] candles', symbol, err instanceof Error ? err.message : err);
      return [];
    }
  }

  async getHistoricalCandles(
    symbol: string,
    timeframe: RadarTimeframe | WolfTimeframe,
    _from: number,
    _to: number,
  ): Promise<Candle[]> {
    return this.getCandles(symbol, timeframe as RadarTimeframe, 80);
  }

  async subscribeQuotes(symbols: string[], callback: QuoteSubscriptionCallback): Promise<string> {
    const id = `poll-${++this.subSeq}`;
    const list = [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))];
    const tick = async () => {
      for (const symbol of list) {
        try {
          callback(await this.getQuote(symbol));
        } catch {
          /* keep polling */
        }
      }
    };
    void tick();
    this.polls.set(id, setInterval(() => void tick(), 2_500));
    return id;
  }

  async unsubscribeQuotes(subscriptionId: string): Promise<void> {
    const handle = this.polls.get(subscriptionId);
    if (handle) {
      clearInterval(handle);
      this.polls.delete(subscriptionId);
    }
  }
}

export const serverMarketDataProvider = new ServerMarketDataProvider();
