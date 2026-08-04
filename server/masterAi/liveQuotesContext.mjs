/**
 * Inject live TradingView quotes into Wolf AI context so Hunter can answer
 * without a chart screenshot when the user asks about the market.
 */
import { fetchQuotes } from '../market/provider.mjs';
import { toTvSymbol } from '../market/tradingview/symbolMap.mjs';

/** Keep AI path lean — full watchlist made /api/chat exceed browser timeout. */
const CORE_WATCHLIST = ['NIFTY', 'BANKNIFTY'];

const SYMBOL_ALIASES = [
  [/bank\s*nifty|banknifty|nifty\s*bank/gi, 'BANKNIFTY'],
  [/fin\s*nifty|finnifty/gi, 'FINNIFTY'],
  [/midcp\s*nifty|midcap\s*nifty|midcpnifty/gi, 'MIDCPNIFTY'],
  [/\bnifty\b(?!\s*bank)/gi, 'NIFTY'],
  [/\bsensex\b/gi, 'SENSEX'],
  [/\bbitcoin\b|\bbtc\b/gi, 'BTC'],
  [/\bethereum\b|\beth\b/gi, 'ETH'],
  [/\bxauusd\b|\bxau\b|\bgold\b|\bsona\b/gi, 'XAUUSD'],
  [/\breliance\b/gi, 'RELIANCE'],
  [/\btcs\b/gi, 'TCS'],
  [/\binf[oy]\b|\binfosys\b/gi, 'INFY'],
  [/\bhdfc\s*bank\b/gi, 'HDFCBANK'],
  [/\bicici\b/gi, 'ICICIBANK'],
  [/\bsbin\b|\bsbi\b/gi, 'SBIN'],
];

function extractSymbols(text) {
  const found = new Set();
  const raw = String(text || '');
  for (const [re, sym] of SYMBOL_ALIASES) {
    re.lastIndex = 0;
    if (re.test(raw)) found.add(sym);
  }
  for (const m of raw.matchAll(/\b([A-Z]{2,12}:[A-Z0-9.&-]{1,20})\b/g)) {
    found.add(m[1].toUpperCase());
  }
  for (const m of raw.matchAll(/\b([A-Z]{2,12})\b/g)) {
    const tok = m[1];
    if (toTvSymbol(tok) && tok.length >= 2 && tok.length <= 12) {
      if (
        !/^(THE|AND|FOR|ARE|WAS|HAS|NOT|YOU|ALL|CAN|HOW|WHY|WHAT|WITH|FROM|THIS|THAT|WILL|JUST|LIKE|VIEW|CHART|LIVE|DATA|TODAY|NOW|KABHI|ABHI|KAHA|PE|HAI)$/i.test(
          tok,
        )
      ) {
        if (CORE_WATCHLIST.includes(tok) || tok.length >= 3) found.add(tok);
      }
    }
  }
  return [...found];
}

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function formatQuoteLine(q) {
  if (!q?.symbol || !q?.price) return null;
  return `${q.symbol} ${q.price} (${fmtPct(q.changePercent)}) O:${q.open} H:${q.high} L:${q.low} PC:${q.prevClose} Vol:${q.volume || 0}`;
}

/**
 * Build a LIVE MARKET DATA block for the model.
 * @param {string} message
 * @param {Array<{content?: string}>} history
 * @param {{ compact?: boolean }} opts
 */
export async function buildLiveQuotesContext(message, history = [], opts = {}) {
  const compact = Boolean(opts.compact);
  const historyText = (history || [])
    .slice(-6)
    .map((h) => String(h?.content || ''))
    .join('\n');
  const mentioned = extractSymbols(`${message}\n${historyText}`);

  // Prefer asked symbols + NIFTY/BANKNIFTY only — keeps chat latency low.
  const symbols = [
    ...new Set([
      ...(mentioned.length ? mentioned : []),
      ...CORE_WATCHLIST,
    ]),
  ].slice(0, compact ? 4 : 6);

  try {
    const data = await fetchQuotes(symbols, { fast: true });
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
    if (!quotes.length) {
      return {
        block: '',
        hasLiveTape: false,
        quoteCount: 0,
        quotes: [],
        primary: null,
      };
    }

    const order = new Map(symbols.map((s, i) => [s, i]));
    quotes.sort((a, b) => (order.get(a.symbol) ?? 99) - (order.get(b.symbol) ?? 99));

    const lines = quotes.map(formatQuoteLine).filter(Boolean);
    const header = compact
      ? 'LIVE MARKET TAPE (TradingView — cross-check with chart; chart levels win if they conflict):'
      : 'LIVE MARKET DATA (TradingView feed — verified LTP tape; use this for market questions without requiring a chart):';

    const rules = compact
      ? 'Use live LTP only as secondary context. Primary structure/levels come from the attached chart.'
      : 'You MAY answer market/day/view questions from this tape without asking for a chart. Still do NOT invent support/resistance from imagination — if structure is needed and no chart is attached, describe price action from this tape only (LTP/change/range) and optionally invite a chart for structure. Never invent option chain / OI / PCR (not in this feed). Never give Entry/Stop/Target/Buy/Sell.';

    const block = [header, ...lines.map((l) => `- ${l}`), rules].join('\n');
    const hasLiveTape = quotes.some(
      (q) => q.symbol === 'NIFTY' || q.symbol === 'BANKNIFTY' || Number(q.price) > 0,
    );

    // Prefer a user-mentioned symbol; else first watchlist quote with a price.
    const primary =
      quotes.find((q) => mentioned.includes(q.symbol) && Number(q.price) > 0) ||
      quotes.find((q) => Number(q.price) > 0) ||
      null;

    return { block, hasLiveTape, quoteCount: quotes.length, quotes, primary };
  } catch (err) {
    console.warn('[Wolf AI] live quotes context failed:', err?.message || err);
    return { block: '', hasLiveTape: false, quoteCount: 0, quotes: [], primary: null };
  }
}
