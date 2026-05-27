import { EXPIRY_DATES, STRATEGY_TEMPLATES } from '../data/marketData';
import { getFnoInstrument } from '../data/fnoUniverse';
import type { JournalSymbolSelection } from './equitySymbolService';
import { getJournalSymbolSelection } from './equitySymbolService';
import { applyLiveQuoteToMarketItem } from './paperTradingLiveService';
import {
  applyStrategyTemplate,
  createManualLeg,
  getChainPremium,
  getMarketSnapshot,
  getSymbolMeta,
  legPnlAtSpot,
  type SimLeg,
} from './optionSimulatorEngine';

export type Side = 'BUY' | 'SELL';
export type Product = 'MIS' | 'CNC';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M' | 'TARGET';
export type PaperLegInstrument = 'EQUITY' | 'FUT' | 'CE' | 'PE';
export type PaperSegment = 'EQUITY' | 'FUTURES' | 'OPTIONS';

export interface PaperOrderDraft {
  segment: PaperSegment;
  side: Side;
  product: Product;
  orderType: OrderType;
  quantity: number;
  price: number;
  triggerPrice: number;
  notes: string;
  optionType: 'CE' | 'PE';
  strike: number;
  expiry: string;
}

export interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  type: 'INDEX' | 'STOCK';
  exchange: JournalSymbolSelection['exchange'];
  isFno: boolean;
  lotSize: number;
}

export interface PaperLeg {
  id: string;
  instrumentType: PaperLegInstrument;
  symbol: string;
  displayName: string;
  action: Side;
  strike?: number;
  expiry?: string;
  quantity: number;
  lotSize: number;
  avgPrice: number;
  exchange: JournalSymbolSelection['exchange'];
}

export interface PaperStrategyGroup {
  id: string;
  name: string;
  underlying: string;
  legs: PaperLeg[];
  openedAt: string;
  status: 'OPEN' | 'CLOSED';
  notes?: string;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  name: string;
  side: Side;
  product: Product;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  openedAt: string;
  notes?: string;
  groupId?: string;
  legId?: string;
  instrumentType?: PaperLegInstrument;
  strike?: number;
  expiry?: string;
  lotSize?: number;
  exchange?: JournalSymbolSelection['exchange'];
  underlying?: string;
  segment?: PaperSegment;
}

export interface PaperOrder {
  id: string;
  symbol: string;
  name: string;
  side: Side;
  product: Product;
  quantity: number;
  orderType: OrderType;
  price: number;
  triggerPrice?: number;
  status: 'PENDING' | 'COMPLETE' | 'CANCELLED';
  reservedMargin?: number;
  fillPrice?: number;
  filledAt?: string;
  createdAt: string;
  notes?: string;
  groupId?: string;
  instrumentType?: PaperLegInstrument;
  underlying?: string;
  strike?: number;
  expiry?: string;
  lotSize?: number;
  segment?: PaperSegment;
}

export interface PaperTradeRecord {
  id: string;
  symbol: string;
  name: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  entryAt: string;
  exitAt?: string;
  pnl?: number;
  pnlPercent?: number;
  strategy?: string;
  status: 'OPEN' | 'CLOSED';
  groupId?: string;
}

export interface PaperCharges {
  turnover: number;
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  sebiFees: number;
  gst: number;
  total: number;
}

export interface PaperState {
  balance: number;
  usedMargin: number;
  available: number;
  totalCharges: number;
  positions: PaperPosition[];
  orders: PaperOrder[];
  history: PaperTradeRecord[];
  watchlist: MarketItem[];
  strategyGroups: PaperStrategyGroup[];
  strategy: string;
  lastSync: string;
}

/** Minimum brokerage per executed order (₹) — scales up with turnover above this floor */
export const PAPER_MIN_BROKERAGE = 20;

const BROKERAGE_RATE: Record<PaperSegment, number> = {
  EQUITY: 0.0003,
  FUTURES: 0.0003,
  OPTIONS: 0.0005,
};

function roundInr(n: number) {
  return Number(n.toFixed(2));
}

export function orderTurnover(
  segment: PaperSegment,
  price: number,
  quantity: number,
  lotSize: number,
): number {
  if (segment === 'EQUITY') return price * quantity;
  return price * quantity * lotSize;
}

