import { blackScholesPrice } from './optionPricing';
import { findBreakevens, type PayoffPoint } from './optionSimulatorEngine';
import type { FuturesPrediction } from './futuresPredictionService';

export interface PayoffLeg {
  action: 'BUY' | 'SELL';
  type: 'CE' | 'PE';
  strike: number;
  premium: number;
  qty: number;
}

export type PnlOutcome = 'Profit' | 'Loss' | 'Breakeven';
export type ScenarioRowTag = 'spot' | 'futures' | 'maxpain' | 'breakeven' | 'strike' | 'level';

export interface ScenarioRow {
  id: string;
  marketPrice: number;
  pctFromSpot: number;
  expiryPnl: number;
  todayPnl: number;
  expiryOutcome: PnlOutcome;
  todayOutcome: PnlOutcome;
  expiryMessage: string;
  todayMessage: string;
  tag: ScenarioRowTag;
  tagLabel: string;
  isHighlighted: boolean;
}

export interface StrategyPayoffSummary {
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
  netPremium: number;
  currentExpiryPnl: number;
  currentTodayPnl: number;
  probabilityOfProfit: number;
  futuresPrediction: FuturesPrediction | null;
}

function intrinsic(type: 'CE' | 'PE', spot: number, strike: number) {
  return type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
}

export function legExpiryPnl(leg: PayoffLeg, marketPrice: number): number {
  const diff = intrinsic(leg.type, marketPrice, leg.strike) - leg.premium;
  return Math.round((leg.action === 'BUY' ? diff : -diff) * leg.qty);
}

export function legTodayPnl(
  leg: PayoffLeg,
  marketPrice: number,
  daysToExpiry: number,
  iv: number,
  interestRate = 0.065,
): number {
  const mark = blackScholesPrice(marketPrice, leg.strike, daysToExpiry, iv, leg.type, interestRate);
  const diff = mark - leg.premium;
  return Math.round((leg.action === 'BUY' ? diff : -diff) * leg.qty);
}

function pnlOutcome(v: number): PnlOutcome {
  if (Math.abs(v) < 1) return 'Breakeven';
  return v > 0 ? 'Profit' : 'Loss';
}

function outcomeMessage(pnl: number, marketPrice: number, when: 'expiry' | 'today'): string {
  const price = marketPrice.toLocaleString('en-IN');
  const amt = Math.abs(pnl).toLocaleString('en-IN');
  if (Math.abs(pnl) < 1) {
    return when === 'expiry'
      ? `At ${price}, breakeven at expiry`
      : `At ${price}, breakeven today`;
  }
  if (pnl > 0) {
    return when === 'expiry'
      ? `At ${price}, ₹${amt} profit at expiry`
      : `At ${price}, ₹${amt} profit today`;
  }
  return when === 'expiry'
    ? `At ${price}, ₹${amt} loss at expiry`
    : `At ${price}, ₹${amt} loss today`;
}

export function buildPayoffCurveFromLegs(
  legs: PayoffLeg[],
  spot: number,
  interval: number,
  halfSteps = 14,
  mode: 'expiry' | 'today' = 'expiry',
  daysToExpiry = 7,
  iv = 18,
  ivShiftPct = 0,
): PayoffPoint[] {
  const effectiveIv = iv * (1 + ivShiftPct / 100);
  return Array.from({ length: halfSteps * 2 + 1 }, (_, i) => {
    const s = Math.round(spot + (i - halfSteps) * interval);
    const pnl =
      mode === 'expiry'
        ? legs.reduce((sum, leg) => sum + legExpiryPnl(leg, s), 0)
        : legs.reduce((sum, leg) => sum + legTodayPnl(leg, s, daysToExpiry, effectiveIv), 0);
    return { spot: s, pnl, pnlPerLot: pnl };
  });
}

