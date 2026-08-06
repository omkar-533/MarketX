import { EXPIRY_DATES } from '../data/marketData';
import { getJournalSymbolSelection } from './equitySymbolService';
import { getGlobalInstrument } from './globalInstrumentService';
import { loadAppSession } from './appInviteAuth';
import type { PaperLeg, PaperStrategyGroup } from './paperTradingEngine';
import {
  applyOrderFill,
  buildPositionFromOrder,
  checkOrderFill,
  defaultOrderDraft,
  defaultWatchlist,
  effectiveOrderPrice,
  formatPaperPrice,
  globalToMarketItem,
  instrumentFromDraft,
  journalToMarketItem,
  markPriceForOrder,
  normalizeWatchlist,
  orderFillsImmediately,
  orderTypeLabel,
  totalEntryCostForOrder,
  watchlistKey,
  type MarketItem,
  type PaperOrder,
  type PaperState,
  type PaperTradeRecord,
} from './paperTradingEngine';
import { getSymbolMeta } from './optionSimulatorEngine';
import { apiSymbolFromTv } from '../utils/tradingViewSymbols';

const PENDING_KEY = 'tradeflow_pending_paper_strategy';
const TERMINAL_TRADE_KEY = 'wolf_pending_terminal_trade';
const PAPER_STORAGE_PREFIX = 'tradeflow_paper_trading_';
const PAPER_DEFAULT_STRATEGY = 'Swing / breakout';
const PAPER_INITIAL_CAPITAL = 1_000_000;

/** Fired after Terminal Buy/Sell punches into paper storage (PaperTrading listens). */
export const PAPER_STATE_UPDATED_EVENT = 'wolf:paper-state-updated';

/** Legs built in Strategy Builder → queued for Paper Trading */
export interface StrategyBuilderPaperPayload {
  symbol: string;
  strategyName: string;
  spotPrice: number;
  createdAt: string;
  legs: {
    action: 'BUY' | 'SELL';
    type: 'CE' | 'PE';
    strike: number;
    premium: number;
    qty: number;
  }[];
}

export function queueStrategyForPaperTrading(payload: StrategyBuilderPaperPayload): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
}

export function peekPendingStrategy(): StrategyBuilderPaperPayload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StrategyBuilderPaperPayload;
  } catch {
    return null;
  }
}

export function consumePendingStrategy(): StrategyBuilderPaperPayload | null {
  const data = peekPendingStrategy();
  if (data) sessionStorage.removeItem(PENDING_KEY);
  return data;
}

export function clearPendingStrategy(): void {
  sessionStorage.removeItem(PENDING_KEY);
}

/** Quick Buy/Sell from Wolf Terminal → paper book punch */
export type TerminalPaperHandoff = {
  tvSymbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  at: string;
  /** Limit / stop trigger price when set from chart context menu. */
  price?: number;
  orderType?: 'MARKET' | 'LIMIT' | 'STOP';
};

export type TerminalPaperResult = {
  ok: boolean;
  message: string;
};

export function queueTerminalPaperTrade(handoff: TerminalPaperHandoff): void {
  sessionStorage.setItem(TERMINAL_TRADE_KEY, JSON.stringify(handoff));
}

