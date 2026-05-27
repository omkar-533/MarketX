import { calculateGreeks } from '../data/nseData';
import { estimateOptionPrice } from './optionPricing';
import {
  EXPIRY_DATES,
  STRATEGY_TEMPLATES,
  calculateMaxPain,
  getFiveYearOIData,
  getIvPercentile,
  getOptionChain,
  type OptionData,
  type SimulatorPosition,
} from '../data/marketData';
import {
  getLiveQuote,
  getSymbolMetaFromQuote,
  getFnoLiveQuotes,
} from './symbolLiveService';

export type SymbolKey = string;

export function getSymbolMeta(symbol: string) {
  const quote = getLiveQuote(symbol);
  if (quote) return getSymbolMetaFromQuote(quote);
  getFnoLiveQuotes();
  const q = getLiveQuote(symbol);
  if (q) return getSymbolMetaFromQuote(q);
  return { label: symbol, interval: 50, lotSize: 25, ivBase: 18, type: 'stock' as const, sector: '—' };
}

/** @deprecated use getSymbolMeta(symbol) */
export const SYMBOL_META: Record<string, { label: string; interval: number; lotSize: number; ivBase: number }> = {};

export interface SimLeg extends SimulatorPosition {
  id: string;
}

export interface PayoffPoint {
  spot: number;
  pnl: number;
  pnlPerLot: number;
}

export interface StrategyAnalytics {
  spot: number;
  totalPnl: number;
  netPremium: number;
  breakevens: number[];
  maxProfit: number;
  maxLoss: number;
  payoffCurve: PayoffPoint[];
  portfolioGreeks: { delta: number; gamma: number; theta: number; vega: number; rho: number };
}

function intrinsic(optionType: 'CE' | 'PE', spot: number, strike: number) {
  return optionType === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
}

export function legPnlAtSpot(leg: SimLeg, spot: number, lotMultiplier: number): number {
  const intrinsicValue = intrinsic(leg.type, spot, leg.strike);
  const spread = intrinsicValue - leg.premium;
  const perUnit = leg.action === 'BUY' ? spread : -spread;
  return perUnit * leg.quantity * lotMultiplier;
}

export function buildPayoffCurve(
  legs: SimLeg[],
  spot: number,
  interval: number,
  steps = 41,
  lotMultiplier = 1,
): PayoffPoint[] {
  const half = Math.floor(steps / 2);
  const start = spot - half * interval;
  return Array.from({ length: steps }, (_, i) => {
    const s = start + i * interval;
    const pnl = legs.reduce((sum, leg) => sum + legPnlAtSpot(leg, s, lotMultiplier), 0);
    return { spot: s, pnl, pnlPerLot: lotMultiplier > 0 ? pnl / lotMultiplier : pnl };
  });
}

export function legT0PnlAtSpot(
  leg: SimLeg,
  spot: number,
  daysToExpiry: number,
  iv: number,
  lotMultiplier: number,
): number {
  const mark = estimateOptionPrice(spot, leg.strike, leg.type, daysToExpiry, iv);
  const diff = mark - leg.premium;
  const mult = leg.quantity * lotMultiplier;
  return leg.action === 'BUY' ? diff * mult : -diff * mult;
}

export function buildT0PayoffCurve(
  legs: SimLeg[],
  spot: number,
  interval: number,
  daysToExpiry: number,
  iv: number,
  steps = 41,
  lotMultiplier = 1,
): PayoffPoint[] {
  const half = Math.floor(steps / 2);
  const start = spot - half * interval;
  return Array.from({ length: steps }, (_, i) => {
    const s = start + i * interval;
    const pnl = legs.reduce((sum, leg) => sum + legT0PnlAtSpot(leg, s, daysToExpiry, iv, lotMultiplier), 0);
    return { spot: s, pnl, pnlPerLot: lotMultiplier > 0 ? pnl / lotMultiplier : pnl };
  });
}

