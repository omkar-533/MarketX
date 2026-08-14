/**
 * Live instrument universes derived from INDstocks instrument master CSVs.
 * Counts are dynamic — never hardcoded product sizes.
 *
 * Classifications:
 * - EQUITY (NSE / BSE)
 * - INDEX
 * - F&O_UNDERLYING (unique equity underlyings from FUTSTK/OPTSTK — not each contract)
 */
import { resolveServerUniverse } from './universeLists.mjs';

/** @type {{
 *   nseEquity: string[],
 *   bseEquity: string[],
 *   fnoUnderlyings: string[],
 *   indices: string[],
 *   rawRows: number,
 *   at: number,
 * }} */
const state = {
  nseEquity: [],
  bseEquity: [],
  fnoUnderlyings: [],
  indices: [],
  rawRows: 0,
  at: 0,
};

export function normalizeUniverseSymbol(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/^NSE:/, '')
    .replace(/^BSE:/, '')
    .replace(/-EQ$/, '')
    .replace(/\s+/g, '')
    .trim();
}

function symbolKeys(raw) {
  const n = normalizeUniverseSymbol(raw);
  if (!n) return [];
  const keys = [n];
  if (n.includes('&')) keys.push(n.replace(/&/g, ''));
  return keys;
}

function sortedUnique(set) {
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Rebuild classified universes from parsed instrument CSV rows.
 * @param {{ equity?: object[], index?: object[], fno?: object[] }} packs
 */
export function rebuildInstrumentUniverses(packs = {}) {
  const nseEq = new Set();
  const bseEq = new Set();
  const fnoU = new Set();
  const idxs = new Set();
  let rawRows = 0;

  for (const row of packs.equity || []) {
    rawRows += 1;
    const exch = String(row.EXCH || 'NSE').toUpperCase();
    const series = String(row.SERIES || '').toUpperCase();
    const inst = String(row.INSTRUMENT_NAME || row.SEM_EXCH_INSTRUMENT_TYPE || '').toUpperCase();
    // Prefer pure equities; skip bonds/ETFs when series clearly marks them.
    if (series && series !== 'EQ' && series !== 'BE' && series !== 'SM' && series !== 'A') {
      // still allow empty series / EQUITY instrument name
      if (!/EQUITY|EQ/.test(inst) && series !== '') continue;
    }
    const base = normalizeUniverseSymbol(row.SYMBOL_NAME || row.TRADING_SYMBOL || row.CUSTOM_SYMBOL);
    if (!base || base.length > 24) continue;
    // Skip obvious index names accidentally present in equity dump
    if (/^(NIFTY|BANKNIFTY|FINNIFTY|SENSEX|INDIAVIX)/.test(base)) continue;
    if (exch === 'BSE') bseEq.add(base);
    else nseEq.add(base);
  }

  for (const row of packs.index || []) {
    rawRows += 1;
    const base = normalizeUniverseSymbol(row.SYMBOL_NAME || row.TRADING_SYMBOL || row.CUSTOM_SYMBOL);
    if (!base) continue;
    idxs.add(base);
  }

  for (const row of packs.fno || []) {
    rawRows += 1;
    const inst = String(
      row.INSTRUMENT_NAME || row.SEM_EXCH_INSTRUMENT_TYPE || row.INSTRUMENT || '',
    ).toUpperCase();
    const name = normalizeUniverseSymbol(row.SYMBOL_NAME || '');
    if (!name) continue;
    // Stock derivatives → underlying equity (one per company)
    const isIdx =
      /FUTIDX|OPTIDX|INDEX/.test(inst) ||
      /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX|INDIAVIX)/.test(name);
    if (isIdx) {
      idxs.add(name);
      continue;
    }
    const isStk =
      /FUTSTK|OPTSTK|FUTSTK|STK/.test(inst) ||
      (!inst && name.length <= 15); // SYMBOL_NAME present on FO rows → underlying
    if (isStk || /FUT|OPT|CE|PE/.test(String(row.TRADING_SYMBOL || '').toUpperCase())) {
      // Prefer SYMBOL_NAME; skip contract-looking trading symbols used as only name
      if (name.length <= 20 && !/\d{2}[A-Z]{3}FUT|\d{2}[A-Z]{3}\d+CE|\d{2}[A-Z]{3}\d+PE/.test(name)) {
        fnoU.add(name);
      }
    }
  }

  state.nseEquity = sortedUnique(nseEq);
  state.bseEquity = sortedUnique(bseEq);
  state.fnoUnderlyings = sortedUnique(fnoU);
  state.indices = sortedUnique(idxs);
  state.rawRows = rawRows;
  state.at = Date.now();

  return getInstrumentUniverseStats();
}

export function getInstrumentUniverseStats() {
  return {
    nseEquity: state.nseEquity.length,
    bseEquity: state.bseEquity.length,
    fnoUnderlyings: state.fnoUnderlyings.length,
    indices: state.indices.length,
    rawRows: state.rawRows,
    refreshedAt: state.at || null,
    source: state.at ? 'indstocks-instrument-master' : 'empty',
  };
}

/**
 * Live universe symbols when instrument master has been refreshed.
 * Returns null to signal "use static catalog fallback".
 */
export function getLiveUniverseSymbols(universeId) {
  const id = String(universeId || 'F&O');
  if (id === 'NSE' || id === 'NSE_EQ' || id === 'CASH') {
    if (state.nseEquity.length) return [...state.nseEquity];
    return null;
  }
  if (id === 'BSE' || id === 'BSE_EQ') {
    if (state.bseEquity.length) return [...state.bseEquity];
    return null;
  }
  if (id === 'F&O') {
    const fallback = resolveServerUniverse('F&O');
    if (state.fnoUnderlyings.length) {
      return sortedUnique(new Set([...state.fnoUnderlyings, ...fallback]));
    }
    return null;
  }
  if (id === 'INDEX' || id === 'INDICES') {
    if (state.indices.length) return [...state.indices];
    return null;
  }
  // NIFTY50 / BANKNIFTY keep static curated lists (index constituents, not full FO dump)
  return null;
}

export function resolveUniverseSymbols(universeId) {
  const live = getLiveUniverseSymbols(universeId);
  if (live?.length) return live;
  return resolveServerUniverse(universeId);
}

export function universeAliasKeysFromName(name) {
  return symbolKeys(name);
}
