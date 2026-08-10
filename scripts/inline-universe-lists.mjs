import { readFileSync, writeFileSync } from 'fs';

const j = JSON.parse(readFileSync('server/marketData/universeLists.json', 'utf8'));
const content = `/**
 * Server-side universe lists (inlined — no filesystem read at boot).
 * Keep in sync with src/services/radar/universeCatalog.ts
 */
export const NIFTY_50_SYMBOLS = ${JSON.stringify(j.NIFTY_50, null, 2)};
export const FNO_EXTRA_UNDERLYINGS = ${JSON.stringify(j.FNO_EXTRA, null, 2)};

export function getNifty50Universe() {
  return [...NIFTY_50_SYMBOLS];
}

export function getFnoUniverse() {
  return [...new Set([...NIFTY_50_SYMBOLS, ...FNO_EXTRA_UNDERLYINGS])];
}

export function resolveServerUniverse(universe) {
  const id = String(universe || 'F&O');
  if (id === 'NIFTY50' || id === 'NIFTY') return getNifty50Universe();
  if (id === 'CASH') return getNifty50Universe();
  if (id === 'BANKNIFTY') {
    return [
      'HDFCBANK',
      'ICICIBANK',
      'AXISBANK',
      'KOTAKBANK',
      'SBIN',
      'INDUSINDBK',
      'BANKBARODA',
      'FEDERALBNK',
      'IDFCFIRSTB',
      'PNB',
      'AUBANK',
      'BANDHANBNK',
    ];
  }
  return getFnoUniverse();
}
`;
writeFileSync('server/marketData/universeLists.mjs', content);
console.log('ok', j.NIFTY_50.length, j.FNO_EXTRA.length);
