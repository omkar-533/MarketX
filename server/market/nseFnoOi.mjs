/**
 * F&O OI snapshots from NSE option chain (call/put OI + PCR).
 */
import { fetchNseOptionChain } from './nseOptionChain.mjs';

export async function fetchNseFnoOiBatch(symbols) {
  const list = (Array.isArray(symbols) ? symbols : [])
    .map((s) => String(s).trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40);

  const snapshots = [];
  const errors = [];
  const fetchedAt = new Date().toISOString();

  for (const symbol of list) {
    try {
      const chain = await fetchNseOptionChain(symbol);
      let callOi = 0;
      let putOi = 0;
      for (const row of chain.rows || []) {
        callOi += Number(row.ceOi) || 0;
        putOi += Number(row.peOi) || 0;
      }
      const pcr = callOi > 0 ? putOi / callOi : 0;
      snapshots.push({
        symbol,
        totalOi: callOi + putOi,
        oiChange: 0,
        oiChangePct: 0,
        callOi,
        putOi,
        pcr: Math.round(pcr * 1000) / 1000,
        source: 'nse',
        fetchedAt,
      });
    } catch (err) {
      errors.push({
        symbol,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { snapshots, errors, source: 'nse', fetchedAt };
}
