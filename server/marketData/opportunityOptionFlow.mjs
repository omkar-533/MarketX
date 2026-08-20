/**
 * Shared live option-chain snapshot for Opportunity Options Flow.
 * Uses INDstocks GET /market/option-chain. Does not touch the candle snapshot.
 * Missing / failed chain → skip that symbol. Never invent OI.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  ensureInstrumentMap,
  fetchIndstocksOptionChain,
  listUpcomingOptionExpiryYmds,
  nextNseTuesdayExpiryYmd,
  nseMonthlyExpiryYmd,
  optionChainUnderlying,
} from './indstocksClient.mjs';
import { NIFTY_50_SYMBOLS } from './universeLists.mjs';

const TTL_OPEN_MS = 75_000;
const TTL_CLOSED_MS = 15 * 60_000;
const WAVE = 4;
const PRIORITY = new Set(NIFTY_50_SYMBOLS);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const filePath = resolve(root, 'data', 'opportunity-option-flow.json');

/** @type {{ at: number, bySymbol: Record<string, object> }} */
const cache = { at: 0, bySymbol: {} };
/** @type {Promise<Record<string, object>> | null} */
let inflight = null;
let diskHydrated = false;

function num(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function legOf(raw) {
  if (!raw || typeof raw !== 'object') {
    return { oi: 0, oiChg: 0, vol: 0 };
  }
  const oi = num(raw.oi ?? raw.open_interest ?? raw.openInterest ?? raw.OI);
  const prev = num(raw.previous_oi ?? raw.prev_oi ?? raw.previousOi ?? raw.oi_prev ?? raw.prevOi);
  const chgRaw = raw.oi_change ?? raw.oiChange ?? raw.change_in_oi ?? raw.changeInOi;
  const oiChg = chgRaw != null && String(chgRaw) !== '' ? num(chgRaw) : prev > 0 ? oi - prev : 0;
  return {
    oi,
    oiChg,
    vol: num(raw.volume ?? raw.vol ?? raw.traded_volume),
  };
}

function collectStrikes(json) {
  const data = json?.data && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data : json;
  if (!data || typeof data !== 'object') return { spot: 0, expiry: '', rows: [] };
  const spot = num(data.underlying_ltp ?? data.spot ?? data.underlyingLtp ?? data.ltp);
  const expiry = String(data.expiry ?? data.expiry_date ?? '');
  const strikes = data.strikes ?? data.option_chain ?? data.chain ?? data.oc;
  const rows = [];
  if (Array.isArray(strikes)) {
    for (const row of strikes) {
      const strike = num(row?.strike ?? row?.strike_price ?? row?.strikePrice);
      if (!(strike > 0)) continue;
      rows.push({ strike, ce: legOf(row.ce ?? row.CE ?? row.call), pe: legOf(row.pe ?? row.PE ?? row.put) });
    }
  } else if (strikes && typeof strikes === 'object') {
    for (const [key, value] of Object.entries(strikes)) {
      const strike = num(value?.strike ?? key);
      if (!(strike > 0)) continue;
      rows.push({
        strike,
        ce: legOf(value?.ce ?? value?.CE ?? value?.call),
        pe: legOf(value?.pe ?? value?.PE ?? value?.put),
      });
    }
  }
  return { spot, expiry, rows };
}

function strikeStep(strikes) {
  const sorted = [...new Set(strikes)].sort((a, b) => a - b);
  if (sorted.length < 2) return 0;
  const diffs = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] || 0;
}

export function summarizeOptionChain(symbol, json, expiry, fetchedAt = Date.now()) {
  const { spot, expiry: expFromJson, rows } = collectStrikes(json);
  if (!rows.length) return null;
  let ceOi = 0;
  let peOi = 0;
  let ceOiChg = 0;
  let peOiChg = 0;
  let ceVol = 0;
  let peVol = 0;
  for (const row of rows) {
    ceOi += row.ce.oi;
    peOi += row.pe.oi;
    ceOiChg += row.ce.oiChg;
    peOiChg += row.pe.oiChg;
    ceVol += row.ce.vol;
    peVol += row.pe.vol;
  }
  if (!(ceOi > 0) && !(peOi > 0)) return null;
  const atm =
    spot > 0
      ? rows.reduce((best, row) => (Math.abs(row.strike - spot) < Math.abs(best.strike - spot) ? row : best), rows[0])
      : rows[Math.floor(rows.length / 2)];
  const step = strikeStep(rows.map((r) => r.strike));
  const band = step > 0 ? 2 * step : 0;
  let atmBandCeOiChg = 0;
  let atmBandPeOiChg = 0;
  for (const row of rows) {
    if (band > 0 && Math.abs(row.strike - atm.strike) > band) continue;
    if (band === 0 && row.strike !== atm.strike) continue;
    atmBandCeOiChg += row.ce.oiChg;
    atmBandPeOiChg += row.pe.oiChg;
  }
  const pcr = ceOi > 0 ? peOi / ceOi : null;
  return {
    symbol: String(symbol || '').toUpperCase(),
    expiry: String(expFromJson || expiry || ''),
    fetchedAt,
    spot,
    ceOi,
    peOi,
    ceOiChg,
    peOiChg,
    ceVol,
    peVol,
    pcr: pcr != null && Number.isFinite(pcr) ? pcr : null,
    atmStrike: atm?.strike ?? null,
    atmBandCeOiChg,
    atmBandPeOiChg,
  };
}

