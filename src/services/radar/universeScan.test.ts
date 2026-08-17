import { describe, expect, it } from 'vitest';
import { runRadarScanFull, DEFAULT_DISPLAY_LIMIT } from './radarScanner';
import { mockMarketDataProvider } from './MockMarketDataProvider';
import { getFnoUniverse, getNifty50Universe, getNseEquityUniverse } from './universeCatalog';

describe('universe catalog', () => {
  it('NIFTY 50 has 50 symbols', () => {
    expect(getNifty50Universe()).toHaveLength(50);
  });
  it('F&O underlyings are far larger than 10', () => {
    expect(getFnoUniverse().length).toBeGreaterThan(100);
  });
  it('NSE equity catalog is the full cash book, not a 19-name fallback', () => {
    expect(getNseEquityUniverse().length).toBeGreaterThan(1000);
  });
});

describe('full universe scan', () => {
  it('evaluates all NIFTY50 symbols and only truncates display', async () => {
    await mockMarketDataProvider.connect();
    const out = await runRadarScanFull(
      { market: 'NSE', universe: 'NIFTY50', timeframe: '5m' },
      { displayLimit: DEFAULT_DISPLAY_LIMIT },
      mockMarketDataProvider,
    );
    expect(out.summary.universeLoaded).toBe(50);
    expect(out.summary.scanned).toBe(50);
    expect(out.results.length).toBeLessThanOrEqual(DEFAULT_DISPLAY_LIMIT);
    expect(out.allMatches.length).toBe(out.summary.matched);
    expect(out.results.length).toBe(out.summary.displayed);
  }, 60_000);
});
