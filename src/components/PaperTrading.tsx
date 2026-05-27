import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Briefcase,
  Clock,
  Layers,
  List,
  Plus,
  RotateCcw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../hooks/useAuth';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { JournalSymbolSelection } from '../services/equitySymbolService';
import {
  applyOrderFill,
  buildPositionFromOrder,
  calculateChargesForLeg,
  calculateChargesForPosition,
  canTradeFno,
  checkOrderFill,
  computePnL,
  createPositionSnapshot,
  defaultOrderDraft,
  defaultWatchlist,
  effectiveOrderPrice,
  groupUnrealizedPnl,
  instrumentFromDraft,
  journalToMarketItem,
  legsToPositions,
  marginForLeg,
  marginForPosition,
  markPriceForPosition,
  normalizeWatchlist,
  orderFillsImmediately,
  orderTypeLabel,
  processPendingPaperOrders,
  refreshWatchlistQuotes,
  totalEntryCostForOrder,
  watchlistKey,
  type MarketItem,
  type PaperOrder,
  type PaperOrderDraft,
  type PaperState,
  type PaperStrategyGroup,
  type PaperTradeRecord,
  type Side,
} from '../services/paperTradingEngine';
import { getJournalSymbolSelection, refreshMarketSymbols as refreshEquity } from '../services/equitySymbolService';
import {
  clearPendingStrategy,
  consumePendingStrategy,
  peekPendingStrategy,
  strategyPayloadToPaperGroup,
  type StrategyBuilderPaperPayload,
} from '../services/paperTradingBridge';
import {
  refreshPaperTradingLiveQuotes,
  type PaperQuoteFeedStatus,
} from '../services/paperTradingLiveService';
import JournalSymbolPicker from './journal/JournalSymbolPicker';
import PaperOrderModal from './paper/PaperOrderModal';

interface PaperTradingProps {
  user?: User | null;
  onNavigate?: (tab: string) => void;
}

type PaperTab = 'overview' | 'positions' | 'orders' | 'history' | 'analytics' | 'strategies';

const STORAGE_PREFIX = 'tradeflow_paper_trading_';
const DEFAULT_STRATEGY = 'Swing / breakout';
const INITIAL_CAPITAL = 1_000_000;

function resetPaperCapitalState(prev: PaperState): PaperState {
  return {
    ...prev,
    balance: INITIAL_CAPITAL,
    available: INITIAL_CAPITAL,
    usedMargin: 0,
    totalCharges: 0,
    positions: [],
    orders: [],
    strategyGroups: [],
    history: [],
    lastSync: new Date().toISOString(),
  };
}

function getStorageKey(user?: User | null) {
  return `${STORAGE_PREFIX}${user?.id ?? 'guest'}`;
}

