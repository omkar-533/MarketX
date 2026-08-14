/**
 * DEMO DATA ONLY — simulated candles for WOLF RADAR / Market Data Engine.
 * Do NOT present this as live / licensed market data.
 */
import type { MarketDataProvider, QuoteSubscriptionCallback } from '../marketData/MarketDataProvider';
import type {
  MarketStatusInfo,
  NormalizedInstrument,
  NormalizedQuote,
  ProviderCapabilities,
  WolfTimeframe,
} from '../marketData/types';
import {
  ALL_WOLF_TIMEFRAMES,
  DEFAULT_DEMO_CAPABILITIES,
} from '../marketData/types';
import type { Candle, RadarMarket, RadarTimeframe, RadarUniverse } from './radarTypes';
import { resolveCatalogUniverse } from './universeCatalog';

const DEMO_UNIVERSE = (universe: RadarUniverse) => resolveCatalogUniverse(universe);

const BASE_PRICES: Record<string, number> = {
  RELIANCE: 2894.5,
  SBIN: 812.3,
  TATAMOTORS: 978.4,
  HDFCBANK: 1688.2,
  INFY: 1842.6,
  ICICIBANK: 1244.1,
  AXISBANK: 1120.5,
  BAJFINANCE: 7240.0,
  TCS: 3988.5,
  KOTAKBANK: 1788.0,
  LT: 3560.2,
  MARUTI: 12440.0,
  WIPRO: 498.2,
  ONGC: 268.4,
  NTPC: 368.9,
  POWERGRID: 312.5,
  ADANIENT: 2988.0,
  HINDALCO: 688.4,
  JSWSTEEL: 978.0,
  ITC: 468.2,
  GOLD: 98000,
  GOLDM: 9800,
  SILVER: 112000,
  SILVERM: 112000,
  CRUDEOIL: 5850,
  CRUDEOILM: 5850,
  NATURALGAS: 280,
  COPPER: 850,
  ZINC: 270,
  ALUMINIUM: 240,
  NICKEL: 1500,
  LEAD: 185,
};