export function segmentFromPosition(position: PaperPosition): PaperSegment {
  if (position.segment) return position.segment;
  if (position.instrumentType === 'FUT') return 'FUTURES';
  if (position.instrumentType === 'CE' || position.instrumentType === 'PE') return 'OPTIONS';
  return 'EQUITY';
}

/** Brokerage + statutory charges (STT, exchange, SEBI, GST) — proportional to trade turnover */
export function calculatePaperCharges(
  segment: PaperSegment,
  product: Product,
  side: Side,
  turnover: number,
): PaperCharges {
  const t = Math.max(0, turnover);
  const brokerage = roundInr(Math.max(t * BROKERAGE_RATE[segment], PAPER_MIN_BROKERAGE));

  let stt = 0;
  if (side === 'SELL') {
    if (segment === 'EQUITY') {
      stt = roundInr(t * (product === 'MIS' ? 0.00025 : 0.001));
    } else if (segment === 'FUTURES') {
      stt = roundInr(t * 0.000125);
    } else {
      stt = roundInr(t * 0.000625);
    }
  }

  const exchangeCharges = roundInr(t * 0.0000345);
  const sebiFees = roundInr(t * 0.000001);
  const gst = roundInr((brokerage + exchangeCharges + sebiFees) * 0.18);
  const total = roundInr(brokerage + stt + exchangeCharges + sebiFees + gst);

  return { turnover: roundInr(t), brokerage, stt, exchangeCharges, sebiFees, gst, total };
}

export function calculateChargesForDraft(
  draft: PaperOrderDraft,
  item: MarketItem,
  effectivePrice: number,
): PaperCharges {
  const lot = item.lotSize || getSymbolMeta(item.symbol).lotSize || 1;
  const turnover = orderTurnover(draft.segment, effectivePrice, draft.quantity, lot);
  const product = draft.segment === 'EQUITY' ? draft.product : 'MIS';
  return calculatePaperCharges(draft.segment, product, draft.side, turnover);
}

export function calculateChargesForPosition(
  position: PaperPosition,
  price: number,
  closing: boolean,
): PaperCharges {
  const segment = segmentFromPosition(position);
  const side: Side = closing ? (position.side === 'BUY' ? 'SELL' : 'BUY') : position.side;
  const lot = position.lotSize ?? 1;
  const turnover = orderTurnover(segment, price, position.quantity, lot);
  return calculatePaperCharges(segment, position.product, side, turnover);
}

export function calculateChargesForLeg(leg: PaperLeg): PaperCharges {
  const segment: PaperSegment =
    leg.instrumentType === 'EQUITY' ? 'EQUITY' : leg.instrumentType === 'FUT' ? 'FUTURES' : 'OPTIONS';
  const product: Product = leg.instrumentType === 'EQUITY' ? 'CNC' : 'MIS';
  const turnover = orderTurnover(
    segment,
    leg.avgPrice,
    leg.quantity,
    leg.instrumentType === 'EQUITY' ? 1 : leg.lotSize,
  );
  return calculatePaperCharges(segment, product, leg.action, turnover);
}

export const HEDGE_PRESETS = [
  { id: 'tpl-long-call', label: 'Long Call', kind: 'template' as const, template: 'Long Call' },
  { id: 'tpl-long-put', label: 'Long Put', kind: 'template' as const, template: 'Long Put' },
  { id: 'tpl-bull-call', label: 'Bull Call Spread', kind: 'template' as const, template: 'Bull Call Spread' },
  { id: 'tpl-iron-condor', label: 'Iron Condor', kind: 'template' as const, template: 'Iron Condor' },
  { id: 'tpl-straddle', label: 'Long Straddle', kind: 'template' as const, template: 'Long Straddle' },
  { id: 'tpl-strangle', label: 'Long Strangle', kind: 'template' as const, template: 'Long Strangle' },
  { id: 'custom-protective', label: 'Long Stock + Protective Put', kind: 'protective_put' as const },
  { id: 'custom-covered', label: 'Long Stock + Covered Call', kind: 'covered_call' as const },
  { id: 'custom-fut-hedge', label: 'Long Future + Long Put Hedge', kind: 'fut_put' as const },
];

