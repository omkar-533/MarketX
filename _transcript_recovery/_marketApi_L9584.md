### old
```
export async function fetchMarketOhlc(symbol: string, _interval: string, _range?: string) {
  if (MODE === 'throw') throw new Error('network down');
  if (MODE === 'empty') return null;
  const base = symbol.includes('BTC') ? 62000 : symbol === 'NIFTY' ? 23500 : 1800;
  return { bars: makeBars(400, base) };
}
```
### new
```
const cache = new Map<string, MarketBar[]>();

export async function fetchMarketOhlc(symbol: string, interval: string, range?: string) {
  if (MODE === 'throw') throw new Error('network down');
  if (MODE === 'empty') return null;
  if (MODE === 'real') {
    const key = `${symbol}:${interval}`;
    if (!cache.has(key)) {
      const res = await fetch(
        `http://localhost:5000/api/market/ohlc?symbol=${symbol}&interval=${interval}&range=${range ?? '3mo'}`,
      );
      const json = (await res.json()) as { bars?: MarketBar[] };
      cache.set(key, json.bars ?? []);
    }
    return { bars: cache.get(key) ?? [] };
  }
  const base = symbol.includes('BTC') ? 62000 : symbol === 'NIFTY' ? 23500 : 1800;
  return { bars: makeBars(400, base) };
}
```
