/**
 * Shared Opportunity day log — one IST-day board for every login.
 * Morning prints stay. Later reprints append. Market close does not wipe.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const SCANNER_META = [
  ['breakout_radar', 'BREAKOUT RADAR', 'Price closed above a recent high or below a recent low, with volume confirming the break.'],
  ['momentum_surge', 'MOMENTUM SURGE', "Sharp price move plus unusual volume versus the stock's own recent average (RVOL)."],
  ['compression_break', 'COMPRESSION BREAK', 'ATR/range squeezed tight, then price left that box — expansion after a quiet coil.'],
  ['trend_rider', 'TREND RIDER', 'EMA 21/50 stacked one way, RSI agreeing, and price holding a pullback to the trend.'],
  ['liquidity_hunt', 'LIQUIDITY HUNT', 'Equal highs/lows swept (stop-hunt), then reclaim — SMC liquidity, not a random mover.'],
  ['wolf_prime', 'WOLF PRIME', 'Same name hits 2+ of the scanners above on this bar — conviction overlay, not a new setup.'],
  ['momentum_fade', 'MOMENTUM FADE', 'Price still stretching while RSI momentum cools — a watch for exhaustion, not a reversal call.'],
  ['reversal_hunter', 'REVERSAL HUNTER', 'Extended RSI/move plus a liquidity sweep. Needs reclaim confirmation before it is a trade.'],
  ['sector_leaders', 'SECTOR LEADERS', 'Stocks leading or lagging their sector versus peers on the same scan (relative strength).'],
  ['flow_shift', 'FLOW SHIFT', 'Price up/down with volume up/down as a futures OI buildup proxy. Live OI feed is not used.'],
  ['options_flow', 'OPTIONS FLOW', 'ATR and the day range expanding with volume. Not option-chain OI, PCR, or strike data.'],
];

const SCANNER_IDS = new Set(SCANNER_META.map((s) => s[0]));
const CAP = 80;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const filePath = resolve(root, 'data', 'opportunity-day-board.json');

export function istCalendarDay(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

export function boardSlot(universe, timeframe, now = Date.now()) {
  const tf = String(timeframe || '5m');
  const u = String(universe || 'F&O');
  return `${istCalendarDay(now)}|${u}|${tf}`;
}

function emptyHits() {
  /** @type {Record<string, object[]>} */
  const hits = {};
  for (const [id] of SCANNER_META) hits[id] = [];
  return hits;
}

function readAll() {
  try {
    if (!existsSync(filePath)) return { day: '', boards: {} };
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return raw && typeof raw === 'object' ? raw : { day: '', boards: {} };
  } catch {
    return { day: '', boards: {} };
  }
}

function writeAll(data) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.warn('[opportunity-day-board] disk skip', err?.message || err);
  }
}

function listingOk(ms, day) {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return false;
  if (t > Date.now() + 2_000) return false;
  if (istCalendarDay(t) !== day) return false;
  const open = Date.parse(`${day}T09:15:00+05:30`);
  const close = Date.parse(`${day}T15:30:00+05:30`);
  return t >= open - 2_000 && t <= close + 2_000;
}

function slimHit(raw, day) {
  if (!raw || typeof raw !== 'object') return null;
  const scannerId = String(raw.scannerId || '');
  const symbol = String(raw.symbol || '').toUpperCase();
  const detectedAt = Number(raw.detectedAt);
  if (!SCANNER_IDS.has(scannerId) || !symbol || !listingOk(detectedAt, day)) return null;
  const score = Number(raw.score);
  if (!Number.isFinite(score) || score < 50 || score > 100) return null;
  return {
    id: `opp-${scannerId}-${symbol}-${raw.timeframe || '5m'}-${detectedAt}`,
    scannerId,
    symbol,
    exchange: raw.exchange === 'BSE' ? 'BSE' : 'NSE',
    price: Number(raw.price) || 0,
    changePercent: Number(raw.changePercent) || 0,
    timeframe: String(raw.timeframe || '5m'),
    direction: raw.direction === 'bearish' ? 'bearish' : raw.direction === 'neutral' ? 'neutral' : 'bullish',
    status: String(raw.status || 'WATCH'),
    score: Math.round(score),
    breakdown: raw.breakdown && typeof raw.breakdown === 'object' ? raw.breakdown : {},
    stateLabel: String(raw.stateLabel || ''),
    why: String(raw.why || '').slice(0, 280),
    keyLevel: raw.keyLevel == null ? null : Number(raw.keyLevel),
    trigger: raw.trigger == null ? null : Number(raw.trigger),
    invalidation: String(raw.invalidation || '').slice(0, 160),
    confirmationNeeded: String(raw.confirmationNeeded || '').slice(0, 160),
    evidence: Array.isArray(raw.evidence) ? raw.evidence.slice(0, 8) : [],
    detectedAt,
    dataMode: 'LIVE',
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
  };
}