export interface OpstraChartPoint {
  spot: number;
  expiry: number;
  t0: number;
  profit: number;
  loss: number;
}

export function buildOpstraChartData(
  legs: SimLeg[],
  spot: number,
  interval: number,
  daysToExpiry: number,
  iv: number,
  lotMultiplier: number,
  steps = 61,
): OpstraChartPoint[] {
  const expiry = buildPayoffCurve(legs, spot, interval, steps, lotMultiplier);
  const t0 = buildT0PayoffCurve(legs, spot, interval, daysToExpiry, iv, steps, lotMultiplier);
  return expiry.map((e, i) => ({
    spot: e.spot,
    expiry: e.pnl,
    t0: t0[i]?.pnl ?? e.pnl,
    profit: e.pnl > 0 ? e.pnl : 0,
    loss: e.pnl < 0 ? e.pnl : 0,
  }));
}

export function getVolatilityBands(spot: number, iv: number, daysToExpiry: number) {
  const move = spot * (iv / 100) * Math.sqrt(Math.max(daysToExpiry, 1) / 365);
  return {
    sd1Low: Math.round(spot - move),
    sd1High: Math.round(spot + move),
    sd2Low: Math.round(spot - move * 2),
    sd2High: Math.round(spot + move * 2),
  };
}

export function findBreakevens(curve: PayoffPoint[]): number[] {
  const points: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].pnl;
    const curr = curve[i].pnl;
    if ((prev <= 0 && curr >= 0) || (prev >= 0 && curr <= 0)) {
      const ratio = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr) || 1);
      points.push(Math.round(curve[i - 1].spot + (curve[i].spot - curve[i - 1].spot) * ratio));
    }
  }
  return [...new Set(points)].sort((a, b) => a - b);
}