export function journalToMarketItem(sel: JournalSymbolSelection): MarketItem {
  return {
    symbol: sel.symbol,
    name: sel.name,
    price: sel.price,
    change: sel.change,
    changePercent: sel.changePercent,
    open: Math.round(sel.price * 0.998 * 100) / 100,
    high: Math.round(sel.price * 1.006 * 100) / 100,
    low: Math.round(sel.price * 0.994 * 100) / 100,
    volume: sel.volume ?? 0,
    type: sel.type === 'index' ? 'INDEX' : 'STOCK',
    exchange: sel.exchange,
    isFno: sel.isFno,
    lotSize: sel.lotSize,
  };
}

export function defaultWatchlist(): MarketItem[] {
  const seeds = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY'];
  const out: MarketItem[] = [];
  for (const sym of seeds) {
    const sel = getJournalSymbolSelection(sym);
    if (sel) out.push(journalToMarketItem(sel));
  }
  return out.length ? out : [];
}

/** Backfill exchange/lotSize for watchlists saved before full universe support */
export function normalizeWatchlist(items: MarketItem[]): MarketItem[] {
  return items.map((item) => {
    const sel = getJournalSymbolSelection(item.symbol, item.exchange);
    if (!sel) return item;
    return journalToMarketItem(sel);
  });
}

export function watchlistKey(item: Pick<MarketItem, 'symbol' | 'exchange'>) {
  return `${item.exchange}:${item.symbol}`;
}

export function canTradeFno(item: MarketItem): boolean {
  return item.isFno || item.type === 'INDEX' || getFnoInstrument(item.symbol) != null;
}

export function defaultOrderDraft(item: MarketItem, side: Side): PaperOrderDraft {
  const snap = getMarketSnapshot(item.symbol);
  const fno = canTradeFno(item);
  const segment: PaperSegment = fno ? 'FUTURES' : 'EQUITY';
  return {
    segment,
    side,
    product: 'MIS',
    orderType: 'MARKET',
    quantity: 1,
    price: item.price,
    triggerPrice: item.price,
    notes: '',
    optionType: 'CE',
    strike: snap.atmStrike,
    expiry: EXPIRY_DATES[0] ?? '',
  };
}

export function segmentLabel(seg: PaperSegment): string {
  if (seg === 'FUTURES') return 'Futures';
  if (seg === 'OPTIONS') return 'Options';
  return 'Cash / Equity';
}

export function instrumentFromDraft(draft: PaperOrderDraft): PaperLegInstrument {
  if (draft.segment === 'OPTIONS') return draft.optionType;
  if (draft.segment === 'FUTURES') return 'FUT';
  return 'EQUITY';
}

export function orderTypeLabel(type: OrderType): string {
  if (type === 'SL') return 'SL';
  if (type === 'SL-M') return 'SL-M';
  if (type === 'TARGET') return 'Target';
  if (type === 'LIMIT') return 'Limit';
  return 'Market';
}

/** Only market orders execute immediately; others wait in the order book */
export function orderFillsImmediately(type: OrderType): boolean {
  return type === 'MARKET';
}

export function effectiveOrderPrice(
  draft: PaperOrderDraft,
  item: MarketItem,
  spot: number,
): number {
  if (draft.segment === 'OPTIONS') {
    if (draft.orderType === 'MARKET' || draft.orderType === 'SL-M') {
      const prem = getChainPremium(getMarketSnapshot(item.symbol).chain, draft.strike, draft.optionType);
      return prem ?? draft.price;
    }
    return draft.price;
  }
  if (draft.orderType === 'MARKET' || draft.orderType === 'SL-M') return spot;
  return draft.price;
}

/** LTP at which a pending order should execute, or null if conditions not met */
export function checkOrderFill(order: PaperOrder, ltp: number): number | null {
  const { orderType, side, price } = order;
  const trigger = order.triggerPrice ?? price;

  if (orderType === 'LIMIT') {
    if (side === 'BUY' && ltp <= price) return price;
    if (side === 'SELL' && ltp >= price) return price;
    return null;
  }

  if (orderType === 'TARGET') {
    if (side === 'SELL' && ltp >= price) return price;
    if (side === 'BUY' && ltp <= price) return price;
    return null;
  }

  if (orderType === 'SL-M') {
    if (side === 'BUY' && ltp >= trigger) return ltp;
    if (side === 'SELL' && ltp <= trigger) return ltp;
    return null;
  }

  if (orderType === 'SL') {
    const limit = price;
    if (side === 'BUY' && ltp >= trigger && ltp <= limit) return limit;
    if (side === 'SELL' && ltp <= trigger && ltp >= limit) return limit;
    return null;
  }

  return null;
}

