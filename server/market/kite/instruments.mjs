/**
 * Kite instrument token resolution (NSE equity + indices + NFO options).
 * Downloads instruments once per day and caches in memory.
 */
import { getKiteAccessToken, getKiteApiKey, isKiteConfigured } from './kiteConfig.mjs';

const INDEX_TOKENS = {
  NIFTY: 256265,
  'NIFTY 50': 256265,
  BANKNIFTY: 260105,
  'NIFTY BANK': 260105,
  FINNIFTY: 257801,
  MIDCPNIFTY: 288009,
};

/** @type {Map<string, number>} */
let equityBySymbol = new Map();
/** @type {Map<string, number>} */
let optionByKey = new Map();
let loadedAt = 0;
let loading = null;
const TTL_MS = 12 * 60 * 60 * 1000;

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

async function downloadInstruments() {
  if (!isKiteConfigured()) return;
  const apiKey = getKiteApiKey();
  const token = getKiteAccessToken();
  const res = await fetch('https://api.kite.trade/instruments', {
    headers: {
      'X-Kite-Version': '3',
      Authorization: `token ${apiKey}:${token}`,
    },
  });
  if (!res.ok) throw new Error(`Kite instruments HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('Kite instruments empty');

  const header = parseCsvLine(lines[0]);
  const idx = (name) => header.indexOf(name);
  const iToken = idx('instrument_token');
  const iExch = idx('exchange');
  const iTrad = idx('tradingsymbol');
  const iName = idx('name');
  const iType = idx('instrument_type');
  const iStrike = idx('strike');
  const iExpiry = idx('expiry');

  const nextEq = new Map();
  const nextOpt = new Map();

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const exchange = cols[iExch];
    const token = Number(cols[iToken]);
    if (!token) continue;
    const tradingsymbol = String(cols[iTrad] || '').trim().toUpperCase();
    const name = String(cols[iName] || '').trim().toUpperCase();
    const type = String(cols[iType] || '').trim().toUpperCase();

    if (exchange === 'NSE' && type === 'EQ' && tradingsymbol) {
      nextEq.set(tradingsymbol, token);
    }

    if (exchange === 'NFO' && (type === 'CE' || type === 'PE') && name) {
      const expiry = String(cols[iExpiry] || '').trim();
      const strike = Number(cols[iStrike] || 0);
      if (!expiry || !strike) continue;
      const key = `${name}|${expiry}|${strike}|${type}`;
      nextOpt.set(key, token);
      // Also key by tradingsymbol for direct lookup
      if (tradingsymbol) nextOpt.set(`TS:${tradingsymbol}`, token);
    }
  }

  equityBySymbol = nextEq;
  optionByKey = nextOpt;
  loadedAt = Date.now();
  console.log(
    `[Kite] Instruments loaded: ${equityBySymbol.size} NSE EQ, ${optionByKey.size} NFO option keys`,
  );
}

export async function ensureInstruments() {
  if (Date.now() - loadedAt < TTL_MS && equityBySymbol.size) return;
  if (loading) return loading;
  loading = downloadInstruments()
    .catch((err) => {
      console.warn('[Kite] instruments load failed:', err instanceof Error ? err.message : err);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** App ticker (NIFTY, RELIANCE) → Kite instrument token */
export async function resolveEquityToken(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  if (INDEX_TOKENS[sym]) return INDEX_TOKENS[sym];
  await ensureInstruments();
  return equityBySymbol.get(sym) ?? null;
}

/**
 * Resolve option token.
 * @param {{ underlying: string, expiryIso: string, strike: number, type: 'CE'|'PE' }} p
 */
export async function resolveOptionToken(p) {
  await ensureInstruments();
  const name = String(p.underlying || '').trim().toUpperCase();
  const type = String(p.type || '').trim().toUpperCase();
  const strike = Number(p.strike);
  const expiryIso = String(p.expiryIso || '').slice(0, 10);
  if (!name || !type || !strike || !expiryIso) return null;
  const key = `${name}|${expiryIso}|${strike}|${type}`;
  return optionByKey.get(key) ?? null;
}

export function getIndexToken(symbol) {
  return INDEX_TOKENS[String(symbol || '').trim().toUpperCase()] ?? null;
}
