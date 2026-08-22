## L9584 StrReplace

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

## L9585 StrReplace

### old
```
export let MODE: 'ok' | 'empty' | 'throw' = 'ok';
export function setMode(m: 'ok' | 'empty' | 'throw') {
  MODE = m;
}
```

### new
```
export let MODE: 'ok' | 'empty' | 'throw' | 'real' = 'ok';
export function setMode(m: 'ok' | 'empty' | 'throw' | 'real') {
  MODE = m;
}
```

## L9643 StrReplace

### old
```
export async function fetchMarketOhlc(
  symbol: string,
  interval: string,
  range?: string,
): Promise<MarketOhlcResponse | null> {
  try {
    const q = new URLSearchParams({ symbol, interval });
    if (range) q.set('range', range);
    const res = await apiFetch(`/api/market/ohlc?${q}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
```

### new
```
export async function fetchMarketOhlc(
  symbol: string,
  interval: string,
  range?: string,
  bars?: number,
): Promise<MarketOhlcResponse | null> {
  try {
    const q = new URLSearchParams({ symbol, interval });
    if (range) q.set('range', range);
    if (bars && bars > 0) q.set('bars', String(Math.floor(bars)));
    const res = await apiFetch(`/api/market/ohlc?${q}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
```