export function draftFromPaperOrder(order: PaperOrder): PaperOrderDraft {
  const segment: PaperSegment =
    order.segment ??
    (order.instrumentType === 'FUT'
      ? 'FUTURES'
      : order.instrumentType === 'CE' || order.instrumentType === 'PE'
        ? 'OPTIONS'
        : 'EQUITY');
  return {
    segment,
    side: order.side,
    product: order.product,
    orderType: order.orderType,
    quantity: order.quantity,
    price: order.fillPrice ?? order.price,
    triggerPrice: order.triggerPrice ?? order.price,
    notes: order.notes ?? '',
    optionType: order.instrumentType === 'PE' ? 'PE' : 'CE',
    strike: order.strike ?? 0,
    expiry: order.expiry ?? '',
  };
}

export function findWatchlistItem(watchlist: MarketItem[], symbol: string): MarketItem | undefined {
  return watchlist.find((w) => w.symbol === symbol);
}

/** Apply a single filled order to paper state (position + charges + margin) */
export function applyOrderFill(
  state: PaperState,
  order: PaperOrder,
  item: MarketItem,
  fillPrice: number,
): PaperState {
  const draft = draftFromPaperOrder(order);
  const spot = item.price;
  const margin = order.reservedMargin ?? marginForOrderDraft(draft, item, fillPrice);
  const charges = calculateChargesForDraft(draft, item, fillPrice);
  const position = buildPositionFromOrder(order.id, draft, item, fillPrice, spot);
  const historyEntry: PaperTradeRecord = {
    id: order.id,
    symbol: position.symbol,
    name: position.name,
    side: position.side,
    quantity: position.quantity,
    entryPrice: fillPrice,
    entryAt: position.openedAt,
    strategy: position.notes ?? state.strategy,
    status: 'OPEN',
  };

  const filledOrder: PaperOrder = {
    ...order,
    status: 'COMPLETE',
    fillPrice,
    filledAt: new Date().toISOString(),
    price: fillPrice,
  };

  return {
    ...state,
    balance: Number((state.balance - charges.total).toFixed(2)),
    usedMargin: Number((state.usedMargin + margin).toFixed(2)),
    totalCharges: Number((state.totalCharges + charges.total).toFixed(2)),
    orders: state.orders.map((o) => (o.id === order.id ? filledOrder : o)),
    positions: [...state.positions, position],
    history: [historyEntry, ...state.history],
    lastSync: new Date().toISOString(),
  };
}

/** Scan pending orders against live quotes; returns updated state and fill messages */
export function processPendingPaperOrders(
  state: PaperState,
  watchlist: MarketItem[],
): { state: PaperState; messages: string[] } {
  const quoteMap = Object.fromEntries(watchlist.map((i) => [i.symbol, i.price]));
  const messages: string[] = [];
  let next = state;

  for (const order of state.orders.filter((o) => o.status === 'PENDING')) {

    const ltp = quoteMap[order.symbol];
    if (ltp === undefined) continue;

    const fillPrice = checkOrderFill(order, ltp);
    if (fillPrice === null) continue;

    const item = findWatchlistItem(watchlist, order.symbol);
    if (!item) continue;

    next = applyOrderFill(next, order, item, fillPrice);
    messages.push(
      `${orderTypeLabel(order.orderType)} ${order.side} ${order.symbol} executed @ ₹${fillPrice.toFixed(2)}`,
    );
  }

  return { state: next, messages };
}

/** Margin + entry charges required to place an order that fills immediately */
export function totalEntryCostForOrder(
  draft: PaperOrderDraft,
  item: MarketItem,
  effectivePrice: number,
): { margin: number; charges: PaperCharges; total: number } {
  const margin = marginForOrderDraft(draft, item, effectivePrice);
  const charges = calculateChargesForDraft(draft, item, effectivePrice);
  return { margin, charges, total: roundInr(margin + charges.total) };
}

