/** Per-symbol quote snapshot — REST + live WS overlay (LTP, OHLC, bid/ask, OI, candles) */

const meta = new Map();
const candles1m = new Map();

function round(n) {
  return Math.round(n * 100) / 100;
}

function calcChange(price, prevClose) {
  const change = round(price - prevClose);
  const changePercent = prevClose ? round((change / prevClose) * 100) : 0;
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
  const ltp = Number(tick?.ltp ?? tick?.lp ?? tick?.last_price ?? 0);
  if (!sym || !ltp) return null;

  const prev = meta.get(sym);
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
    (basePrev > 0 && Math.abs(ltp - basePrev) > 0.01 && change === 0 && changePercent === 0);

  if (shouldRecalc && basePrev > 0) {
    ({ change, changePercent } = calcChange(ltp, basePrev));
  } else if (!Number.isFinite(change) || !Number.isFinite(changePercent)) {
    change = 0;
    changePercent = 0;
  } else {
    change = round(change);
    changePercent = round(changePercent);
  }

  const merged = {
    symbol: sym,
    price: round(ltp),
    change,
    changePercent,
    open: round(open),
    high: round(high),
    low: round(low),
    prevClose: round(pc || prev?.prevClose || ltp),
    volume,
    bid: bid > 0 ? round(bid) : prev?.bid ?? 0,
    ask: ask > 0 ? round(ask) : prev?.ask ?? 0,
    bidQty: bidQty || prev?.bidQty || 0,
    askQty: askQty || prev?.askQty || 0,
    oi: oi || prev?.oi || 0,
    oiChange: oiChange || prev?.oiChange || 0,
    source: 'fyers-ws',
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
  const p = round(Number(price));
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

export function getQuoteMetaSnapshot(symbols) {
  const list = symbols?.length ? symbols : [...meta.keys()];
  const out = [];
  const now = Date.now();
  for (const sym of list) {
    const hit = meta.get(sym);
    if (!hit || now - hit.at > 120_000) continue;
    const { at, ...data } = hit;
    const candle = getLatestCandle(sym);
    out.push(candle ? { ...data, candle } : data);
  }
  return out;
}