function ttlMs(now = Date.now()) {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
  const open = Date.parse(`${ymd}T09:15:00+05:30`);
  const close = Date.parse(`${ymd}T15:30:00+05:30`);
  return now >= open && now <= close ? TTL_OPEN_MS : TTL_CLOSED_MS;
}

function hydrateDisk() {
  if (diskHydrated) return;
  diskHydrated = true;
  try {
    if (!existsSync(filePath)) return;
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.bySymbol || typeof raw.bySymbol !== 'object') return;
    cache.bySymbol = raw.bySymbol;
    cache.at = Number(raw.at) || 0;
  } catch {
    /* ignore */
  }
}

function persistDisk() {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ at: cache.at, bySymbol: cache.bySymbol }), 'utf8');
  } catch (err) {
    console.warn('[opportunity-option-flow] disk skip', err?.message || err);
  }
}

export function peekOpportunityOptionFlow() {
  hydrateDisk();
  return cache.bySymbol;
}

function rankSymbols(symbols) {
  return [...new Set((symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean))].sort((a, b) => {
    const pa = PRIORITY.has(a) ? 0 : 1;
    const pb = PRIORITY.has(b) ? 0 : 1;
    return pa - pb || a.localeCompare(b);
  });
}

/** Master dates first. Otherwise Tuesday weekly + monthly Thursday — never today's non-expiry Thursday. */
export function planOptionFlowExpiries(symbol, now = Date.now()) {
  const fromMaster = listUpcomingOptionExpiryYmds(symbol, now).slice(0, 2);
  if (fromMaster.length) return fromMaster;
  return [...new Set([nextNseTuesdayExpiryYmd(now), nseMonthlyExpiryYmd(now)].filter(Boolean))];
}

async function pullSymbol(accessToken, symbol) {
  const under = optionChainUnderlying(symbol);
  if (!under) return null;
  for (const expiry of planOptionFlowExpiries(symbol)) {
    try {
      const json = await fetchIndstocksOptionChain(accessToken, {
        exchange: under.exchange,
        segment: under.segment,
        underlyingScrip: under.underlyingScrip,
        expiry,
        strikeCount: 8,
      });
      const row = json ? summarizeOptionChain(symbol, json, expiry) : null;
      if (row) return row;
    } catch {
      /* wrong expiry / 400 — try the next Thursday */
    }
  }
  return null;
}

async function pullWave(accessToken, symbols, next) {
  let added = 0;
  for (let i = 0; i < symbols.length; i += WAVE) {
    const slice = symbols.slice(i, i + WAVE);
    await Promise.all(
      slice.map(async (symbol) => {
        try {
          const row = await pullSymbol(accessToken, symbol);
          if (row) {
            next[symbol] = row;
            added += 1;
          }
        } catch {
          /* keep previous row — never invent */
        }
      }),
    );
    cache.bySymbol = next;
    cache.at = Date.now();
    persistDisk();
  }
  return added;
}

async function refreshOptionFlow(accessToken, symbols) {
  hydrateDisk();
  await ensureInstrumentMap(accessToken);
  const unique = rankSymbols(symbols).filter((s) => optionChainUnderlying(s));
  const first = unique.slice(0, 16);
  const rest = unique.slice(16);
  const next = { ...cache.bySymbol };
  const firstN = await pullWave(accessToken, first, next);
  persistDisk();
  const restN = await pullWave(accessToken, rest, next);
  cache.at = Date.now();
  cache.bySymbol = next;
  persistDisk();
  console.log(`[opportunity-option-flow] ready n=${Object.keys(next).length} first=${firstN} rest=${restN}`);
  return next;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Return last-session / live chain snaps as soon as a useful batch is in.
 * Full universe keeps filling in the background. Never blocks the other 9 cards for minutes.
 */
export async function awaitOpportunityOptionFlow(accessToken, symbols, opts = {}, now = Date.now()) {
  hydrateDisk();
  const budgetMs = Math.max(8_000, Number(opts.budgetMs) || 25_000);
  const minReady = Math.max(1, Number(opts.minReady) || 8);
  if (cache.at > 0 && now - cache.at < ttlMs(now) && Object.keys(cache.bySymbol).length >= minReady) {
    return cache.bySymbol;
  }
  if (!inflight) {
    inflight = refreshOptionFlow(accessToken, symbols)
      .catch((err) => {
        console.warn('[opportunity-option-flow] skip', err?.message || err);
        return cache.bySymbol;
      })
      .finally(() => {
        inflight = null;
      });
  }
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (Object.keys(cache.bySymbol).length >= minReady) return cache.bySymbol;
    if (!inflight) break;
    await sleep(400);
  }
  return cache.bySymbol;
}