function demoBase(symbol: string): number {
  const key = String(symbol || '')
    .toUpperCase()
    .replace(/^MCX:/, '')
    .replace(/^NSE:/, '')
    .replace(/^BSE:/, '');
  return BASE_PRICES[key] ?? BASE_PRICES[String(symbol || '').toUpperCase()] ?? 1000;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stepMsFor(timeframe: RadarTimeframe): number {
  if (timeframe === '1D') return 86_400_000;
  if (timeframe === '4h') return 14_400_000;
  if (timeframe === '1h') return 3_600_000;
  if (timeframe === '30m') return 1_800_000;
  if (timeframe === '15m') return 900_000;
  if (timeframe === '5m') return 300_000;
  if (timeframe === '3m') return 180_000;
  return 60_000;
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly id = 'mock-demo';
  readonly label = 'DEMO MARKET DATA';
  readonly isDemo = true;

  private connected = false;
  private subSeq = 0;
  private readonly polls = new Map<string, ReturnType<typeof setInterval>>();

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
      ...DEFAULT_DEMO_CAPABILITIES,
      liveQuotes: true, // demo poll updates — UI still labels DEMO, never LIVE licensed
    };
  }

  getSupportedTimeframes(): WolfTimeframe[] {
    return [...ALL_WOLF_TIMEFRAMES];
  }

  async getMarketStatus(exchange = 'NSE'): Promise<MarketStatusInfo> {
    const hour = new Date().getHours();
    const isOpen = hour >= 9 && hour < 16;
    return {
      exchange,
      isOpen,
      session: isOpen ? 'OPEN' : 'CLOSED',
      serverTime: Date.now(),
      raw: 'simulated',
    };
  }

  async getSymbols(universe: RadarUniverse, _market: RadarMarket = 'NSE'): Promise<string[]> {
    return [...new Set(DEMO_UNIVERSE(universe))];
  }

  async getInstrumentList(): Promise<NormalizedInstrument[]> {
    const symbols = await this.getSymbols('F&O', 'NSE');
    return symbols.map((symbol) => ({
      wolfInstrumentId: `NSE:EQ:${symbol}`,
      symbol,
      exchange: 'NSE',
      instrumentToken: `demo-${symbol}`,
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
    const base = demoBase(symbol);
    const rnd = mulberry32(hashSeed(symbol + ':q'));
    // Time wobble so DEMO LIVE chart visibly updates without claiming licensed live feed
    const wobble = Math.sin(Date.now() / 4000 + hashSeed(symbol) / 1e9) * 0.0012;
    const changePercent = (rnd() - 0.48) * 2.4 + wobble * 100;
    const lastPrice = Number((base * (1 + changePercent / 100)).toFixed(2));
    return {
      symbol,
      exchange: 'NSE',
      instrumentToken: `demo-${symbol}`,
      timestamp: Date.now(),
      lastPrice,
      price: lastPrice,
      changePercent: Number(changePercent.toFixed(2)),
      volume: Math.floor(500_000 + rnd() * 2_000_000),
      dayOpen: Number((base * 0.995).toFixed(2)),
      dayHigh: Number((base * 1.012).toFixed(2)),
      dayLow: Number((base * 0.988).toFixed(2)),
      previousClose: base,
    };
  }

  async getCandles(symbol: string, timeframe: RadarTimeframe, bars = 80): Promise<Candle[]> {
    const to = Date.now();
    const from = to - bars * stepMsFor(timeframe);
    return this.getHistoricalCandles(symbol, timeframe, from, to);
  }

  async getHistoricalCandles(
    symbol: string,
    timeframe: RadarTimeframe | WolfTimeframe,
    from: number,
    to: number,
  ): Promise<Candle[]> {
    const tf = timeframe as RadarTimeframe;
    const step = stepMsFor(tf);
    const bars = Math.max(2, Math.min(500, Math.floor((to - from) / step) + 1));
    const base = demoBase(symbol);
    const rnd = mulberry32(hashSeed(`${symbol}:${tf}`));
    const out: Candle[] = [];
    let price = base * (0.97 + rnd() * 0.04);
    const recipe =
      symbol === 'RELIANCE' || symbol === 'TATAMOTORS'
        ? 'sweep_reclaim'
        : symbol === 'SBIN' || symbol === 'HDFCBANK'
          ? 'breakout'
          : symbol === 'INFY'
            ? 'bear_cont'
            : 'random';

    for (let i = bars; i >= 0; i--) {
      const t = bars - i;
      let drift = (rnd() - 0.48) * (base * 0.0035);
      if (recipe === 'sweep_reclaim') {
        if (t < bars * 0.55) drift = (rnd() - 0.55) * (base * 0.002);
        else if (t < bars * 0.72) drift = -(base * 0.0045);
        else drift = base * 0.0055;
      } else if (recipe === 'breakout') {
        if (t < bars * 0.65) drift = (rnd() - 0.5) * (base * 0.0015);
        else drift = base * 0.006;
      } else if (recipe === 'bear_cont') {
        drift = -(base * 0.0022) + (rnd() - 0.5) * (base * 0.001);
      }

      const open = price;
      const close = Math.max(1, open + drift);
      const wick = recipe === 'sweep_reclaim' && t > bars * 0.65 && t < bars * 0.78 ? 0.004 : 0.002;
      const high = Math.max(open, close) * (1 + rnd() * wick);
      const low =
        Math.min(open, close) *
        (1 -
          rnd() *
            (wick +
              (recipe === 'sweep_reclaim' && t > bars * 0.68 && t < bars * 0.75 ? 0.004 : 0)));
      const volBoost =
        recipe === 'sweep_reclaim' && t > bars * 0.7
          ? 2.4
          : recipe === 'breakout' && t > bars * 0.7
            ? 2.1
            : 1;
      const volume = Math.floor((200_000 + rnd() * 1_200_000) * volBoost);
      const timestamp = to - i * step;
      if (timestamp < from - step) continue;
      out.push({
        symbol,
        exchange: 'NSE',
        instrumentToken: `demo-${symbol}`,
        timeframe: tf,
        timestamp,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });
      price = close;
    }
    return out;
  }

  async subscribeQuotes(symbols: string[], callback: QuoteSubscriptionCallback): Promise<string> {
    void this.connected;
    const id = `demo-poll-${++this.subSeq}`;
    const list = [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))];
    const tick = async () => {
      for (const symbol of list) {
        try {
          callback(await this.getQuote(symbol));
        } catch {
          /* ignore */
        }
      }
    };
    void tick();
    this.polls.set(id, setInterval(() => void tick(), 1_500));
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

export const mockMarketDataProvider = new MockMarketDataProvider();
