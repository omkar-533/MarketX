/**
 * LiveCandleBuilder — quotes/ticks → OHLC forming candle for a timeframe.
 * Reuses applyLivePriceToBars (authorized data only — no scraping).
 */
import { applyLivePriceToBars, intervalToMs } from '../chart/liveCandleMerge';
import type { ChartBar } from '../../types/chart';
import type { Candle, RadarTimeframe } from '../radar/radarTypes';

function candleToBar(c: Candle): ChartBar {
  return {
    time: c.timestamp > 1e12 ? Math.floor(c.timestamp / 1000) : Math.floor(c.timestamp),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

function barToCandle(
  bar: ChartBar,
  meta: { symbol: string; exchange: string; timeframe: RadarTimeframe; instrumentToken?: string },
): Candle {
  const t = typeof bar.time === 'number' ? bar.time : 0;
  return {
    symbol: meta.symbol,
    exchange: meta.exchange,
    instrumentToken: meta.instrumentToken,
    timeframe: meta.timeframe,
    timestamp: t > 1e12 ? t : t * 1000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume || 0,
  };
}

export class LiveCandleBuilder {
  private bars: ChartBar[] = [];
  private meta: {
    symbol: string;
    exchange: string;
    timeframe: RadarTimeframe;
    instrumentToken?: string;
  };

  constructor(
    symbol: string,
    timeframe: RadarTimeframe,
    historical: Candle[],
    exchange = 'NSE',
  ) {
    this.meta = {
      symbol,
      exchange,
      timeframe,
      instrumentToken: historical[0]?.instrumentToken,
    };
    this.bars = historical.map(candleToBar);
  }

  getCandles(): Candle[] {
    return this.bars.map((b) => barToCandle(b, this.meta));
  }

  getBars(): ChartBar[] {
    return this.bars.slice();
  }

  replaceHistory(historical: Candle[]) {
    this.meta.instrumentToken = historical[0]?.instrumentToken ?? this.meta.instrumentToken;
    this.bars = historical.map(candleToBar);
  }

  /**
   * Apply live LTP. Returns null if price rejected / no bars.
   */
  applyQuote(price: number, opts?: { volume?: number; high?: number; low?: number; nowMs?: number }) {
    const result = applyLivePriceToBars(this.bars, price, this.meta.timeframe, opts);
    if (!result) return null;
    this.bars = result.bars;
    return {
      candles: this.getCandles(),
      updated: barToCandle(result.updated, this.meta),
      isNewBar: result.isNewBar,
    };
  }

  timeframeMs(): number {
    return intervalToMs(this.meta.timeframe);
  }
}

export function timeframeToMs(tf: RadarTimeframe): number {
  return intervalToMs(tf);
}