export function mergeScannerHits(prev, incoming, day) {
  const byKey = new Map();
  for (const h of prev || []) {
    if (!listingOk(h.detectedAt, day)) continue;
    byKey.set(`${h.symbol}|${h.detectedAt}`, h);
  }
  for (const raw of incoming || []) {
    const h = slimHit(raw, day);
    if (!h) continue;
    const k = `${h.symbol}|${h.detectedAt}`;
    const old = byKey.get(k);
    byKey.set(k, old ? { ...h, detectedAt: old.detectedAt, id: old.id } : h);
  }
  return [...byKey.values()]
    .sort((a, b) => b.score - a.score || a.detectedAt - b.detectedAt || a.symbol.localeCompare(b.symbol))
    .slice(0, CAP);
}

function toCards(hitsByScanner) {
  return SCANNER_META.map(([id, title, tagline]) => {
    const hits = hitsByScanner[id] || [];
    return {
      scannerId: id,
      title,
      tagline,
      status: hits.length ? 'ready' : 'idle',
      hits,
      updatedAt: Date.now(),
    };
  });
}

function hitCount(hitsByScanner) {
  return Object.values(hitsByScanner || {}).reduce((n, h) => n + (h?.length || 0), 0);
}

/** @type {Map<string, object>} */
const mem = new Map();

function hydrate(slot) {
  if (mem.has(slot)) return mem.get(slot);
  const all = readAll();
  const row = all.boards?.[slot];
  if (row?.hitsByScanner) {
    mem.set(slot, row);
    return row;
  }
  return null;
}

export function peekOpportunityDayBoard(universe, timeframe, now = Date.now()) {
  const day = istCalendarDay(now);
  const tf = String(timeframe || '5m');
  const u = String(universe || 'F&O');
  const slot = `${day}|${u}|${tf}`;
  const row = hydrate(slot);
  if (!row) {
    return {
      ready: false,
      day,
      universe: u,
      timeframe: tf,
      cacheKey: slot,
      cards: toCards(emptyHits()),
      hits: 0,
      source: 'shared-day-board',
    };
  }
  return {
    ready: hitCount(row.hitsByScanner) > 0,
    day,
    universe: u,
    timeframe: tf,
    cacheKey: row.cacheKey || slot,
    updatedAt: row.updatedAt || 0,
    asOf: row.asOf || row.updatedAt || 0,
    cards: toCards(row.hitsByScanner),
    hits: hitCount(row.hitsByScanner),
    source: 'shared-day-board',
  };
}

export function mergeOpportunityDayBoard(universe, timeframe, incomingCards, cacheKey, now = Date.now()) {
  const day = istCalendarDay(now);
  const tf = String(timeframe || '5m');
  const u = String(universe || 'F&O');
  const slot = `${day}|${u}|${tf}`;
  const prev = hydrate(slot)?.hitsByScanner || emptyHits();
  const next = emptyHits();
  const inBy = new Map((incomingCards || []).map((c) => [c.scannerId, c]));
  for (const [id] of SCANNER_META) {
    next[id] = mergeScannerHits(prev[id], inBy.get(id)?.hits || [], day);
  }
  const row = {
    day,
    universe: u,
    timeframe: tf,
    cacheKey: cacheKey || slot,
    updatedAt: Date.now(),
    asOf: Date.now(),
    hitsByScanner: next,
  };
  mem.set(slot, row);
  const all = readAll();
  const boards = {};
  for (const [k, v] of Object.entries(all.boards || {})) {
    if (String(k).startsWith(`${day}|`)) boards[k] = v;
  }
  boards[slot] = row;
  writeAll({ day, boards });
  return peekOpportunityDayBoard(u, tf, now);
}
