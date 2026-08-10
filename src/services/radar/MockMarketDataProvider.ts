/**
 * DEMO DATA ONLY — simulated candles for WOLF RADAR development.
 * Do NOT present this as live / licensed market data.
 */
import type { MarketDataProvider } from './MarketDataProvider';
import type { Candle, RadarMarket, RadarTimeframe, RadarUniverse } from './radarTypes';

const DEMO_UNIVERSE: Record<RadarUniverse, string[]> = {
  'F&O': [
    'RELIANCE',
    'SBIN',
    'TATAMOTORS',
    'HDFCBANK',
    'INFY',
    'ICICIBANK',
    'AXISBANK',
    'BAJFINANCE',
    'TCS',
    'KOTAKBANK',
    'LT',
    'MARUTI',
    'WIPRO',
    'ONGC',
    'NTPC',
    'POWERGRID',
    'ADANIENT',
    'HINDALCO',
    'JSWSTEEL',
  ],
  NIFTY50: ['RELIANCE', 'HDFCBANK', 'INFY', 'TCS', 'ICICIBANK', 'SBIN', 'LT', 'ITC'],
  CASH: ['RELIANCE', 'SBIN', 'TATAMOTORS', 'INFY', 'WIPRO'],
};

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
};

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

export class MockMarketDataProvider implements MarketDataProvider {
  readonly id = 'mock-demo';
  readonly label = 'SIMULATED MARKET DATA';
  readonly isDemo = true;

  async getSymbols(universe: RadarUniverse, _market: RadarMarket = 'NSE'): Promise<string[]> {
    return [...new Set(DEMO_UNIVERSE[universe] ?? DEMO_UNIVERSE['F&O'])];
  }

  async getQuote(symbol: string) {
    const base = BASE_PRICES[symbol] ?? 1000;
    const rnd = mulberry32(hashSeed(symbol + ':q'));
    const changePercent = (rnd() - 0.48) * 2.4;
    return {
      symbol,
      price: Number((base * (1 + changePercent / 100)).toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
    };
  }

  async getCandles(symbol: string, timeframe: RadarTimeframe, bars = 80): Promise<Candle[]> {
    const base = BASE_PRICES[symbol] ?? 1000;
    const rnd = mulberry32(hashSeed(`${symbol}:${timeframe}`));
    const out: Candle[] = [];
    let price = base * (0.97 + rnd() * 0.04);
    const now = Date.now();
    const stepMs =
      timeframe === '1D'
        ? 86_400_000
        : timeframe === '4h'
          ? 14_400_000
          : timeframe === '1h'
            ? 3_600_000
            : timeframe === '30m'
              ? 1_800_000
              : timeframe === '15m'
                ? 900_000
                : timeframe === '5m'
                  ? 300_000
                  : timeframe === '3m'
                    ? 180_000
                    : 60_000;

    // Pattern recipes so engines can detect something meaningful in DEMO mode.
    const recipe =
      symbol === 'RELIANCE' || symbol === 'TATAMOTORS'
        ? 'sweep_reclaim'
        : symbol === 'SBIN' || symbol === 'HDFCBANK'
          ? 'breakout'
          : symbol === 'INFY'
            ? 'bear_cont'
            : 'random';

    for (let i = bars; i >= 0; i--) {
      const t = bars - i; // 0 → bars
      let drift = (rnd() - 0.48) * (base * 0.0035);
      if (recipe === 'sweep_reclaim') {
        if (t < bars * 0.55) drift = (rnd() - 0.55) * (base * 0.002);
        else if (t < bars * 0.72) drift = -(base * 0.0045); // selloff into lows
        else drift = base * 0.0055; // reclaim
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
      const low = Math.min(open, close) * (1 - rnd() * (wick + (recipe === 'sweep_reclaim' && t > bars * 0.68 && t < bars * 0.75 ? 0.004 : 0)));
      const volBoost =
        recipe === 'sweep_reclaim' && t > bars * 0.7
          ? 2.4
          : recipe === 'breakout' && t > bars * 0.7
            ? 2.1
            : 1;
      const volume = Math.floor((200_000 + rnd() * 1_200_000) * volBoost);
      out.push({
        symbol,
        exchange: 'NSE',
        timeframe,
        timestamp: now - i * stepMs,
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
}

export const mockMarketDataProvider = new MockMarketDataProvider();
