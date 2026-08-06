/** Per-symbol quote snapshot — REST + live WS overlay (LTP, OHLC, bid/ask, OI, candles) */

const meta = new Map();
const candles1m = new Map();

function round(n, digits = 4) {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/** Keep more decimals for FX/gold so tip does not stick between cents. */
function priceDigits(price) {
  const p = Math.abs(Number(price) || 0);
  if (p >= 1000) return 3;
  if (p >= 100) return 4;
  if (p >= 1) return 5;
  return 6;
}

function calcChange(price, prevClose) {
  const digits = priceDigits(price);
  const change = round(price - prevClose, digits);
  const changePercent = prevClose ? round((change / prevClose) * 100, 4) : 0;
  return { change, changePercent };
}

function minuteBucket(ts = Date.now()) {
  return Math.floor(ts / 60_000) * 60_000;
}

export function setQuoteMeta(quote) {
  if (!quote?.symbol) return;
  meta.set(quote.symbol, { ...quote, at: Date.now() });
}

export function mergeTickIntoMeta(symbol, tick) {
  const sym = String(symbol || '').trim().toUpperCase();
  const prev = meta.get(sym);
  let ltp = Number(tick?.ltp ?? tick?.lp ?? tick?.last_price ?? 0);
  // Prefer bid/ask mid when print is absent — keeps tip alive between sparse lp ticks.
  if (!ltp) {
    const bid = Number(tick?.bid_price ?? tick?.bid ?? tick?.bbp ?? 0);
    const ask = Number(tick?.ask_price ?? tick?.ask ?? tick?.bap ?? 0);
    if (bid > 0 && ask > 0) ltp = (bid + ask) / 2;
  }
  // Quote deltas may omit lp — keep prior LTP so the print does not go stale.
  if (!ltp && prev?.price) ltp = prev.price;
  if (!sym || !ltp) return null;

  const digits = priceDigits(ltp);
  const prevClose = Number(
    tick?.prev_close_price ?? tick?.prev_close ?? prev?.prevClose ?? 0,
  );
  const open = Number(tick?.open_price ?? tick?.open ?? prev?.open ?? ltp);
  const high = Number(tick?.high_price ?? tick?.high ?? prev?.high ?? ltp);
  const low = Number(tick?.low_price ?? tick?.low ?? prev?.low ?? ltp);
  const volume = Math.floor(Number(tick?.vol ?? tick?.volume ?? tick?.v ?? prev?.volume ?? 0));

  const bid = Number(
    tick?.bid_price ?? tick?.bid ?? tick?.bbp ?? tick?.best_bid_price ?? prev?.bid ?? 0,
  );
  const ask = Number(
    tick?.ask_price ?? tick?.ask ?? tick?.bap ?? tick?.best_ask_price ?? prev?.ask ?? 0,
  );
  const bidQty = Math.floor(
    Number(tick?.bid_size ?? tick?.bid_qty ?? tick?.bbq ?? prev?.bidQty ?? 0),
  );
  const askQty = Math.floor(
    Number(tick?.ask_size ?? tick?.ask_qty ?? tick?.baq ?? prev?.askQty ?? 0),
  );
  const oi = Math.floor(Number(tick?.oi ?? tick?.open_interest ?? prev?.oi ?? 0));
  const oiChange = Math.floor(Number(tick?.oich ?? tick?.oi_change ?? prev?.oiChange ?? 0));

  let change = Number(tick?.ch ?? NaN);
  let changePercent = Number(tick?.chp ?? tick?.ch_per ?? NaN);
  const pc = prevClose > 0 ? prevClose : prev?.prevClose ?? 0;

  const basePrev = pc > 0 ? pc : prev?.prevClose ?? 0;
  const shouldRecalc =
    !Number.isFinite(change) ||
    !Number.isFinite(changePercent) ||
    (basePrev > 0 && Math.abs(ltp - basePrev) > 0.0001 && change === 0 && changePercent === 0);

  if (shouldRecalc && basePrev > 0) {
    ({ change, changePercent } = calcChange(ltp, basePrev));
  } else if (!Number.isFinite(change) || !Number.isFinite(changePercent)) {
    change = 0;
    changePercent = 0;
  } else {
    change = round(change, digits);
    changePercent = round(changePercent, 4);
  }

  const src = String(tick?.source || prev?.source || 'tradingview').trim() || 'tradingview';
  const merged = {
    symbol: sym,
    price: round(ltp, digits),
    change,
    changePercent,
    open: round(open, digits),
    high: round(Math.max(high, ltp), digits),
    low: round(Math.min(low, ltp), digits),
    prevClose: round(pc || prev?.prevClose || ltp, digits),
    volume,
    bid: bid > 0 ? round(bid, digits) : prev?.bid ?? 0,
    ask: ask > 0 ? round(ask, digits) : prev?.ask ?? 0,
    bidQty: bidQty || prev?.bidQty || 0,
    askQty: askQty || prev?.askQty || 0,
    oi: oi || prev?.oi || 0,
    oiChange: oiChange || prev?.oiChange || 0,
    source: src,
    lastUpdated: new Date().toISOString(),
    at: Date.now(),
  };
  meta.set(sym, merged);
  return merged;
}

/** Rolling 1m candle from live ticks */
export function updateCandleFromTick(symbol, quote) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym || !quote?.price) return null;
  const bucket = minuteBucket();
  let c = candles1m.get(sym);
  if (!c || c.time !== bucket) {
    c = {
      time: bucket,
      open: quote.price,
      high: quote.price,
      low: quote.price,
      close: quote.price,
      volume: quote.volume || 0,
    };
  } else {
    c.high = Math.max(c.high, quote.price);
    c.low = Math.min(c.low, quote.price);
    c.close = quote.price;
    c.volume = Math.max(c.volume, quote.volume || 0);
  }
  candles1m.set(sym, c);
  return c;
}

export function getLatestCandle(symbol) {
  return candles1m.get(String(symbol || '').trim().toUpperCase()) ?? null;
}

export function overlayWsPrice(symbol, price, lastUpdated) {
  const sym = String(symbol || '').trim().toUpperCase();
  const hit = meta.get(sym);
  if (!hit?.prevClose) return hit ?? null;
  const digits = priceDigits(price);
  const p = round(Number(price), digits);
  const { change, changePercent } = calcChange(p, hit.prevClose);
  const merged = {
    ...hit,
    price: p,
    change,
    changePercent,
    lastUpdated: lastUpdated || new Date().toISOString(),
    at: Date.now(),
  };
  meta.set(sym, merged);
  return merged;
}

export function getQuoteMeta(symbol) {
  return meta.get(String(symbol || '').trim().toUpperCase()) ?? null;
}

/** Keep last print through market close / quiet sessions (NSE does not tick overnight). */
const SNAPSHOT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

export function getQuoteMetaSnapshot(symbols, opts = {}) {
  const maxAge = Number(opts.maxAgeMs) > 0 ? Number(opts.maxAgeMs) : SNAPSHOT_MAX_AGE_MS;
  const list = symbols?.length ? symbols : [...meta.keys()];
  const out = [];
  const now = Date.now();
  for (const sym of list) {
    const key = String(sym || '').trim().toUpperCase();
    const hit = meta.get(key) || meta.get(sym);
    if (!hit || now - hit.at > maxAge) continue;
    const { at, ...data } = hit;
    const candle = getLatestCandle(key) || getLatestCandle(data.symbol);
    out.push(candle ? { ...data, candle } : data);
  }
  return out;
}