export function marginForOrderDraft(draft: PaperOrderDraft, item: MarketItem, effectivePrice: number): number {
  const lot = item.lotSize || getSymbolMeta(item.symbol).lotSize || 1;
  const lots = draft.quantity;
  if (draft.segment === 'OPTIONS') {
    const base = effectivePrice * lots * lot;
    return draft.side === 'SELL' ? base + item.price * lot * lots * 0.08 : base;
  }
  if (draft.segment === 'FUTURES') {
    return item.price * lots * lot * 0.12;
  }
  const notional = effectivePrice * (draft.segment === 'EQUITY' ? lots : lots * lot);
  return notional * (draft.product === 'MIS' ? 0.2 : 1);
}

export function positionDisplaySymbol(
  underlying: string,
  instrument: PaperLegInstrument,
  strike?: number,
): string {
  if (instrument === 'CE' || instrument === 'PE') return `${underlying} ${strike}${instrument}`;
  if (instrument === 'FUT') return `${underlying} FUT`;
  return underlying;
}

export function markPriceForPosition(pos: PaperPosition, quoteMap: Record<string, number>): number {
  const und = pos.underlying ?? pos.symbol.split(' ')[0];
  const spot = quoteMap[und] ?? pos.avgPrice;
  if (pos.instrumentType === 'CE' || pos.instrumentType === 'PE') {
    const prem = getChainPremium(
      getMarketSnapshot(und).chain,
      pos.strike ?? spot,
      pos.instrumentType,
    );
    return prem ?? pos.avgPrice;
  }
  if (pos.instrumentType === 'FUT') return spot;
  return quoteMap[pos.symbol] ?? spot;
}

export function buildPositionFromOrder(
  orderId: string,
  draft: PaperOrderDraft,
  item: MarketItem,
  effectivePrice: number,
  spot: number,
): PaperPosition {
  const instrument = instrumentFromDraft(draft);
  const underlying = item.symbol;
  const lot = item.lotSize || getSymbolMeta(underlying).lotSize || 1;
  const name =
    instrument === 'EQUITY'
      ? item.name
      : instrument === 'FUT'
        ? `${underlying} Futures`
        : `${underlying} ${draft.strike}${draft.optionType}`;

  const px =
    instrument === 'CE' || instrument === 'PE'
      ? effectivePrice
      : instrument === 'FUT'
        ? spot
        : effectivePrice;

  const base: PaperPosition = {
    id: orderId,
    symbol: positionDisplaySymbol(underlying, instrument, draft.strike),
    name,
    side: draft.side,
    product: draft.segment === 'EQUITY' ? draft.product : 'MIS',
    quantity: draft.quantity,
    avgPrice: effectivePrice,
    currentPrice: px,
    pnl: 0,
    pnlPercent: 0,
    openedAt: new Date().toISOString(),
    notes: draft.notes.trim() || segmentLabel(draft.segment),
    instrumentType: instrument,
    underlying,
    strike: instrument === 'CE' || instrument === 'PE' ? draft.strike : undefined,
    expiry: instrument === 'CE' || instrument === 'PE' ? draft.expiry : undefined,
    lotSize: instrument === 'EQUITY' ? 1 : lot,
    exchange: item.exchange,
    segment: draft.segment,
  };
  return createPositionSnapshot(base, px, spot);
}

export function refreshWatchlistQuotes(watchlist: MarketItem[]): MarketItem[] {
  const base = watchlist.length ? normalizeWatchlist(watchlist) : defaultWatchlist();
  return base.map((item) => applyLiveQuoteToMarketItem(item));
}

export function computePnL(
  position: Pick<PaperPosition, 'side' | 'avgPrice' | 'quantity' | 'instrumentType' | 'strike' | 'lotSize' | 'expiry'>,
  currentPrice: number,
  underlyingPrice?: number,
): number {
  if (position.instrumentType === 'CE' || position.instrumentType === 'PE') {
    const spot = underlyingPrice ?? currentPrice;
    const leg: SimLeg = {
      id: 'x',
      symbol: '',
      type: position.instrumentType,
      action: position.side,
      strike: position.strike ?? spot,
      premium: position.avgPrice,
      quantity: position.quantity,
      expiry: position.expiry ?? '',
    };
    const mult = position.lotSize ?? 1;
    return legPnlAtSpot(leg, spot, mult);
  }
  const mult =
    position.instrumentType === 'FUT' ? (position.lotSize ?? 1) : position.instrumentType === 'EQUITY' ? 1 : position.lotSize ?? 1;
  if (position.side === 'BUY') return (currentPrice - position.avgPrice) * position.quantity * mult;
  return (position.avgPrice - currentPrice) * position.quantity * mult;
}