export function buildSensibullScenarioTable(
  legs: PayoffLeg[],
  liveSpot: number,
  interval: number,
  daysToExpiry: number,
  iv: number,
  ivShiftPct: number,
  futures: FuturesPrediction | null,
  maxPain?: number,
): ScenarioRow[] {
  if (!legs.length || liveSpot <= 0) return [];

  const effectiveIv = iv * (1 + ivShiftPct / 100);
  const expiryCurve = buildPayoffCurveFromLegs(legs, liveSpot, interval, 16, 'expiry');
  const breakevenSet = new Set(findBreakevens(expiryCurve));

  const priceSet = new Map<number, ScenarioRowTag>();

  const addPrice = (p: number, tag: ScenarioRowTag) => {
    const rounded = Math.round(p / interval) * interval;
    if (!priceSet.has(rounded) || tag === 'futures' || tag === 'maxpain' || tag === 'spot') {
      priceSet.set(rounded, tag);
    }
  };

  for (let i = -14; i <= 14; i++) {
    addPrice(liveSpot + i * interval, 'level');
  }
  legs.forEach((leg) => {
    addPrice(leg.strike, 'strike');
    addPrice(leg.strike - interval, 'level');
    addPrice(leg.strike + interval, 'level');
  });

  addPrice(liveSpot, 'spot');
  if (futures?.predictedExpiryPrice) addPrice(futures.predictedExpiryPrice, 'futures');
  if (maxPain) addPrice(maxPain, 'maxpain');

  breakevenSet.forEach((be) => addPrice(be, 'breakeven'));

  const tagLabels: Record<ScenarioRowTag, string> = {
    spot: 'LIVE SPOT',
    futures: 'FUTURES PREDICT',
    maxpain: 'MAX PAIN',
    breakeven: 'BREAKEVEN',
    strike: 'LEG STRIKE',
    level: '',
  };

  const rows: ScenarioRow[] = [...priceSet.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([marketPrice, tag]) => {
      const expiryPnl = legs.reduce((s, l) => s + legExpiryPnl(l, marketPrice), 0);
      const todayPnl = legs.reduce((s, l) => s + legTodayPnl(l, marketPrice, daysToExpiry, effectiveIv), 0);
      const expiryOutcome = pnlOutcome(expiryPnl);
      const todayOutcome = pnlOutcome(todayPnl);
      const pctFromSpot = liveSpot > 0 ? ((marketPrice - liveSpot) / liveSpot) * 100 : 0;

      let tagLabel = tagLabels[tag];
      if (tag === 'futures' && futures) {
        tagLabel = `FUTURES → ${futures.bias}`;
      }

      return {
        id: `${tag}-${marketPrice}`,
        marketPrice,
        pctFromSpot: Math.round(pctFromSpot * 100) / 100,
        expiryPnl,
        todayPnl,
        expiryOutcome,
        todayOutcome,
        expiryMessage: outcomeMessage(expiryPnl, marketPrice, 'expiry'),
        todayMessage: outcomeMessage(todayPnl, marketPrice, 'today'),
        tag,
        tagLabel,
        isHighlighted: tag === 'spot' || tag === 'futures',
      };
    });

  return rows;
}

export function analyzeLegStrategy(
  legs: PayoffLeg[],
  spot: number,
  interval: number,
  daysToExpiry: number,
  iv: number,
  ivShiftPct = 0,
  futures: FuturesPrediction | null = null,
): StrategyPayoffSummary {
  const curve = buildPayoffCurveFromLegs(legs, spot, interval, 24, 'expiry');
  const pnls = curve.map((p) => p.pnl);
  const netPremium = legs.reduce(
    (sum, leg) => sum + (leg.action === 'BUY' ? -1 : 1) * leg.premium * leg.qty,
    0,
  );
  const profitable = curve.filter((p) => p.pnl > 0).length;
  const effectiveIv = iv * (1 + ivShiftPct / 100);

  return {
    maxProfit: Math.max(...pnls, 0),
    maxLoss: Math.min(...pnls, 0),
    breakevens: findBreakevens(curve),
    netPremium: Math.round(netPremium),
    currentExpiryPnl: legs.reduce((s, l) => s + legExpiryPnl(l, spot), 0),
    currentTodayPnl: legs.reduce((s, l) => s + legTodayPnl(l, spot, daysToExpiry, effectiveIv), 0),
    probabilityOfProfit: curve.length ? Math.round((profitable / curve.length) * 1000) / 10 : 0,
    futuresPrediction: futures,
  };
}

/** @deprecated use buildSensibullScenarioTable */
export function buildScenarioRows(
  legs: PayoffLeg[],
  spot: number,
  interval: number,
  daysToExpiry: number,
  iv: number,
  ivShiftPct = 0,
): ScenarioRow[] {
  return buildSensibullScenarioTable(legs, spot, interval, daysToExpiry, iv, ivShiftPct, null);
}
