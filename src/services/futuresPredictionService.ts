import { getFuturesOIData, type BuildupSignal, type FuturesOIData } from '../data/marketData';
import type { LiveSymbolQuote } from './symbolLiveService';

export interface FuturesPrediction {
  symbol: string;
  spotPrice: number;
  futuresPrice: number;
  basis: number;
  basisPct: number;
  predictedExpiryPrice: number;
  predictedMovePct: number;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  signal: BuildupSignal | 'Neutral';
  trendStrength: string;
  maxPain?: number;
  confidence: number;
  narrative: string;
  lastUpdated: string;
}

const indexFuturesCache = new Map<string, FuturesOIData>();

function refreshIndexFuturesCache() {
  getFuturesOIData().forEach((row) => indexFuturesCache.set(row.symbol, row));
}

function simulateStockFutures(quote: LiveSymbolQuote): FuturesPrediction {
  const spot = quote.price;
  const momentum = quote.changePercent / 100;
  const ivFactor = (quote.iv ?? 20) / 100;
  const daysToExpiry = 7;
  const carry = spot * (0.065 * (daysToExpiry / 365) + momentum * 0.35);
  const futuresPrice = Math.round((spot + carry) * 100) / 100;
  const basis = futuresPrice - spot;
  const predictedExpiryPrice = Math.round(futuresPrice * 100) / 100;
  const predictedMovePct = spot > 0 ? ((predictedExpiryPrice - spot) / spot) * 100 : 0;
  const bias: FuturesPrediction['bias'] =
    predictedMovePct > 0.15 ? 'Bullish' : predictedMovePct < -0.15 ? 'Bearish' : 'Neutral';

  return {
    symbol: quote.symbol,
    spotPrice: spot,
    futuresPrice,
    basis,
    basisPct: spot > 0 ? (basis / spot) * 100 : 0,
    predictedExpiryPrice,
    predictedMovePct: Math.round(predictedMovePct * 100) / 100,
    bias,
    signal: quote.changePercent > 0.3 ? 'Long Buildup' : quote.changePercent < -0.3 ? 'Short Buildup' : 'Neutral',
    trendStrength: Math.abs(quote.changePercent) > 1 ? 'Strong' : 'Moderate',
    confidence: Math.round(55 + Math.abs(quote.changePercent) * 8 + ivFactor * 10),
    narrative:
      bias === 'Bullish'
        ? `Futures premium +${basis.toFixed(0)} — market may trend higher into expiry`
        : bias === 'Bearish'
          ? `Futures discount ${basis.toFixed(0)} — downside pressure into expiry`
          : 'Sideways — expiry expected near spot',
    lastUpdated: new Date().toISOString(),
  };
}

/** Live futures fair value + expiry price prediction */
export function getFuturesPrediction(
  symbol: string,
  quote: LiveSymbolQuote | null,
  maxPain?: number,
): FuturesPrediction {
  refreshIndexFuturesCache();
  const cached = indexFuturesCache.get(symbol);

  if (cached && quote) {
    const spot = quote.price;
    const futuresPrice = Math.round((spot + cached.premiumDiscount) * 100) / 100;
    const predictedExpiryPrice = futuresPrice;
    const predictedMovePct = spot > 0 ? ((predictedExpiryPrice - spot) / spot) * 100 : 0;
    const bias: FuturesPrediction['bias'] =
      cached.signal === 'Long Buildup' || cached.signal === 'Short Covering'
        ? 'Bullish'
        : cached.signal === 'Short Buildup' || cached.signal === 'Long Unwinding'
          ? 'Bearish'
          : 'Neutral';

    return {
      symbol,
      spotPrice: spot,
      futuresPrice,
      basis: cached.premiumDiscount,
      basisPct: spot > 0 ? (cached.premiumDiscount / spot) * 100 : 0,
      predictedExpiryPrice,
      predictedMovePct: Math.round(predictedMovePct * 100) / 100,
      bias,
      signal: cached.signal,
      trendStrength: cached.trendStrength,
      maxPain,
      confidence: Math.round(60 + Math.abs(cached.priceChange) * 5 + (cached.trendStrength === 'Strong' ? 15 : 5)),
      narrative:
        bias === 'Bullish'
          ? `${cached.signal}: Futures ${futuresPrice.toLocaleString('en-IN')} — expiry bias UP`
          : bias === 'Bearish'
            ? `${cached.signal}: Futures ${futuresPrice.toLocaleString('en-IN')} — expiry bias DOWN`
            : `Futures fair ${futuresPrice.toLocaleString('en-IN')} — range-bound expiry`,
      lastUpdated: new Date().toISOString(),
    };
  }

  if (quote) {
    const pred = simulateStockFutures(quote);
    return { ...pred, maxPain };
  }

  return {
    symbol,
    spotPrice: 0,
    futuresPrice: 0,
    basis: 0,
    basisPct: 0,
    predictedExpiryPrice: 0,
    predictedMovePct: 0,
    bias: 'Neutral',
    signal: 'Neutral',
    trendStrength: 'Weak',
    maxPain,
    confidence: 50,
    narrative: 'Live data unavailable',
    lastUpdated: new Date().toISOString(),
  };
}