export function createPositionSnapshot(
  position: PaperPosition,
  currentPrice: number,
  underlyingPrice?: number,
): PaperPosition {
  const pnl = Number(computePnL(position, currentPrice, underlyingPrice).toFixed(2));
  const cost = position.avgPrice * position.quantity * (position.lotSize && position.instrumentType !== 'EQUITY' ? position.lotSize : 1);
  const pnlPercent = cost === 0 ? 0 : Number(((pnl / cost) * 100).toFixed(2));
  return { ...position, currentPrice, pnl, pnlPercent };
}

export function marginForLeg(leg: PaperLeg, product: Product = 'MIS'): number {
  if (leg.instrumentType === 'CE' || leg.instrumentType === 'PE') {
    return leg.avgPrice * leg.quantity * leg.lotSize;
  }
  const notional = leg.avgPrice * leg.quantity;
  return notional * (product === 'MIS' ? 0.2 : 1);
}

export function marginForPosition(position: PaperPosition): number {
  if (position.instrumentType === 'CE' || position.instrumentType === 'PE') {
    const base = position.avgPrice * position.quantity * (position.lotSize ?? 1);
    return position.side === 'SELL' ? base * 1.5 : base;
  }
  if (position.instrumentType === 'FUT') {
    return position.avgPrice * position.quantity * (position.lotSize ?? 1) * 0.12;
  }
  const notional = position.avgPrice * position.quantity;
  return notional * (position.product === 'MIS' ? 0.2 : 1);
}

function simLegToPaperLeg(sim: SimLeg, exchange: JournalSymbolSelection['exchange']): PaperLeg {
  const meta = getSymbolMeta(sim.symbol);
  return {
    id: sim.id,
    instrumentType: sim.type,
    symbol: sim.symbol,
    displayName: `${sim.symbol} ${sim.strike}${sim.type}`,
    action: sim.action,
    strike: sim.strike,
    expiry: sim.expiry,
    quantity: sim.quantity,
    lotSize: meta.lotSize,
    avgPrice: sim.premium,
    exchange,
  };
}

export function buildLegsFromPreset(
  presetId: string,
  underlying: JournalSymbolSelection,
  lots = 1,
): PaperLeg[] {
  const spot = underlying.price;
  const exchange = underlying.exchange;
  const meta = getSymbolMeta(underlying.symbol);
  const interval = meta.interval;
  const atm = Math.round(spot / interval) * interval;
  const snap = getMarketSnapshot(underlying.symbol);
  const chain = snap.chain;
  const expiry = EXPIRY_DATES[0];

  const preset = HEDGE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return [];

  if (preset.kind === 'template' && preset.template) {
    const sims = applyStrategyTemplate(preset.template, underlying.symbol, spot, lots);
    return sims.map((s) => simLegToPaperLeg(s, exchange));
  }

  if (preset.kind === 'protective_put') {
    const peStrike = atm;
    const pePrem = getChainPremium(chain, peStrike, 'PE') ?? Math.round(spot * 0.012);
    const qty = underlying.isFno ? lots : Math.max(1, Math.floor(50000 / Math.max(spot, 1)));
    return [
      {
        id: `eq-${Date.now()}`,
        instrumentType: 'EQUITY',
        symbol: underlying.symbol,
        displayName: underlying.name,
        action: 'BUY',
        quantity: qty,
        lotSize: 1,
        avgPrice: spot,
        exchange,
      },
      simLegToPaperLeg(
        createManualLeg({
          symbol: underlying.symbol,
          type: 'PE',
          action: 'BUY',
          strike: peStrike,
          premium: pePrem,
          quantity: underlying.isFno ? lots : 1,
          expiry,
        }),
        exchange,
      ),
    ];
  }

  if (preset.kind === 'covered_call') {
    const ceStrike = atm + interval;
    const cePrem = getChainPremium(chain, ceStrike, 'CE') ?? Math.round(spot * 0.01);
    const qty = underlying.isFno ? lots : Math.max(1, Math.floor(50000 / Math.max(spot, 1)));
    return [
      {
        id: `eq-${Date.now()}`,
        instrumentType: 'EQUITY',
        symbol: underlying.symbol,
        displayName: underlying.name,
        action: 'BUY',
        quantity: qty,
        lotSize: 1,
        avgPrice: spot,
        exchange,
      },
      simLegToPaperLeg(
        createManualLeg({
          symbol: underlying.symbol,
          type: 'CE',
          action: 'SELL',
          strike: ceStrike,
          premium: cePrem,
          quantity: underlying.isFno ? lots : 1,
          expiry,
        }),
        exchange,
      ),
    ];
  }

  if (preset.kind === 'fut_put') {
    const peStrike = atm;
    const pePrem = getChainPremium(chain, peStrike, 'PE') ?? Math.round(spot * 0.012);
    return [
      {
        id: `fut-${Date.now()}`,
        instrumentType: 'FUT',
        symbol: underlying.symbol,
        displayName: `${underlying.symbol} FUT`,
        action: 'BUY',
        quantity: lots,
        lotSize: meta.lotSize,
        avgPrice: spot,
        exchange,
      },
      simLegToPaperLeg(
        createManualLeg({
          symbol: underlying.symbol,
          type: 'PE',
          action: 'BUY',
          strike: peStrike,
          premium: pePrem,
          quantity: lots,
          expiry,
        }),
        exchange,
      ),
    ];
  }

  return [];
}

