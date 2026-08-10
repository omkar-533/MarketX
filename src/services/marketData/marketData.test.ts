/**
 * Market data layer unit tests — normalization, quality, scoring pipeline compat.
 */
import { mockMarketDataProvider } from '../radar/MockMarketDataProvider';
import { normalizeCandleSeries, validateCandles, validateQuote } from './DataQualityService';
import { MarketDataCache } from './MarketDataCache';
import { RateLimitManager } from './RateLimitManager';
import { HistoricalMarketDataService } from './HistoricalMarketDataService';
import { initMarketDataService } from './MarketDataService';
import { UniverseService } from './UniverseService';
import type { Candle } from '../radar/radarTypes';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function testMockProviderContract() {
  await mockMarketDataProvider.connect();
  const caps = mockMarketDataProvider.getCapabilities();
  assert(caps.orderExecution === false, 'orderExecution must be false');
  assert(caps.historicalCandles === true, 'demo historical');
  assert(caps.liveQuotes === false, 'demo is not live quotes');
  assert(mockMarketDataProvider.isDemo === true, 'isDemo');

  const quote = await mockMarketDataProvider.getQuote('RELIANCE');
  assert(quote.lastPrice > 0 && quote.price === quote.lastPrice, 'quote prices');
  assert(quote.symbol === 'RELIANCE', 'quote symbol');

  const candles = await mockMarketDataProvider.getCandles('RELIANCE', '5m', 40);
  assert(candles.length > 20, 'candles length');
  assert(candles.every((c) => c.high >= c.low), 'ohlc');

  const instruments = await mockMarketDataProvider.getInstrumentList();
  assert(instruments.some((i) => i.symbol === 'RELIANCE'), 'instruments');

  const status = await mockMarketDataProvider.getMarketStatus('NSE');
  assert(status.exchange === 'NSE', 'market status');

  await mockMarketDataProvider.disconnect();
  console.log('✓ provider contract');
}

function testCandleNormalizeAndQuality() {
  const raw: Candle[] = [
    {
      symbol: 'X',
      exchange: 'NSE',
      timeframe: '5m',
      timestamp: 300,
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: 1,
    },
    {
      symbol: 'X',
      exchange: 'NSE',
      timeframe: '5m',
      timestamp: 100,
      open: 10,
      high: 11,
      low: 9,
      close: 10.2,
      volume: 1,
    },
    {
      symbol: 'X',
      exchange: 'NSE',
      timeframe: '5m',
      timestamp: 100,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 2,
    },
  ];
  const sorted = normalizeCandleSeries(raw);
  assert(sorted.length === 2, 'dedupe');
  assert(sorted[0].timestamp < sorted[1].timestamp, 'sorted');

  const bad: Candle[] = [
    {
      symbol: 'X',
      exchange: 'NSE',
      timeframe: '5m',
      timestamp: 1,
      open: 10,
      high: 9,
      low: 11,
      close: 10,
      volume: 1,
    },
  ];
  const q = validateCandles(bad);
  assert(q.ok === false && q.warning === 'DATA_QUALITY_WARNING', 'invalid ohlc flagged');
  console.log('✓ candle normalize/quality');
}

function testQuoteStale() {
  const report = validateQuote(
    {
      symbol: 'X',
      exchange: 'NSE',
      timestamp: Date.now() - 120_000,
      lastPrice: 10,
      price: 10,
      changePercent: 0,
    },
    60_000,
  );
  assert(report.issues.includes('STALE_QUOTE'), 'stale');
  console.log('✓ quote quality');
}

function testCache() {
  const cache = new MarketDataCache(1000);
  cache.set('k', { a: 1 }, { source: 'mock-demo', mode: 'DEMO', ttlMs: 50 });
  assert(cache.get<{ a: number }>('k')?.data.a === 1, 'hit');
  console.log('✓ cache');
}

async function testRateLimit() {
  const rl = new RateLimitManager({
    requestsPerSecond: 50,
    requestsPerMinute: 1000,
    maxSubscriptions: 2,
    historicalRequestLimit: 100,
  });
  await rl.acquire('quote');
  assert(rl.canSubscribe(1) === true, 'sub ok');
  assert(rl.canSubscribe(2) === false, 'sub limit');
  console.log('✓ rate limit');
}

async function testServices() {
  const svc = initMarketDataService(mockMarketDataProvider);
  const view = await svc.connect();
  assert(view.orderAccess === 'NOT ENABLED', 'no orders');
  assert(view.mode === 'DEMO', 'demo mode');
  assert(view.message.includes('DEMO'), 'demo label');

  const hist = new HistoricalMarketDataService(mockMarketDataProvider);
  const res = await hist.getCandles('SBIN', '15m', 50);
  assert(res.candles.length > 10, 'historical');
  assert(res.mode === 'DEMO', 'hist mode');

  const uni = new UniverseService(mockMarketDataProvider);
  const fno = await uni.getFNOUniverse();
  assert(fno.includes('RELIANCE'), 'universe');

  await svc.disconnect();
  console.log('✓ market data services');
}

async function main() {
  await testMockProviderContract();
  testCandleNormalizeAndQuality();
  testQuoteStale();
  testCache();
  await testRateLimit();
  await testServices();
  console.log('All marketData tests passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