function loadStoredState(user?: User | null): PaperState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(user));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PaperState>;

    if (!Array.isArray(parsed.watchlist)) {
      return null;
    }

    return {
      balance: Number(parsed.balance ?? INITIAL_CAPITAL),
      usedMargin: Number(parsed.usedMargin ?? 0),
      available: Number(parsed.available ?? INITIAL_CAPITAL),
      totalCharges: Number(parsed.totalCharges ?? 0),
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      watchlist: normalizeWatchlist(parsed.watchlist as MarketItem[]),
      strategyGroups: Array.isArray(parsed.strategyGroups) ? parsed.strategyGroups : [],
      strategy: typeof parsed.strategy === 'string' ? parsed.strategy : DEFAULT_STRATEGY,
      lastSync: typeof parsed.lastSync === 'string' ? parsed.lastSync : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function createInitialState(): PaperState {
  return {
    balance: INITIAL_CAPITAL,
    usedMargin: 0,
    available: INITIAL_CAPITAL,
    totalCharges: 0,
    positions: [],
    orders: [],
    history: [],
    watchlist: defaultWatchlist(),
    strategyGroups: [],
    strategy: DEFAULT_STRATEGY,
    lastSync: new Date().toISOString(),
  };
}

export default function PaperTrading({ user }: PaperTradingProps) {
  const [paperState, setPaperState] = useState<PaperState>(
    () => loadStoredState(user) ?? createInitialState(),
  );
  const persistReadyRef = useRef(false);
  const [activeTab, setActiveTab] = useState<PaperTab>('overview');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<MarketItem | null>(null);
  const [pickerSymbol, setPickerSymbol] = useState('NIFTY');
  const [statusMessage, setStatusMessage] = useState('Paper trading ready. Use live snapshots and save your trades.');
  const [pendingStrategy, setPendingStrategy] = useState<StrategyBuilderPaperPayload | null>(null);
  const [showAddWatchlist, setShowAddWatchlist] = useState(false);
  const [showResetCapital, setShowResetCapital] = useState(false);
  const [quoteFeed, setQuoteFeed] = useState<PaperQuoteFeedStatus>({
    mode: 'loading',
    liveSymbolCount: 0,
    serverOk: false,
    message: 'Connecting to market feed…',
    updatedAt: new Date().toISOString(),
  });
  const [addWatchDraft, setAddWatchDraft] = useState<JournalSymbolSelection | null>(null);
  const [orderSide, setOrderSide] = useState<Side>('BUY');
  const [orderDraft, setOrderDraft] = useState<PaperOrderDraft>(() =>
    defaultOrderDraft(
      defaultWatchlist()[0] ?? {
        symbol: 'NIFTY',
        name: 'NIFTY',
        price: 24500,
        change: 0,
        changePercent: 0,
        open: 0,
        high: 0,
        low: 0,
        volume: 0,
        type: 'INDEX',
        exchange: 'INDEX',
        isFno: true,
        lotSize: 25,
      },
      'BUY',
    ),
  );

  useEffect(() => {
    const stored = loadStoredState(user);

    if (stored) {
      setPaperState(stored);
      setStatusMessage('Saved paper trading state restored successfully.');
    } else {
      setPaperState(createInitialState());
      setStatusMessage('Fresh paper trading session started with live market data.');
    }

    persistReadyRef.current = true;

    const pending = peekPendingStrategy();
    if (pending) {
      setPendingStrategy(pending);
      setActiveTab('strategies');
      setStatusMessage(`Strategy "${pending.strategyName}" ready — confirm to execute.`);
    }
  }, [user]);

  const applyLiveQuotesToState = (feed: PaperQuoteFeedStatus) => {
    setQuoteFeed(feed);
    setPaperState((prev) => {
      const nextWatchlist = refreshWatchlistQuotes(prev.watchlist);
      const quoteMap = Object.fromEntries(nextWatchlist.map((item) => [item.symbol, item.price]));
      const nextPositions = prev.positions.map((position) => {
        const und = position.underlying ?? position.symbol.split(' ')[0];
        const px = markPriceForPosition(position, quoteMap);
        return createPositionSnapshot(position, px, quoteMap[und]);
      });

      const base = {
        ...prev,
        watchlist: nextWatchlist,
        positions: nextPositions,
        lastSync: new Date().toISOString(),
      };
      const { state: afterOrders, messages } = processPendingPaperOrders(base, nextWatchlist);
      if (messages.length > 0) {
        queueMicrotask(() => setStatusMessage(messages[messages.length - 1]));
      }
      return afterOrders;
    });
  };

  const syncPaperQuotes = () => {
    refreshEquity();
    setPaperState((prev) => {
      const symbols = prev.watchlist.map((w) => w.symbol);
      void refreshPaperTradingLiveQuotes(symbols).then(applyLiveQuotesToState);
      const nextWatchlist = refreshWatchlistQuotes(prev.watchlist);
      const quoteMap = Object.fromEntries(nextWatchlist.map((item) => [item.symbol, item.price]));
      const nextPositions = prev.positions.map((position) => {
        const und = position.underlying ?? position.symbol.split(' ')[0];
        const px = markPriceForPosition(position, quoteMap);
        return createPositionSnapshot(position, px, quoteMap[und]);
      });
      const base = {
        ...prev,
        watchlist: nextWatchlist,
        positions: nextPositions,
        lastSync: new Date().toISOString(),
      };
      const { state: afterOrders, messages } = processPendingPaperOrders(base, nextWatchlist);
      if (messages.length > 0) {
        queueMicrotask(() => setStatusMessage(messages[messages.length - 1]));
      }
      return afterOrders;
    });
  };

  useAutoRefresh(syncPaperQuotes);

  useEffect(() => {
    if (!persistReadyRef.current) return;
    const symbols = paperState.watchlist.map((w) => w.symbol);
    void refreshPaperTradingLiveQuotes(symbols).then(applyLiveQuotesToState);
  }, [user]);

  useEffect(() => {
    if (!persistReadyRef.current) return;
    localStorage.setItem(getStorageKey(user), JSON.stringify(paperState));
  }, [paperState, user]);

  const currentSymbol = selectedSymbol ?? paperState.watchlist[0] ?? null;
  const quoteMap = useMemo(
    () => Object.fromEntries(paperState.watchlist.map((item) => [item.symbol, item.price])),
    [paperState.watchlist],
  );
  const positionsWithLive = useMemo(
    () =>
      paperState.positions.map((position) => {
        const und = position.underlying ?? position.symbol.split(' ')[0];
        const px = markPriceForPosition(position, quoteMap);
        return createPositionSnapshot(position, px, quoteMap[und]);
      }),
    [paperState.positions, quoteMap],
  );

  const openGroups = paperState.strategyGroups.filter((g) => g.status === 'OPEN');

  const totalUnrealized = positionsWithLive.reduce((sum, position) => sum + position.pnl, 0);
  const closedTrades = paperState.history.filter((trade) => trade.status === 'CLOSED');
  const netEquity = paperState.balance + totalUnrealized;
  const winningTrades = closedTrades.filter((trade) => (trade.pnl ?? 0) >= 0).length;
  const averageWin = closedTrades.length > 0
    ? closedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0) / closedTrades.length
    : 0;
  const currentPriceForSelection = currentSymbol ? (quoteMap[currentSymbol.symbol] ?? currentSymbol.price) : 0;
  const pendingOrders = paperState.orders.filter((order) => order.status === 'PENDING').length;
  const openPositionsValue = positionsWithLive.reduce((sum, position) => sum + position.currentPrice * position.quantity, 0);
  const openPositionStats = positionsWithLive.reduce(
    (stats, position) => {
      if (position.pnl >= 0) {
        stats.winning += 1;
      } else {
        stats.losing += 1;
      }

      stats.totalPnl += position.pnl;
      return stats;
    },
    { winning: 0, losing: 0, totalPnl: 0 },
  );
  const totalPnl = totalUnrealized + closedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const highLowRange = currentSymbol
    ? `${currentSymbol.low.toFixed(2)} - ${currentSymbol.high.toFixed(2)}`
    : '0.00 - 0.00';

  const openOrderModal = (symbol: MarketItem, side: Side) => {
    setSelectedSymbol(symbol);
    setOrderSide(side);
    setOrderDraft(defaultOrderDraft(symbol, side));
    setShowOrderModal(true);
  };

  const validateOrder = (draft: PaperOrderDraft, symbol: MarketItem) => {
    if (!symbol) return 'Select a market instrument first.';
    if (draft.quantity <= 0) return 'Quantity should be greater than zero.';
    if (draft.segment === 'OPTIONS' && (draft.orderType === 'SL' || draft.orderType === 'SL-M')) {
      return 'Stop-loss on options is not supported — use Limit or Market.';
    }
    if (!canTradeFno(symbol) && draft.segment !== 'EQUITY') {
      return 'Futures/Options require an F&O symbol (e.g. NIFTY, RELIANCE).';
    }
    const effectivePrice = effectiveOrderPrice(draft, symbol, symbol.price);
    const fillsNow = orderFillsImmediately(draft.orderType);
    const { margin: marginRequired, charges, total: totalCost } = totalEntryCostForOrder(draft, symbol, effectivePrice);
    if (fillsNow && totalCost > paperState.available) {
      return `Insufficient balance. Need ₹${totalCost.toLocaleString('en-IN')} (margin ₹${marginRequired.toLocaleString('en-IN')} + charges ₹${charges.total.toFixed(2)}).`;
    }
    if (!fillsNow && marginRequired > paperState.available) {
      return 'Insufficient available balance for margin on this order.';
    }
    if ((draft.orderType === 'LIMIT' || draft.orderType === 'TARGET') && draft.price <= 0) {
      return 'Enter a valid price.';
    }
    if ((draft.orderType === 'SL' || draft.orderType === 'SL-M') && draft.triggerPrice <= 0) {
      return 'Enter a valid trigger price.';
    }
    if (draft.orderType === 'SL' && draft.price <= 0) return 'Enter a valid limit price after trigger.';
    if (draft.segment === 'OPTIONS' && draft.strike <= 0) return 'Select a valid strike.';
    return '';
  };

  const addOrder = () => {
    if (!currentSymbol) {
      setStatusMessage('Select a market instrument first.');
      return;
    }

    const draft = { ...orderDraft, side: orderSide };
    const error = validateOrder(draft, currentSymbol);
    if (error) {
      setStatusMessage(error);
      return;
    }

    const spot = currentPriceForSelection;
    const effectivePrice = effectiveOrderPrice(draft, currentSymbol, spot);
    const { margin: marginRequired, charges: entryCharges } = totalEntryCostForOrder(
      draft,
      currentSymbol,
      effectivePrice,
    );
    const completes = orderFillsImmediately(draft.orderType);
    const chargeOnFill = completes ? entryCharges.total : 0;
    const orderId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const instrument = instrumentFromDraft(draft);
    const orderPrice =
      draft.orderType === 'MARKET' || draft.orderType === 'SL-M' ? effectivePrice : draft.price;

    const newOrder: PaperOrder = {
      id: orderId,
      symbol: currentSymbol.symbol,
      name: currentSymbol.name,
      side: draft.side,
      product: draft.segment === 'EQUITY' ? draft.product : 'MIS',
      quantity: draft.quantity,
      orderType: draft.orderType,
      price: orderPrice,
      triggerPrice:
        draft.orderType === 'SL' || draft.orderType === 'SL-M' ? draft.triggerPrice : undefined,
      status: completes ? 'COMPLETE' : 'PENDING',
      reservedMargin: completes ? undefined : marginRequired,
      createdAt: new Date().toISOString(),
      notes: draft.notes.trim() || undefined,
      instrumentType: instrument,
      underlying: currentSymbol.symbol,
      strike: draft.segment === 'OPTIONS' ? draft.strike : undefined,
      expiry: draft.segment === 'OPTIONS' ? draft.expiry : undefined,
      lotSize: currentSymbol.lotSize,
      segment: draft.segment,
    };

    setPaperState((prev) => {
      if (!completes && marginRequired > prev.available) {
        return prev;
      }
      if (completes && marginRequired + chargeOnFill > prev.available) {
        return prev;
      }

      if (completes) {
        const position = buildPositionFromOrder(orderId, draft, currentSymbol, effectivePrice, spot);
        const historyEntry: PaperTradeRecord = {
          id: orderId,
          symbol: position.symbol,
          name: position.name,
          side: position.side,
          quantity: position.quantity,
          entryPrice: effectivePrice,
          entryAt: position.openedAt,
          strategy: position.notes ?? prev.strategy,
          status: 'OPEN',
        };
        return {
          ...prev,
          balance: Number((prev.balance - marginRequired - chargeOnFill).toFixed(2)),
          available: Number((prev.available - marginRequired - chargeOnFill).toFixed(2)),
          usedMargin: Number((prev.usedMargin + marginRequired).toFixed(2)),
          totalCharges: Number((prev.totalCharges + chargeOnFill).toFixed(2)),
          orders: [{ ...newOrder, fillPrice: effectivePrice, filledAt: new Date().toISOString() }, ...prev.orders],
          positions: [...prev.positions, position],
          history: [historyEntry, ...prev.history],
          lastSync: new Date().toISOString(),
        };
      }

      let next: PaperState = {
        ...prev,
        available: Number((prev.available - marginRequired).toFixed(2)),
        orders: [newOrder, ...prev.orders],
        lastSync: new Date().toISOString(),
      };

      const instantFill = checkOrderFill(newOrder, spot);
      if (instantFill !== null) {
        next = applyOrderFill(next, newOrder, currentSymbol, instantFill);
      }

      return next;
    });

    setShowOrderModal(false);
    const typeLabel = orderTypeLabel(draft.orderType);
    setStatusMessage(
      completes
        ? `Market ${draft.side} filled — ${currentSymbol.symbol} @ ₹${effectivePrice.toFixed(2)}. Charges ₹${chargeOnFill.toFixed(2)}`
        : `${typeLabel} ${draft.side} order open — triggers when price matches (margin blocked ₹${marginRequired.toLocaleString('en-IN')}).`,
    );
  };

  const squareOff = (positionId: string) => {
    const position = positionsWithLive.find((item) => item.id === positionId);

    if (!position) {
      return;
    }

    const und = position.underlying ?? position.symbol.split(' ')[0];
    const exitPx = markPriceForPosition(position, quoteMap);
    const realizedPnl = Number(computePnL(position, exitPx, quoteMap[und]).toFixed(2));
    const marginReleased = marginForPosition(position);
    const exitCharges = calculateChargesForPosition(position, exitPx, true).total;
    const netPnl = Number((realizedPnl - exitCharges).toFixed(2));

    setPaperState((prev) => ({
      ...prev,
      balance: Number((prev.balance + netPnl).toFixed(2)),
      available: Number((prev.available + marginReleased + netPnl).toFixed(2)),
      usedMargin: Math.max(0, Number((prev.usedMargin - marginReleased).toFixed(2))),
      totalCharges: Number((prev.totalCharges + exitCharges).toFixed(2)),
      positions: prev.positions.filter((item) => item.id !== positionId),
      history: prev.history.map((item) => item.id === positionId
        ? {
            ...item,
            exitPrice: exitPx,
            exitAt: new Date().toISOString(),
            pnl: netPnl,
            pnlPercent: position.pnlPercent,
            status: 'CLOSED',
          }
        : item),
      lastSync: new Date().toISOString(),
    }));

    setStatusMessage(
      `Closed ${position.symbol}. P&L ₹${realizedPnl.toFixed(2)} − exit charges ₹${exitCharges.toFixed(2)} = ₹${netPnl.toFixed(2)}`,
    );
  };

  const cancelOrder = (orderId: string) => {
    setPaperState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      const release = target?.status === 'PENDING' ? (target.reservedMargin ?? 0) : 0;
      return {
        ...prev,
        available: Number((prev.available + release).toFixed(2)),
        orders: prev.orders.map((order) =>
          order.id === orderId ? { ...order, status: 'CANCELLED' as const } : order,
        ),
        lastSync: new Date().toISOString(),
      };
    });
    setStatusMessage('Order cancelled. Blocked margin released.');
  };

  const addToWatchlist = (sel: JournalSymbolSelection): boolean => {
    const item = journalToMarketItem(sel);
    let added = false;
    setPaperState((prev) => {
      if (prev.watchlist.some((w) => watchlistKey(w) === watchlistKey(item))) {
        return prev;
      }
      added = true;
      return { ...prev, watchlist: [item, ...prev.watchlist], lastSync: new Date().toISOString() };
    });
    setSelectedSymbol(item);
    setPickerSymbol(sel.symbol);
    setStatusMessage(
      added ? `${item.symbol} (${item.exchange}) added to watchlist.` : `${item.symbol} is already in watchlist.`,
    );
    return added;
  };

  const removeFromWatchlist = (key: string) => {
    setPaperState((prev) => {
      const next = prev.watchlist.filter((w) => watchlistKey(w) !== key);
      return {
        ...prev,
        watchlist: next,
        lastSync: new Date().toISOString(),
      };
    });
    if (currentSymbol && watchlistKey(currentSymbol) === key) {
      setSelectedSymbol(null);
    }
    setStatusMessage('Removed from watchlist.');
  };

  const confirmAddWatchlist = () => {
    if (!addWatchDraft) {
      setStatusMessage('Search and select a symbol first.');
      return;
    }
    addToWatchlist(addWatchDraft);
    setShowAddWatchlist(false);
    setAddWatchDraft(null);
  };

  const executeHedgeStrategy = (group: PaperStrategyGroup): { ok: boolean; message: string } => {
    const marginRequired = group.legs.reduce((s, leg) => s + marginForLeg(leg), 0);
    const entryBrokerage = group.legs.reduce((s, leg) => s + calculateChargesForLeg(leg).total, 0);
    const totalCost = Number((marginRequired + entryBrokerage).toFixed(2));
    let result: { ok: boolean; message: string } = {
      ok: false,
      message: `Insufficient balance. Need ₹${totalCost.toLocaleString('en-IN')} (margin + brokerage).`,
    };

    setPaperState((prev) => {
      if (totalCost > prev.available) {
        return prev;
      }
      const quoteMap = Object.fromEntries(prev.watchlist.map((w) => [w.symbol, w.price]));
      const positions = legsToPositions(group, quoteMap);
      const historyEntries: PaperTradeRecord[] = positions.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        name: p.name,
        side: p.side,
        quantity: p.quantity,
        entryPrice: p.avgPrice,
        entryAt: group.openedAt,
        strategy: group.name,
        status: 'OPEN' as const,
        groupId: group.id,
      }));

      result = { ok: true, message: 'OK' };
      return {
        ...prev,
        balance: Number((prev.balance - marginRequired - entryBrokerage).toFixed(2)),
        available: Number((prev.available - marginRequired - entryBrokerage).toFixed(2)),
        usedMargin: Number((prev.usedMargin + marginRequired).toFixed(2)),
        totalCharges: Number((prev.totalCharges + entryBrokerage).toFixed(2)),
        positions: [...prev.positions, ...positions],
        strategyGroups: [group, ...prev.strategyGroups],
        history: [...historyEntries, ...prev.history],
        strategy: group.name,
        lastSync: new Date().toISOString(),
      };
    });

    if (result.ok) {
      setActiveTab('strategies');
      setStatusMessage(
        `Strategy "${group.name}" — ${group.legs.length} legs. Charges: ₹${entryBrokerage.toFixed(2)}`,
      );
    }
    return result;
  };

  const confirmPendingStrategy = () => {
    const payload = consumePendingStrategy() ?? pendingStrategy;
    if (!payload) return;
    const sel = getJournalSymbolSelection(payload.symbol);
    if (sel) addToWatchlist(sel);
    const group = strategyPayloadToPaperGroup(payload);
    const res = executeHedgeStrategy(group);
    if (!res.ok) setStatusMessage(res.message);
    setPendingStrategy(null);
  };

  const dismissPendingStrategy = () => {
    clearPendingStrategy();
    setPendingStrategy(null);
    setStatusMessage('Strategy import cancelled.');
  };

  const squareOffGroup = (groupId: string) => {
    const group = paperState.strategyGroups.find((g) => g.id === groupId);
    if (!group) return;
    const groupPositions = positionsWithLive.filter((p) => p.groupId === groupId);
    const realized = groupPositions.reduce((s, p) => s + p.pnl, 0);
    const exitCharges = groupPositions.reduce(
      (s, p) => s + calculateChargesForPosition(p, p.currentPrice, true).total,
      0,
    );
    const netRealized = Number((realized - exitCharges).toFixed(2));
    const marginReleased = groupPositions.reduce((s, p) => s + marginForPosition(p), 0);
    const avgExit =
      groupPositions.length > 0
        ? groupPositions.reduce((s, p) => s + p.currentPrice, 0) / groupPositions.length
        : 0;

    setPaperState((prev) => ({
      ...prev,
      balance: Number((prev.balance + netRealized).toFixed(2)),
      available: Number((prev.available + marginReleased + netRealized).toFixed(2)),
      usedMargin: Math.max(0, Number((prev.usedMargin - marginReleased).toFixed(2))),
      totalCharges: Number((prev.totalCharges + exitCharges).toFixed(2)),
      positions: prev.positions.filter((p) => p.groupId !== groupId),
      strategyGroups: prev.strategyGroups.map((g) =>
        g.id === groupId ? { ...g, status: 'CLOSED' as const } : g,
      ),
      history: prev.history.map((h) =>
        h.groupId === groupId
          ? {
              ...h,
              exitAt: new Date().toISOString(),
              exitPrice: avgExit,
              pnl: netRealized / Math.max(groupPositions.length, 1),
              status: 'CLOSED' as const,
            }
          : h,
      ),
      lastSync: new Date().toISOString(),
    }));
    setStatusMessage(
      `Closed "${group.name}". P&L ₹${realized.toFixed(2)} − charges ₹${exitCharges.toFixed(2)} = ₹${netRealized.toFixed(2)}`,
    );
  };

  const confirmResetCapital = () => {
    setPaperState((prev) => resetPaperCapitalState(prev));
    setShowOrderModal(false);
    setPendingStrategy(null);
    setShowResetCapital(false);
    setActiveTab('overview');
    setStatusMessage(`Capital reset to ₹${INITIAL_CAPITAL.toLocaleString('en-IN')}. Positions, orders & history cleared.`);
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col bg-[#080a12] text-slate-200 min-h-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 sm:px-4 py-2.5 bg-[#0b0e17] border-b border-[#1a1f2e]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-[#d4af37]/10 rounded-lg border border-[#d4af37]/20 shrink-0">
            <Wallet className="w-4 h-4 text-[#d4af37]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Paper Trading</h2>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                  quoteFeed.mode === 'live'
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                    : quoteFeed.mode === 'loading'
                      ? 'border-slate-600 bg-slate-800 text-slate-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                }`}
                title={quoteFeed.message}
              >
                {quoteFeed.mode === 'live' ? '● REAL' : quoteFeed.mode === 'loading' ? '…' : 'DEMO'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 truncate">
              {quoteFeed.mode === 'live'
                ? `Live LTP · ${quoteFeed.liveSymbolCount} symbols`
                : 'Cash · Futures · Options'}
            </p>
          </div>
        </div>
        <div className="hidden md:block flex-1 min-w-0 max-w-xl">
          <p className="text-xs text-slate-400 truncate">
            <span className="text-slate-600">Status:</span> {statusMessage}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm ml-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowResetCapital(true)}
            title="Reset paper capital to ₹10,00,000"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1a1f2e] bg-[#121520] text-slate-400 hover:text-[#d4af37] hover:border-[#d4af37]/40 text-[10px] sm:text-xs font-bold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset capital</span>
          </button>
          <div className="text-right">
            <div className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-bold">Equity</div>
            <div className="font-bold text-white tabular-nums">₹{netEquity.toLocaleString()}</div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Cash</div>
            <div className="font-bold text-emerald-400 tabular-nums">₹{paperState.balance.toLocaleString()}</div>
          </div>
          <div className="text-right hidden lg:block">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Margin</div>
            <div className="font-bold text-orange-400 tabular-nums">₹{paperState.usedMargin.toLocaleString()}</div>
          </div>
          <div className="text-right pl-3 border-l border-[#1a1f2e]">
            <div className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-bold">P&L</div>
            <div className={`font-bold tabular-nums ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
            </div>
          </div>
        </div>
        <p className="md:hidden w-full text-[11px] text-slate-400 truncate border-t border-[#1a1f2e]/60 pt-2">
          {statusMessage}
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 bg-[#0b0e17] border-r border-[#1a1f2e] flex flex-col">
          <div className="p-3 border-b border-[#1a1f2e] flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Market Watch</span>
            <button
              type="button"
              title="Add symbol to watchlist"
              onClick={() => {
                setAddWatchDraft(null);
                setShowAddWatchlist(true);
              }}
              className="p-1 hover:bg-[#1a1f2e] rounded text-slate-500 hover:text-[#d4af37]"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {paperState.watchlist.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500">
                Watchlist empty. Use + above to add symbols.
              </div>
            )}
            {paperState.watchlist.map((item) => (
              <div
                key={watchlistKey(item)}
                onClick={() => setSelectedSymbol(item)}
                className={`p-3 border-b border-[#1a1f2e]/50 cursor-pointer hover:bg-[#121520] transition-colors ${currentSymbol?.symbol === item.symbol ? 'bg-[#121520] border-l-2 border-l-[#d4af37]' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-white">{item.symbol}</div>
                    <div className="text-[10px] text-slate-500 truncate">{item.name}</div>
                    <div className="text-[9px] text-slate-600">{item.exchange}{item.isFno ? ' · F&O' : ''}</div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1 shrink-0">
                    <button
                      type="button"
                      title="Remove from watchlist"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(watchlistKey(item));
                      }}
                      className="p-0.5 text-slate-600 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="font-mono text-sm font-bold text-slate-200">₹{item.price.toFixed(2)}</div>
                    <div className={`text-[10px] font-bold flex items-center justify-end gap-1 ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {item.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(item.changePercent).toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button onClick={(e) => { e.stopPropagation(); openOrderModal(item, 'SELL'); }} className="py-1 bg-red-500/10 text-red-400 text-[10px] font-bold rounded border border-red-500/20 hover:bg-red-500/20">SELL</button>
                  <button onClick={(e) => { e.stopPropagation(); openOrderModal(item, 'BUY'); }} className="py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20 hover:bg-emerald-500/20">BUY</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#080a12]">
          <div className="p-4 border-b border-[#1a1f2e] flex flex-wrap items-center justify-between gap-3 bg-[#0b0e17]">
            <div className="flex flex-wrap items-center gap-4 flex-1 min-w-0">
              <div className="min-w-[220px] max-w-[320px]">
                <JournalSymbolPicker
                  selectedSymbol={pickerSymbol}
                  onSelect={(sel) => {
                    const item = journalToMarketItem(sel);
                    setPickerSymbol(sel.symbol);
                    setSelectedSymbol(item);
                  }}
                />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
                  {currentSymbol?.symbol ?? 'Select Instrument'}
                  <span className="text-xs font-normal text-slate-500 bg-[#1a1f2e] px-2 py-0.5 rounded">{currentSymbol?.exchange ?? currentSymbol?.type ?? 'MARKET'}</span>
                  {currentSymbol?.isFno && <span className="text-[10px] text-blue-300">F&O lot {currentSymbol.lotSize}</span>}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl font-mono font-bold text-white">₹{currentPriceForSelection.toFixed(2)}</span>
                  {currentSymbol && (
                    <span className={`text-sm font-bold flex items-center gap-1 ${currentSymbol.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {currentSymbol.change >= 0 ? '+' : ''}{currentSymbol.change.toFixed(2)} ({currentSymbol.changePercent.toFixed(2)}%)
                    </span>
                  )}
                </div>
              </div>
              <div className="h-10 w-px bg-[#1a1f2e] mx-2" />
              <div className="grid grid-cols-3 gap-6 text-xs">
                <div>
                  <span className="text-slate-500 block">Open</span>
                  <span className="font-mono text-slate-300">₹{(currentSymbol?.open ?? currentPriceForSelection).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">High</span>
                  <span className="font-mono text-slate-300">₹{(currentSymbol?.high ?? currentPriceForSelection).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Low</span>
                  <span className="font-mono text-slate-300">₹{(currentSymbol?.low ?? currentPriceForSelection).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => currentSymbol && openOrderModal(currentSymbol, 'BUY')} className="px-6 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg font-bold hover:bg-emerald-500/20 transition-colors flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4" /> BUY
              </button>
              <button onClick={() => currentSymbol && openOrderModal(currentSymbol, 'SELL')} className="px-6 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg font-bold hover:bg-red-500/20 transition-colors flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4" /> SELL
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-[#1a1f2e] bg-[#0b0e17]">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
              <div className="bg-[#101420] rounded-xl p-3 border border-[#1a1f2e]">
                <div className="text-[10px] uppercase text-slate-500">Portfolio Value</div>
                <div className="mt-2 text-lg font-bold text-white">₹{netEquity.toLocaleString()}</div>
              </div>
              <div className="bg-[#101420] rounded-xl p-3 border border-[#1a1f2e]">
                <div className="text-[10px] uppercase text-slate-500">Open Positions</div>
                <div className="mt-2 text-lg font-bold text-white">{positionsWithLive.length}</div>
              </div>
              <div className="bg-[#101420] rounded-xl p-3 border border-[#1a1f2e]">
                <div className="text-[10px] uppercase text-slate-500">Pending Orders</div>
                <div className="mt-2 text-lg font-bold text-white">{pendingOrders}</div>
              </div>
              <div className="bg-[#101420] rounded-xl p-3 border border-[#1a1f2e]">
                <div className="text-[10px] uppercase text-slate-500">Win Rate</div>
                <div className="mt-2 text-lg font-bold text-white">{closedTrades.length ? `${Math.round((winningTrades / closedTrades.length) * 100)}%` : '0%'}</div>
              </div>
              <div className="bg-[#101420] rounded-xl p-3 border border-[#1a1f2e]">
                <div className="text-[10px] uppercase text-slate-500">Brokerage & charges</div>
                <div className="mt-2 text-lg font-bold text-orange-300">₹{paperState.totalCharges.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 sm:p-4 min-h-0">
            <div className="flex gap-1 sm:gap-3 border-b border-[#1a1f2e] mb-3 sm:mb-4 overflow-x-auto scrollbar-thin -mx-1 px-1">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'positions', label: 'Positions', icon: Briefcase },
                { id: 'orders', label: 'Orders', icon: List },
                { id: 'strategies', label: 'Strategies', badge: openGroups.length, icon: Layers },
                { id: 'history', label: 'History', icon: Clock },
                { id: 'analytics', label: 'Analytics', icon: TrendingUp },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as PaperTab)}
                  className={`shrink-0 pb-2.5 px-2 sm:px-0 text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-[#d4af37] text-[#d4af37]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                  <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {tab.label}
                  {'badge' in tab && (tab.badge ?? 0) > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#d4af37]/20 text-[#d4af37]">{tab.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">Live position summary</h3>
                    <Bell className="w-4 h-4 text-[#d4af37]" />
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Open positions</span><span className="font-bold text-white">{positionsWithLive.length}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Active profit</span><span className={`font-bold ${openPositionStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>₹{openPositionStats.totalPnl.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Winning / losing</span><span className="font-bold text-white">{openPositionStats.winning} / {openPositionStats.losing}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Current value</span><span className="font-bold text-white">₹{openPositionsValue.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Range</span><span className="font-bold text-white">{highLowRange}</span></div>
                  </div>
                </div>

                <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">Strategy & execution controls</h3>
                  </div>
                  <div className="space-y-3 text-sm">
                    <label className="block text-[10px] uppercase text-slate-500">Default strategy</label>
                    <input
                      value={paperState.strategy}
                      onChange={(event) => setPaperState((prev) => ({ ...prev, strategy: event.target.value }))}
                      className="w-full bg-[#121520] border border-[#1a1f2e] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                    />
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-[#121520] rounded-lg p-3">
                        <div className="text-slate-500">Trade count</div>
                        <div className="mt-1 font-bold text-white">{paperState.history.length}</div>
                      </div>
                      <div className="bg-[#121520] rounded-lg p-3">
                        <div className="text-slate-500">Closed trades</div>
                        <div className="mt-1 font-bold text-white">{closedTrades.length}</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">Tip: Limit, Target, SL orders stay in the book until LTP matches — margin is blocked until fill or cancel.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'strategies' && (
              <div className="space-y-4">
                {openGroups.length === 0 ? (
                  <div className="py-12 text-center text-slate-600 text-sm border border-[#1a1f2e] rounded-xl">
                    No open multi-leg strategies.
                  </div>
                ) : (
                  openGroups.map((group) => {
                    const pnl = groupUnrealizedPnl(group, quoteMap);
                    return (
                      <div key={group.id} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div>
                            <h4 className="font-bold text-white">{group.name}</h4>
                            <p className="text-xs text-slate-500">{group.underlying} · {group.legs.length} legs · {new Date(group.openedAt).toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => squareOffGroup(group.id)}
                              className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-xs font-bold"
                            >
                              Close All Legs
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {group.legs.map((leg) => (
                            <div key={leg.id} className="bg-[#121520] rounded-lg p-2 text-xs border border-[#1a1f2e]">
                              <span className={`font-bold ${leg.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>{leg.action}</span>
                              {' '}{leg.displayName}
                              <div className="text-slate-500 mt-1">Qty {leg.quantity} @ ₹{leg.avgPrice}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'positions' && (
              <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#121520] text-slate-500 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-4 text-left">Symbol</th>
                      <th className="py-3 px-4 text-left">Type</th>
                      <th className="py-3 px-4 text-left">Strategy</th>
                      <th className="py-3 px-4 text-left">Direction</th>
                      <th className="py-3 px-4 text-right">Qty</th>
                      <th className="py-3 px-4 text-right">Avg. Price</th>
                      <th className="py-3 px-4 text-right">Live Price</th>
                      <th className="py-3 px-4 text-right">P&L</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionsWithLive.length === 0 ? (
                      <tr><td colSpan={9} className="py-12 text-center text-slate-600">No open positions. Trade Cash, Futures, or Options from the watchlist.</td></tr>
                    ) : (
                      positionsWithLive.map((position) => (
                        <tr key={position.id} className="border-b border-[#1a1f2e]/40 hover:bg-[#121520]">
                          <td className="py-3 px-4 font-bold text-white text-xs">{position.symbol}</td>
                          <td className="py-3 px-4 text-slate-400 text-xs">
                            {position.segment ?? position.instrumentType ?? 'EQUITY'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-xs">{position.notes ?? '—'}</td>
                          <td className="py-3 px-4"><span className={`text-[10px] px-1.5 py-0.5 rounded ${position.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{position.side}</span></td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300">{position.quantity}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-400">₹{position.avgPrice.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-200">₹{position.currentPrice.toFixed(2)}</td>
                          <td className={`py-3 px-4 text-right font-bold font-mono ${position.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{position.pnl >= 0 ? '+' : ''}₹{position.pnl.toFixed(2)}</td>
                          <td className="py-3 px-4 text-center">
                            <button onClick={() => squareOff(position.id)} className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-xs font-bold hover:bg-red-500/20 transition-colors">Close</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'orders' && (
              <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#121520] text-slate-500 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-4 text-left">Time</th>
                      <th className="py-3 px-4 text-left">Instrument</th>
                      <th className="py-3 px-4 text-left">Direction</th>
                      <th className="py-3 px-4 text-right">Qty</th>
                      <th className="py-3 px-4 text-right">Type</th>
                      <th className="py-3 px-4 text-right">Price / Trigger</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paperState.orders.length === 0 ? (
                      <tr><td colSpan={8} className="py-12 text-center text-slate-600">No orders yet. Your placed orders will appear here.</td></tr>
                    ) : (
                      paperState.orders.map((order) => (
                        <tr key={order.id} className="border-b border-[#1a1f2e]/40 hover:bg-[#121520]">
                          <td className="py-3 px-4 text-slate-500 text-xs font-mono">{new Date(order.createdAt).toLocaleTimeString()}</td>
                          <td className="py-3 px-4 font-bold text-white">{order.name}</td>
                          <td className="py-3 px-4"><span className={`text-[10px] px-1.5 py-0.5 rounded ${order.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{order.side}</span></td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300">{order.quantity}</td>
                          <td className="py-3 px-4 text-right text-slate-200">{orderTypeLabel(order.orderType)}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300 text-xs">
                            <div>₹{order.price.toFixed(2)}</div>
                            {order.triggerPrice != null && (
                              <div className="text-slate-500">Trig ₹{order.triggerPrice.toFixed(2)}</div>
                            )}
                            {order.fillPrice != null && order.status === 'COMPLETE' && (
                              <div className="text-emerald-400/80">Fill ₹{order.fillPrice.toFixed(2)}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${order.status === 'COMPLETE' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : order.status === 'PENDING' ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' : 'text-slate-400 bg-slate-500/10 border-slate-500/20'}`}>{order.status}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {order.status === 'PENDING' && (
                              <button onClick={() => cancelOrder(order.id)} className="px-2 py-1 bg-slate-800 text-slate-200 rounded text-xs">Cancel</button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#121520] text-slate-500 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-4 text-left">Symbol</th>
                      <th className="py-3 px-4 text-left">Side</th>
                      <th className="py-3 px-4 text-right">Entry</th>
                      <th className="py-3 px-4 text-right">Exit</th>
                      <th className="py-3 px-4 text-right">P&L</th>
                      <th className="py-3 px-4 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paperState.history.length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center text-slate-600">No trade history yet. Start trading and your record will appear here.</td></tr>
                    ) : (
                      paperState.history.map((trade) => (
                        <tr key={trade.id} className="border-b border-[#1a1f2e]/40 hover:bg-[#121520]">
                          <td className="py-3 px-4 font-bold text-white">{trade.symbol}</td>
                          <td className="py-3 px-4"><span className={`text-[10px] px-1.5 py-0.5 rounded ${trade.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{trade.side}</span></td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300">₹{trade.entryPrice.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300">{trade.exitPrice ? `₹${trade.exitPrice.toFixed(2)}` : 'Open'}</td>
                          <td className={`py-3 px-4 text-right font-bold font-mono ${trade.pnl && trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{trade.pnl ? `${trade.pnl >= 0 ? '+' : ''}₹${trade.pnl.toFixed(2)}` : 'Pending'}</td>
                          <td className="py-3 px-4 text-slate-300">{trade.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
                  <h3 className="text-sm font-bold text-white mb-4">Trade analytics</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Total closed trades</span><span className="font-bold text-white">{closedTrades.length}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Winning trades</span><span className="font-bold text-emerald-400">{winningTrades}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Average win/loss</span><span className="font-bold text-white">₹{averageWin.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Current open risk</span><span className="font-bold text-red-400">₹{Math.max(0, -openPositionStats.totalPnl).toFixed(2)}</span></div>
                  </div>
                </div>
                <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
                  <h3 className="text-sm font-bold text-white mb-4">Execution tips</h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li>• Market — instant fill at live price.</li>
                    <li>• Limit — pending until LTP crosses your limit (margin blocked).</li>
                    <li>• Target — take-profit limit (SELL when LTP ≥ target).</li>
                    <li>• SL / SL-M — stop trigger, then limit or market fill; auto-executes on price refresh.</li>
                    <li>• Brokerage scales with turnover (min ₹20/order) + STT, exchange & GST on each fill.</li>
                    <li>• The simulator saves your state per user and restores it on refresh.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAddWatchlist && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0b0e17] border border-[#1a1f2e] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#d4af37]" />
                  Add symbol
                </h3>
                <button type="button" onClick={() => setShowAddWatchlist(false)} className="text-slate-500 hover:text-white">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-500">Search NSE, BSE, Indices, or F&O — then add.</p>
              <JournalSymbolPicker
                selectedSymbol={addWatchDraft?.symbol ?? ''}
                onSelect={(sel) => setAddWatchDraft(sel)}
              />
              {addWatchDraft && (
                <div className="text-xs text-slate-400 bg-[#121520] rounded-lg px-3 py-2 border border-[#1a1f2e]">
                  {addWatchDraft.symbol} · {addWatchDraft.exchange} · ₹{addWatchDraft.price.toLocaleString('en-IN')}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddWatchlist(false)}
                  className="flex-1 py-2.5 rounded-lg border border-[#1a1f2e] text-slate-400 font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmAddWatchlist}
                  disabled={!addWatchDraft}
                  className="flex-1 py-2.5 rounded-lg bg-[#d4af37] text-[#0a0f1a] font-bold text-sm disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {pendingStrategy && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0b0e17] border border-[#d4af37]/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-[#1a1f2e] bg-[#d4af37]/10">
                <h3 className="text-lg font-bold text-[#d4af37] flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Import strategy
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {pendingStrategy.strategyName} · {pendingStrategy.symbol} · {pendingStrategy.legs.length} legs
                </p>
              </div>
              <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
                {pendingStrategy.legs.map((leg, i) => (
                  <div key={i} className="flex justify-between text-sm bg-[#121520] rounded-lg px-3 py-2 border border-[#1a1f2e]">
                    <span>
                      <span className={leg.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{leg.action}</span>{' '}
                      {leg.strike}
                      {leg.type} × {leg.qty}
                    </span>
                    <span className="font-mono text-slate-300">@ ₹{leg.premium}</span>
                  </div>
                ))}
                <p className="text-xs text-slate-500">Spot when built: ₹{pendingStrategy.spotPrice.toLocaleString('en-IN')}</p>
              </div>
              <div className="p-6 pt-0 flex gap-2">
                <button
                  type="button"
                  onClick={dismissPendingStrategy}
                  className="flex-1 py-2.5 rounded-lg border border-[#1a1f2e] text-slate-400 font-bold text-sm hover:bg-[#121520]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPendingStrategy}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600"
                >
                  Execute All Legs
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showResetCapital && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0b0e17] border border-orange-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-[#1a1f2e] bg-orange-500/10">
                <h3 className="text-lg font-bold text-orange-300 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5" />
                  Reset paper capital?
                </h3>
              </div>
              <div className="p-6 space-y-3 text-sm text-slate-400">
                <p>
                  Balance & available margin will reset to{' '}
                  <b className="text-white">₹{INITIAL_CAPITAL.toLocaleString('en-IN')}</b>.
                </p>
                <ul className="text-xs space-y-1 list-disc list-inside text-slate-500">
                  <li>All open positions will be removed</li>
                  <li>Pending orders & multi-leg strategies cleared</li>
                  <li>Trade history cleared</li>
                  <li>Watchlist is kept</li>
                </ul>
              </div>
              <div className="p-6 pt-0 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetCapital(false)}
                  className="flex-1 py-2.5 rounded-lg border border-[#1a1f2e] text-slate-400 font-bold text-sm hover:bg-[#121520]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmResetCapital}
                  className="flex-1 py-2.5 rounded-lg bg-orange-500 text-white font-bold text-sm hover:bg-orange-600"
                >
                  Reset to ₹10L
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showOrderModal && currentSymbol && (
          <PaperOrderModal
            open={showOrderModal}
            symbol={currentSymbol}
            side={orderSide}
            spot={currentPriceForSelection}
            available={paperState.available}
            draft={orderDraft}
            onDraftChange={setOrderDraft}
            onClose={() => setShowOrderModal(false)}
            onSubmit={addOrder}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
