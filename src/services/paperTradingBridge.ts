import { EXPIRY_DATES } from '../data/marketData';
import { getJournalSymbolSelection } from './equitySymbolService';
import type { PaperLeg, PaperStrategyGroup } from './paperTradingEngine';
import { getSymbolMeta } from './optionSimulatorEngine';

const PENDING_KEY = 'tradeflow_pending_paper_strategy';

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