export function aggregateGreeks(
  legs: SimLeg[],
  spot: number,
  daysToExpiry: number,
  iv: number,
  lotMultiplier: number,
  interestRate = 0.06,
) {
  return legs.reduce(
    (acc, leg) => {
      const g = calculateGreeks(spot, leg.strike, daysToExpiry, iv, leg.type, interestRate);
      const sign = leg.action === 'BUY' ? 1 : -1;
      const mult = sign * leg.quantity * lotMultiplier;
      return {
        delta: acc.delta + g.delta * mult,
        gamma: acc.gamma + g.gamma * mult,
        theta: acc.theta + g.theta * mult,
        vega: acc.vega + g.vega * mult,
        rho: acc.rho + g.rho * mult,
      };
    },
    { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
  );
}

export function analyzeStrategy(
  legs: SimLeg[],
  spot: number,
  interval: number,
  lotMultiplier: number,
  daysToExpiry: number,
  iv: number,
  interestRate = 0.06,
): StrategyAnalytics {
  const payoffCurve = buildPayoffCurve(legs, spot, interval, 41, lotMultiplier);
  const totalPnl = legs.reduce((sum, leg) => sum + legPnlAtSpot(leg, spot, lotMultiplier), 0);
  const netPremium = legs.reduce(
    (sum, leg) => sum + (leg.action === 'BUY' ? -1 : 1) * leg.premium * leg.quantity * lotMultiplier,
    0,
  );
  const breakevens = findBreakevens(payoffCurve);
  const pnls = payoffCurve.map((p) => p.pnl);
  const maxProfit = Math.max(...pnls);
  const maxLoss = Math.min(...pnls);

  return {
    spot,
    totalPnl,
    netPremium,
    breakevens,
    maxProfit,
    maxLoss,
    payoffCurve,
    portfolioGreeks: aggregateGreeks(legs, spot, daysToExpiry, iv, lotMultiplier, interestRate),
  };
}

export function getMarketSnapshot(symbol: string) {
  const quote = getLiveQuote(symbol);
  const spot = quote?.price ?? 24580;
  const interval = quote?.strikeInterval ?? getSymbolMeta(symbol).interval;
  const atmStrike = Math.round(spot / interval) * interval;
  const chain = getOptionChain(symbol, spot);
  const maxPain = calculateMaxPain(chain);
  const totals = chain.reduce(
    (acc, row) => ({
      ceOi: acc.ceOi + row.ceOi,
      peOi: acc.peOi + row.peOi,
    }),
    { ceOi: 0, peOi: 0 },
  );
  const pcr = totals.peOi / Math.max(totals.ceOi, 1);

  return { spot, atmStrike, chain, maxPain, pcr, quote };
}

export function chainRowToLeg(
  row: OptionData,
  side: 'CE' | 'PE',
  action: 'BUY' | 'SELL',
  symbol: string,
  expiry: string,
  lots = 1,
): SimLeg {
  const premium = side === 'CE' ? row.ceLtp : row.peLtp;
  return createManualLeg({
    symbol,
    type: side,
    action,
    strike: row.strike,
    premium,
    quantity: lots,
    expiry,
  });
}

export function getChainPremium(
  chain: OptionData[],
  strike: number,
  type: 'CE' | 'PE',
): number | null {
  const row = chain.find((r) => r.strike === strike);
  if (!row) return null;
  return type === 'CE' ? row.ceLtp : row.peLtp;
}

export function snapStrike(strike: number, interval: number): number {
  return Math.round(strike / interval) * interval;
}

export interface ManualLegInput {
  symbol: string;
  action: 'BUY' | 'SELL';
  type: 'CE' | 'PE';
  strike: number;
  premium: number;
  quantity: number;
  expiry: string;
}

export function createManualLeg(input: ManualLegInput): SimLeg {
  return {
    id: `leg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    symbol: input.symbol,
    type: input.type,
    action: input.action,
    strike: input.strike,
    premium: Math.max(0, Math.round(input.premium * 100) / 100),
    quantity: Math.max(1, Math.floor(input.quantity)),
    expiry: input.expiry,
  };
}

export function applyStrategyTemplate(
  templateName: string,
  symbol: SymbolKey,
  spot: number,
  lots = 1,
): SimLeg[] {
  const template = STRATEGY_TEMPLATES.find((t) => t.name === templateName);
  if (!template) return [];

  const meta = getSymbolMeta(symbol);
  const interval = meta.interval;
  const atmStrike = Math.round(spot / interval) * interval;
  const chain = getOptionChain(symbol, spot);
  const expiry = EXPIRY_DATES[0];

  return template.legs.map((leg, idx) => {
    const strike = atmStrike + (leg.strikeOffset ?? 0) * interval;
    const row = chain.find((r) => r.strike === strike) ?? chain[Math.floor(chain.length / 2)];
    const premium = leg.type === 'CE' ? row.ceLtp : row.peLtp;
    return {
      id: `tpl-${idx}-${Date.now()}`,
      symbol,
      type: leg.type,
      action: leg.action,
      strike,
      premium,
      quantity: 'qty' in leg && typeof leg.qty === 'number' ? leg.qty : lots,
      expiry,
    };
  });
}

export function getHistoricalSpotSeries(symbol: SymbolKey, days = 90) {
  const data = getFiveYearOIData(symbol).slice(-days);
  return data.map((d) => ({
    date: d.date,
    spot: d.spotPrice,
    pcr: d.pcr,
    maxPain: d.maxPain,
    ceOi: d.totalCE_OI,
    peOi: d.totalPE_OI,
  }));
}

export function getHistoricalIvSeries() {
  return getIvPercentile().historical;
}

export function getIvAnalytics(symbol: SymbolKey) {
  const ivData = getIvPercentile();
  const skew = getOptionChain(symbol).map((row) => ({
    strike: row.strike,
    ceIv: row.ceIv,
    peIv: row.peIv,
    skew: Math.round((row.peIv - row.ceIv) * 100) / 100,
  }));
  return { ...ivData, skew };
}

export { STRATEGY_TEMPLATES, EXPIRY_DATES };
