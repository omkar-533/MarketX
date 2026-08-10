/**
 * Server-side universe lists — loaded from shared snapshot JSON.
 * Keep in sync with src/services/radar/universeCatalog.ts (regenerate JSON when catalog changes).
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(root, 'universeLists.json'), 'utf8'));

export const NIFTY_50_SYMBOLS = raw.NIFTY_50;
export const FNO_EXTRA_UNDERLYINGS = raw.FNO_EXTRA;

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
