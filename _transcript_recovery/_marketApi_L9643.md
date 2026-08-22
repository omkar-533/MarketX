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