export function consumeTerminalPaperTrade(): TerminalPaperHandoff | null {
  try {
    const raw = sessionStorage.getItem(TERMINAL_TRADE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(TERMINAL_TRADE_KEY);
    return JSON.parse(raw) as TerminalPaperHandoff;
  } catch {
    return null;
  }
}

export function paperStorageKey(userId?: string | null): string {
  return `${PAPER_STORAGE_PREFIX}${userId || 'guest'}`;
}

function currentPaperOwnerId(): string {
  try {
    return loadAppSession()?.user?.id || 'guest';
  } catch {
    return 'guest';
  }
}

function createEmptyPaperState(): PaperState {
  return {
    balance: PAPER_INITIAL_CAPITAL,
    usedMargin: 0,
    available: PAPER_INITIAL_CAPITAL,
    totalCharges: 0,
    positions: [],
    orders: [],
    history: [],
    watchlist: defaultWatchlist(),
    strategyGroups: [],
    strategy: PAPER_DEFAULT_STRATEGY,
    lastSync: new Date().toISOString(),
  };
}

export function loadPaperBook(userId?: string | null): PaperState {
  try {
    const raw = localStorage.getItem(paperStorageKey(userId ?? currentPaperOwnerId()));
    if (!raw) return createEmptyPaperState();
    const parsed = JSON.parse(raw) as Partial<PaperState>;
    if (!Array.isArray(parsed.watchlist)) return createEmptyPaperState();

    const watchlist = normalizeWatchlist(parsed.watchlist as MarketItem[]);
    const usedMargin = Number(parsed.usedMargin ?? 0);
    const available = Number(parsed.available ?? PAPER_INITIAL_CAPITAL);
    let balance = Number(parsed.balance ?? PAPER_INITIAL_CAPITAL);
    const orders = (Array.isArray(parsed.orders) ? parsed.orders : []).filter(
      (o: PaperOrder) => !(o?.status === 'PENDING' && !Number(o?.reservedMargin)),
    );
    const pendingReserve = orders
      .filter((o: PaperOrder) => o?.status === 'PENDING')
      .reduce((sum: number, o: PaperOrder) => sum + Number(o.reservedMargin ?? 0), 0);
    const cashBook = Number((available + usedMargin + pendingReserve).toFixed(2));
    if (Number.isFinite(cashBook) && Math.abs(balance - cashBook) > 1) {
      balance = cashBook;
    }
    return {
      balance,
      usedMargin,
      available,
      totalCharges: Number(parsed.totalCharges ?? 0),
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      orders,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      watchlist: watchlist.length ? watchlist : defaultWatchlist(),
      strategyGroups: Array.isArray(parsed.strategyGroups) ? parsed.strategyGroups : [],
      strategy: typeof parsed.strategy === 'string' ? parsed.strategy : PAPER_DEFAULT_STRATEGY,
      lastSync: typeof parsed.lastSync === 'string' ? parsed.lastSync : new Date().toISOString(),
    };
  } catch {
    return createEmptyPaperState();
  }
}

export function savePaperBook(state: PaperState, userId?: string | null): void {
  try {
    localStorage.setItem(paperStorageKey(userId ?? currentPaperOwnerId()), JSON.stringify(state));
    window.dispatchEvent(
      new CustomEvent(PAPER_STATE_UPDATED_EVENT, {
        detail: { userId: userId ?? currentPaperOwnerId(), at: state.lastSync },
      }),
    );
  } catch {
    /* ignore quota */
  }
}

/** Resolve TV / API symbol to a paper MarketItem. */
export function resolvePaperMarketItem(tvSymbol: string, priceOverride?: number): MarketItem | null {
  const plain = apiSymbolFromTv(tvSymbol).toUpperCase();
  let item: MarketItem | null = null;

  const journal = getJournalSymbolSelection(plain);
  if (journal) {
    item = journalToMarketItem(journal);
  } else {
    const cryptoKey = plain.includes('/')
      ? plain
      : plain.endsWith('USDT')
        ? `${plain.slice(0, -4)}/USDT`
        : plain;
    const crypto = getGlobalInstrument('crypto', cryptoKey);
    const forex = getGlobalInstrument('forex', plain);
    if (crypto) item = globalToMarketItem(crypto);
    else if (forex) item = globalToMarketItem(forex);
  }

  if (!item) return null;
  if (priceOverride && priceOverride > 0) {
    return { ...item, price: priceOverride };
  }
  return item;
}

/**
 * Punch a Terminal Buy/Sell straight into the paper book (no navigation / modal).
 * MARKET fills immediately; LIMIT / STOP stay pending in the order book.
 */
export function executeTerminalPaperTrade(handoff: TerminalPaperHandoff): TerminalPaperResult {
  const ownerId = currentPaperOwnerId();
  const item = resolvePaperMarketItem(handoff.tvSymbol, handoff.price);
  if (!item) {
    const plain = apiSymbolFromTv(handoff.tvSymbol).toUpperCase();
    return {
      ok: false,
      message: `${plain} not in paper catalog — open Paper Trading to add it.`,
    };
  }

  const qty = Math.max(1, Math.round(handoff.qty) || 1);
  let draft = { ...defaultOrderDraft(item, handoff.side), quantity: qty };

  if (handoff.orderType === 'LIMIT' && handoff.price && handoff.price > 0) {
    draft = { ...draft, orderType: 'LIMIT', price: handoff.price };
  } else if (handoff.orderType === 'STOP' && handoff.price && handoff.price > 0) {
    draft = {
      ...draft,
      orderType: 'SL-M',
      triggerPrice: handoff.price,
      price: handoff.price,
    };
  } else {
    draft = { ...draft, orderType: 'MARKET', price: item.price };
  }

  draft = {
    ...draft,
    notes: `Terminal ${handoff.side} · ${new Date(handoff.at).toLocaleTimeString('en-IN')}`,
  };

  const spot = item.price;
  const completes = orderFillsImmediately(draft.orderType);
  const effectivePrice = effectiveOrderPrice(draft, item, spot);
  const { margin, charges } = totalEntryCostForOrder(draft, item, effectivePrice);
  const chargeOnFill = charges.total;

  let state = loadPaperBook(ownerId);
  const key = watchlistKey(item);
  if (!state.watchlist.some((w) => watchlistKey(w) === key)) {
    state = {
      ...state,
      watchlist: normalizeWatchlist([item, ...state.watchlist]),
    };
  }

  if (!completes && margin > state.available) {
    return {
      ok: false,
      message: `Rejected — need ₹${margin.toLocaleString('en-IN')} available margin.`,
    };
  }
  if (completes && margin + chargeOnFill > state.available) {
    return {
      ok: false,
      message: `Rejected — need ₹${(margin + chargeOnFill).toLocaleString('en-IN')} (funds).`,
    };
  }

  const orderId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const instrument = instrumentFromDraft(draft);
  const orderPrice =
    draft.orderType === 'MARKET' || draft.orderType === 'SL-M' ? effectivePrice : draft.price;

  const newOrder: PaperOrder = {
    id: orderId,
    symbol: item.symbol,
    name: item.name,
    side: draft.side,
    product: draft.segment === 'EQUITY' ? draft.product : 'MIS',
    quantity: draft.quantity,
    orderType: draft.orderType,
    price: orderPrice,
    triggerPrice:
      draft.orderType === 'SL' || draft.orderType === 'SL-M' ? draft.triggerPrice : undefined,
    status: completes ? 'COMPLETE' : 'PENDING',
    reservedMargin: completes ? undefined : margin,
    createdAt: new Date().toISOString(),
    notes: draft.notes.trim() || undefined,
    instrumentType: instrument,
    underlying: item.symbol,
    strike: draft.segment === 'OPTIONS' ? draft.strike : undefined,
    expiry: draft.segment === 'OPTIONS' ? draft.expiry : undefined,
    lotSize: item.lotSize,
    segment: draft.segment,
  };

  if (completes) {
    const position = buildPositionFromOrder(orderId, draft, item, effectivePrice, spot, margin);
    const historyEntry: PaperTradeRecord = {
      id: orderId,
      symbol: position.symbol,
      name: position.name,
      side: position.side,
      quantity: position.quantity,
      entryPrice: effectivePrice,
      entryAt: position.openedAt,
      strategy: position.notes ?? state.strategy,
      status: 'OPEN',
    };
    state = {
      ...state,
      balance: Number((state.balance - chargeOnFill).toFixed(2)),
      available: Number((state.available - margin - chargeOnFill).toFixed(2)),
      usedMargin: Number((state.usedMargin + margin).toFixed(2)),
      totalCharges: Number((state.totalCharges + chargeOnFill).toFixed(2)),
      orders: [
        { ...newOrder, fillPrice: effectivePrice, filledAt: new Date().toISOString() },
        ...state.orders,
      ],
      positions: [...state.positions, position],
      history: [historyEntry, ...state.history],
      lastSync: new Date().toISOString(),
    };
    savePaperBook(state, ownerId);
    return {
      ok: true,
      message: `Paper ${draft.side} filled · ${item.symbol} @ ${formatPaperPrice(item, effectivePrice)}`,
    };
  }

  let next: PaperState = {
    ...state,
    available: Number((state.available - margin).toFixed(2)),
    orders: [newOrder, ...state.orders],
    lastSync: new Date().toISOString(),
  };
  const instantFill = checkOrderFill(newOrder, markPriceForOrder(newOrder, spot));
  if (instantFill !== null) {
    next = applyOrderFill(next, newOrder, item, instantFill);
    savePaperBook(next, ownerId);
    return {
      ok: true,
      message: `Paper ${draft.side} filled · ${item.symbol} @ ${formatPaperPrice(item, instantFill)}`,
    };
  }

  savePaperBook(next, ownerId);
  return {
    ok: true,
    message: `Paper ${orderTypeLabel(draft.orderType)} ${draft.side} parked · ${item.symbol}`,
  };
}

/** Convert Strategy Builder legs → paper hedge group (qty = contracts/lots) */
export function strategyPayloadToPaperGroup(payload: StrategyBuilderPaperPayload): PaperStrategyGroup {
  const sym = payload.symbol.trim().toUpperCase();
  const meta = getSymbolMeta(sym);
  const sel = getJournalSymbolSelection(sym);
  const exchange = sel?.exchange ?? (meta.type === 'index' ? 'INDEX' : 'FNO');
  const lot = meta.lotSize || 1;

  const legs: PaperLeg[] = payload.legs.map((l, i) => {
    const qtyLots = Math.max(1, Math.round(l.qty / lot));
    return {
      id: `sb-${Date.now()}-${i}`,
      instrumentType: l.type,
      symbol: sym,
      displayName: `${sym} ${l.strike}${l.type}`,
      action: l.action,
      strike: l.strike,
      expiry: EXPIRY_DATES[0],
      quantity: qtyLots,
      lotSize: lot,
      avgPrice: l.premium,
      exchange,
    };
  });

  return {
    id: `grp-${Date.now()}`,
    name: payload.strategyName.trim() || 'Strategy Builder',
    underlying: sym,
    legs,
    openedAt: new Date().toISOString(),
    status: 'OPEN',
    notes: `From Strategy Builder @ spot ${payload.spotPrice.toLocaleString('en-IN')}`,
  };
}