export function markLegPrice(leg: PaperLeg, quoteMap: Record<string, number>): number {
  if (leg.instrumentType === 'EQUITY' || leg.instrumentType === 'FUT') {
    return quoteMap[leg.symbol] ?? leg.avgPrice;
  }
  const spot = quoteMap[leg.symbol] ?? leg.avgPrice;
  const sim: SimLeg = {
    id: leg.id,
    symbol: leg.symbol,
    type: leg.instrumentType,
    action: leg.action,
    strike: leg.strike ?? spot,
    premium: leg.avgPrice,
    quantity: leg.quantity,
    expiry: leg.expiry ?? '',
  };
  const mark = legPnlAtSpot(sim, spot, leg.lotSize) / (leg.quantity * leg.lotSize) + leg.avgPrice;
  return Math.max(0.05, Number(mark.toFixed(2)));
}

export function groupUnrealizedPnl(
  group: PaperStrategyGroup,
  quoteMap: Record<string, number>,
): number {
  return group.legs.reduce((sum, leg) => {
    const pos: PaperPosition = {
      id: leg.id,
      symbol: leg.symbol,
      name: leg.displayName,
      side: leg.action,
      product: 'MIS',
      quantity: leg.quantity,
      avgPrice: leg.avgPrice,
      currentPrice: markLegPrice(leg, quoteMap),
      pnl: 0,
      pnlPercent: 0,
      openedAt: group.openedAt,
      instrumentType: leg.instrumentType,
      strike: leg.strike,
      lotSize: leg.lotSize,
    };
    return sum + computePnL(pos, markLegPrice(leg, quoteMap), quoteMap[leg.symbol]);
  }, 0);
}

export function legsToPositions(
  group: PaperStrategyGroup,
  quoteMap: Record<string, number>,
): PaperPosition[] {
  return group.legs.map((leg) => {
    const px = markLegPrice(leg, quoteMap);
    const base: PaperPosition = {
      id: `${group.id}-${leg.id}`,
      symbol: leg.instrumentType === 'EQUITY' ? leg.symbol : `${leg.symbol} ${leg.strike}${leg.instrumentType}`,
      name: leg.displayName,
      side: leg.action,
      product: leg.instrumentType === 'EQUITY' ? 'CNC' : 'MIS',
      quantity: leg.quantity,
      avgPrice: leg.avgPrice,
      currentPrice: px,
      pnl: 0,
      pnlPercent: 0,
      openedAt: group.openedAt,
      groupId: group.id,
      legId: leg.id,
      instrumentType: leg.instrumentType,
      strike: leg.strike,
      expiry: leg.expiry,
      lotSize: leg.lotSize,
      exchange: leg.exchange,
      notes: group.name,
      underlying: leg.symbol,
      segment:
        leg.instrumentType === 'FUT'
          ? 'FUTURES'
          : leg.instrumentType === 'CE' || leg.instrumentType === 'PE'
            ? 'OPTIONS'
            : 'EQUITY',
    };
    return createPositionSnapshot(base, px, quoteMap[leg.symbol]);
  });
}

export { STRATEGY_TEMPLATES };
