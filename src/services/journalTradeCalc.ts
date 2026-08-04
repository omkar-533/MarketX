import { getFnoInstrument } from '../data/fnoUniverse';
import { FOREX_STANDARD_LOT } from './globalInstrumentService';
import type { JournalMarket } from '../types/journal';

export type TradeSide = 'Buy' | 'Sell';
export type TradeType = 'Intraday' | 'Swing' | 'Options' | 'Futures';

export interface JournalCalcInput {
  instrument: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  target: number;
  /** Lots when quantityIsLots, else shares/units */
  quantity: number;
  quantityIsLots?: boolean;
  lotSize?: number;
  side: TradeSide;
  type: TradeType;
  market?: JournalMarket;
}

/** "NIFTY 24600 CE 07AUG" → underlying ticker for lot-size lookup. */
export function journalUnderlyingSymbol(instrument: string): string {
  const raw = String(instrument || '').trim().toUpperCase();
  if (!raw) return '';
  const opt = raw.match(/^([A-Z][A-Z0-9&-]{1,20})\s+(\d+(?:\.\d+)?)\s+(CE|PE)\b/);
  if (opt) return opt[1];
  const fut = raw.match(/^([A-Z][A-Z0-9&-]{1,20})\s+FUT\b/);
  if (fut) return fut[1];
  return raw.split(/\s+/)[0] || raw;
}

export type OptionRight = 'CE' | 'PE';

export function formatOptionContract(
  underlying: string,
  strike: string | number,
  right: OptionRight,
  expiry = '',
): string {
  const u = String(underlying || '').trim().toUpperCase().split(/\s+/)[0];
  const s = String(strike ?? '').trim();
  const exp = String(expiry || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!u || !s) return u;
  return [u, s, right, exp].filter(Boolean).join(' ');
}

export function parseOptionContract(instrument: string): {
  underlying: string;
  strike: string;
  right: OptionRight;
  expiry: string;
} | null {
  const raw = String(instrument || '').trim().toUpperCase();
  const m = raw.match(/^([A-Z][A-Z0-9&-]{1,20})\s+(\d+(?:\.\d+)?)\s+(CE|PE)(?:\s+(.+))?$/);
  if (!m) return null;
  return {
    underlying: m[1],
    strike: m[2],
    right: m[3] as OptionRight,
    expiry: (m[4] || '').trim(),
  };
}

export function getInstrumentLotSize(
  instrument: string,
  market: JournalMarket = 'equity',
  forexStandardLots = false,
): number {
  if (market === 'crypto') return 1;
  if (market === 'forex') return forexStandardLots ? FOREX_STANDARD_LOT : 1;
  const underlying = journalUnderlyingSymbol(instrument);
  const inst = getFnoInstrument(underlying);
  return inst?.lotSize ?? 1;
}

/** NSE-style lot sizing when symbol meta is missing */
export function estimateLotSizeFromPrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 1;
  const targetNotional = 450_000;
  let lot = Math.round(targetNotional / price);
  lot = Math.max(25, Math.min(10000, lot));
  lot = Math.round(lot / 25) * 25;
  return lot || 25;
}

export function resolveQuantityUnits(input: JournalCalcInput): {
  units: number;
  lots: number;
  lotSize: number;
} {
  const lotSize =
    input.lotSize ??
    getInstrumentLotSize(
      input.instrument,
      input.market ?? 'equity',
      input.quantityIsLots && input.market === 'forex',
    );
  const useLots =
    input.quantityIsLots ??
    (input.market !== 'crypto' &&
      input.market !== 'forex' &&
      (input.type === 'Futures' || input.type === 'Options'));
  const lots = useLots ? input.quantity : input.quantity / lotSize;
  const units = useLots ? input.quantity * lotSize : input.quantity;
  return { units, lots, lotSize };
}

function calculateBrokerage(
  type: TradeType,
  entry: number,
  exit: number,
  units: number,
  lots: number,
): number {
  const turnover = (entry + exit) * units;
  if (type === 'Options') {
    return Number((Math.max(40, lots * 40) + turnover * 0.0005).toFixed(2));
  }
  if (type === 'Futures') {
    return Number((40 + turnover * 0.00002).toFixed(2));
  }
  return Number(Math.max(40, turnover * 0.0003).toFixed(2));
}

export function calculateJournalTradeMetrics(input: JournalCalcInput) {
  const { units, lots, lotSize } = resolveQuantityUnits(input);

  const pnl =
    input.side === 'Buy'
      ? (input.exitPrice - input.entryPrice) * units
      : (input.entryPrice - input.exitPrice) * units;

  const risk =
    input.side === 'Buy'
      ? Math.abs(input.entryPrice - input.stopLoss)
      : Math.abs(input.stopLoss - input.entryPrice);
  const reward =
    input.side === 'Buy'
      ? Math.abs(input.target - input.entryPrice)
      : Math.abs(input.entryPrice - input.target);

  const rr = risk > 0 ? Number((reward / risk).toFixed(2)) : 0;
  const invested = input.entryPrice * units;
  const roi = invested > 0 ? Number(((pnl / invested) * 100).toFixed(2)) : 0;

  const brokerage = calculateBrokerage(
    input.type,
    input.entryPrice,
    input.exitPrice,
    units,
    lots,
  );

  const netPnl = Number((pnl - brokerage).toFixed(2));
  const grossPnl = Number(pnl.toFixed(2));

  return {
    pnl: grossPnl,
    netPnl,
    rr,
    brokerage,
    roi,
    positionSize: units,
    lots: Number(lots.toFixed(4)),
    lotSize,
    notional: Number(invested.toFixed(2)),
  };
}

export function defaultStopsFromPrice(
  price: number,
  side: TradeSide,
  isIndex: boolean,
): { stopLoss: number; target: number } {
  const slPct = isIndex ? 0.005 : 0.02;
  const tgtPct = isIndex ? 0.008 : 0.025;
  if (side === 'Buy') {
    return {
      stopLoss: Math.round(price * (1 - slPct) * 100) / 100,
      target: Math.round(price * (1 + tgtPct) * 100) / 100,
    };
  }
  return {
    stopLoss: Math.round(price * (1 + slPct) * 100) / 100,
    target: Math.round(price * (1 - tgtPct) * 100) / 100,
  };
}
