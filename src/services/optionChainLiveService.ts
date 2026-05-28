import type { OptionData } from '../data/marketData';
import { sanitizeDisplayMessage } from '../constants/brandLabels';
import { calculateGreeks } from './optionPricing';
import type { EnhancedOptionRow } from './optionChainEngine';

function daysToExpiry(expiryLabel: string): number {
  const parsed = new Date(expiryLabel).getTime();
  if (Number.isNaN(parsed)) return 7;
  return Math.max(1, Math.ceil((parsed - Date.now()) / 86400000));
}

import { getLiveQuote } from './symbolLiveService';

function buildOptionExpiries(count = 8): string[] {
  const out: string[] = [];
  const today = new Date();
  let d = new Date(today);
  d.setHours(0, 0, 0, 0);
  while (out.length < count) {
    if (d.getDay() === 4) {
      out.push(d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
    }
    d.setDate(d.getDate() + 1);
  }
  return out.slice(0, count);
}

export type OptionChainSnapshot = {
  symbol: string;
  spot: number;
  expiry: string;
  expiryIso?: string;
  expiryTimestamp?: string;
  expiries: string[];
  rows: EnhancedOptionRow[];
  source: string;
  fetchedAt: string;
  error?: string;
};

const cache = new Map<string, OptionChainSnapshot>();
let refreshInFlight: Promise<void> | null = null;
const fetchInFlight = new Map<string, Promise<OptionChainSnapshot | null>>();
const lastFetchAt = new Map<string, number>();
const MIN_FETCH_GAP_MS = 45_000;

function cacheKey(symbol: string, expiry?: string) {
  return `${symbol}:${expiry || ''}`;
}

function round(n: number, d = 2) {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function classifyBuildup(priceChg: number, oiChg: number) {
  if (Math.abs(oiChg) < 500) return 'Neutral' as const;
  if (oiChg > 0 && priceChg > 0) return 'Long Buildup' as const;
  if (oiChg > 0 && priceChg < 0) return 'Short Buildup' as const;
  if (oiChg < 0 && priceChg > 0) return 'Short Covering' as const;
  if (oiChg < 0 && priceChg < 0) return 'Long Unwinding' as const;
  return 'Neutral' as const;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
}

function enrichRow(row: OptionData, spot: number, dte: number): EnhancedOptionRow {
  const strike = safeNumber(row.strike);
  const ceIv = row.ceIv > 0 ? row.ceIv : 18;
  const peIv = row.peIv > 0 ? row.peIv : 18;
  const ceOi = safeNumber(row.ceOi);
  const peOi = safeNumber(row.peOi);
  const ceOiChg = safeNumber(row.ceOiChg);
  const peOiChg = safeNumber(row.peOiChg);
  const ceG = calculateGreeks(spot, strike, dte, ceIv, 'CE');
  const peG = calculateGreeks(spot, strike, dte, peIv, 'PE');
  const strikePcr = round(peOi / Math.max(ceOi, 1));
  return {
    ...row,
    strike,
    ceDelta: ceG.delta,
    ceGamma: ceG.gamma,
    ceTheta: ceG.theta,
    ceVega: ceG.vega,
    ceRho: ceG.rho,
    peDelta: peG.delta,
    peGamma: peG.gamma,
    peTheta: peG.theta,
    peVega: peG.vega,
    peRho: peG.rho,
    strikePcr,
    ceBuildup: classifyBuildup(0, ceOiChg),
    peBuildup: classifyBuildup(0, peOiChg),
    ceOiChgPct: round((ceOiChg / Math.max(ceOi, 1)) * 100),
    peOiChgPct: round((peOiChg / Math.max(peOi, 1)) * 100),
  };
}

function getStaleSnapshot(sym: string, expiry?: string): OptionChainSnapshot | null {
  return (
    cache.get(cacheKey(sym, expiry)) ??
    cache.get(cacheKey(sym, '')) ??
    [...cache.values()].find((c) => c.symbol === sym) ??
    null
  );
}

function applyStrikeWindow(
  snap: OptionChainSnapshot,
  strikeWindow?: number,
): OptionChainSnapshot {
  if (!strikeWindow || !snap.rows.length || !snap.spot) return snap;
  return { ...snap, rows: sliceAroundAtm(snap.rows, snap.spot, strikeWindow) };
}

function sliceAroundAtm(rows: EnhancedOptionRow[], spot: number, window = 21): EnhancedOptionRow[] {
  if (!rows.length || rows.length <= window) return rows;
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  const atmIdx = sorted.reduce(
    (best, r, i) =>
      Math.abs(r.strike - spot) < Math.abs(sorted[best].strike - spot) ? i : best,
    Math.floor(sorted.length / 2),
  );
  const half = Math.floor(window / 2);
  const from = Math.max(0, atmIdx - half);
  return sorted.slice(from, from + window);
}

export async function fetchOptionChainLive(
  symbol: string,
  expiry?: string,
  opts?: { force?: boolean; strikeWindow?: number },
): Promise<OptionChainSnapshot | null> {
  const sym = symbol.trim().toUpperCase();
  const fetchKey = cacheKey(sym, expiry);
  const inflight = fetchInFlight.get(fetchKey);
  if (inflight) return inflight;

  const run = async (): Promise<OptionChainSnapshot | null> => {
    const lastAt = lastFetchAt.get(fetchKey) ?? 0;
    if (!opts?.force && Date.now() - lastAt < MIN_FETCH_GAP_MS) {
      const stale = getStaleSnapshot(sym, expiry);
      if (stale?.rows.length) return applyStrikeWindow(stale, opts?.strikeWindow);
    }

    try {
    const q = new URLSearchParams({ symbol: sym });
    if (expiry) q.set('expiry', expiry);
    const res = await fetch(`/api/market/option-chain?${q}`);
    const data = await res.json().catch(() => ({}));
    lastFetchAt.set(fetchKey, Date.now());

    if (!res.ok) {
      const stale = getStaleSnapshot(sym, expiry);
      if (stale?.rows.length) return stale;
      return {
        symbol: sym,
        spot: 0,
        expiry: expiry ?? '',
        expiries: buildOptionExpiries(8),
        rows: [],
        source: 'error',
        fetchedAt: new Date().toISOString(),
        error: sanitizeDisplayMessage(data?.error ?? `HTTP ${res.status}`),
      };
    }
    if (data.source && data.source !== 'fyers' && data.source !== 'fyers-cached') {
      return {
        symbol: sym,
        spot: 0,
        expiry: expiry ?? '',
        expiries: [],
        rows: [],
        source: data.source,
        fetchedAt: new Date().toISOString(),
        error: 'Option chain sirf TradeX Live se available hai.',
      };
    }
    const spot =
      Number(data.spot) ||
      getLiveQuote(sym)?.price ||
      0;
    const exp = String(data.expiry || expiry || '');
    const dte = daysToExpiry(exp);
    const sourceRows = Array.isArray(data.rows) ? data.rows.filter((row): row is OptionData => row != null) : [];
    const allRows = sourceRows.map((r: OptionData) =>
      enrichRow(
        {
          ...r,
          pcr: r.pcr ?? r.peOi / Math.max(r.ceOi, 1),
        },
        spot,
        dte,
      ),
    );
    const window = opts?.strikeWindow ?? 0;
    const rows = window > 0 && spot > 0 ? sliceAroundAtm(allRows, spot, window) : allRows;
    const snap: OptionChainSnapshot = {
      symbol: sym,
      spot,
      expiry: exp,
      expiries: data.expiries ?? [],
      rows,
      source: data.source ?? 'fyers',
      expiryIso: data.expiryIso,
      expiryTimestamp: data.expiryTimestamp,
      fetchedAt: data.fetchedAt ?? new Date().toISOString(),
      error: data.error
        ? sanitizeDisplayMessage(data.error)
        : allRows.length
          ? undefined
          : data?.error
            ? sanitizeDisplayMessage(data.error)
            : undefined,
    };
    if (allRows.length) {
      const full: OptionChainSnapshot = { ...snap, rows: allRows };
      cache.set(cacheKey(sym, exp), full);
      cache.set(cacheKey(sym, ''), full);
    }
    return applyStrikeWindow(snap, opts?.strikeWindow);
    } catch (err) {
      const stale = getStaleSnapshot(sym, expiry);
      if (stale?.rows.length) return applyStrikeWindow(stale, opts?.strikeWindow);
      return {
        symbol: sym,
        spot: 0,
        expiry: expiry ?? '',
        expiries: buildOptionExpiries(8),
        rows: [],
        source: 'error',
        fetchedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  };

  const p = run().finally(() => fetchInFlight.delete(fetchKey));
  fetchInFlight.set(fetchKey, p);
  return p;
}

export function getCachedOptionChain(
  symbol: string,
  expiry?: string,
  strikeWindow = 21,
): EnhancedOptionRow[] {
  const sym = symbol.trim().toUpperCase();
  const snap =
    cache.get(cacheKey(sym, expiry)) ??
    cache.get(cacheKey(sym, '')) ??
    [...cache.values()].find((c) => c.symbol === sym);
  if (!snap?.rows.length) return [];

  const spot = snap.spot || getLiveQuote(sym)?.price || 0;
  const half = Math.floor(strikeWindow / 2);
  const atm = snap.rows.reduce((best, r) =>
    Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best,
  snap.rows[Math.floor(snap.rows.length / 2)]);

  const sorted = [...snap.rows].sort((a, b) => a.strike - b.strike);
  const atmIdx = sorted.findIndex((r) => r.strike === atm.strike);
  const center = atmIdx >= 0 ? atmIdx : Math.floor(sorted.length / 2);
  const from = Math.max(0, center - half);
  const to = Math.min(sorted.length, from + strikeWindow);
  return sorted.slice(from, to);
}

/** ATM IV from cached chain — no symbolLiveService import (avoids circular dep) */
export function getAtmIvFromCache(symbol: string, spot: number): number | null {
  const sym = symbol.trim().toUpperCase();
  if (!spot) return null;
  const snap =
    cache.get(cacheKey(sym, '')) ??
    [...cache.values()].find((c) => c.symbol === sym);
  if (!snap?.rows.length) return null;

  const ivs: number[] = [];
  for (const r of snap.rows) {
    if (Math.abs(r.strike - spot) / spot > 0.1) continue;
    if (r.ceIv > 0) ivs.push(r.ceIv);
    if (r.peIv > 0) ivs.push(r.peIv);
  }
  if (!ivs.length) return null;
  return Math.round((ivs.reduce((a, b) => a + b, 0) / ivs.length) * 10) / 10;
}

export function getCachedExpiries(symbol: string): string[] {
  const sym = symbol.trim().toUpperCase();
  const snap = cache.get(cacheKey(sym, '')) ?? [...cache.values()].find((c) => c.symbol === sym);
  return snap?.expiries?.length ? snap.expiries : buildOptionExpiries(8);
}

export async function refreshOptionChainsLive(symbols: string[]): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  refreshInFlight = (async () => {
    for (const sym of unique.slice(0, 2)) {
      await fetchOptionChainLive(sym);
      await new Promise((r) => setTimeout(r, 800));
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
