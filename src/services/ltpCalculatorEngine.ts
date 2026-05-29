/** LTP Calculator — risk, targets, PnL, signals (pure functions) */

export type TradeDirection = 'BUY' | 'SELL';
export type AssetMode = 'equity' | 'futures' | 'options';
export type TradeSignal = 'BUY' | 'SELL' | 'HOLD';
export type OiBuildupLabel =
  | 'Long Buildup'
  | 'Short Buildup'
  | 'Short Covering'
  | 'Long Unwinding'
  | 'Neutral';

export interface LtpCalcInputs {
  direction: TradeDirection;
  entry: number;
  stopLossPct: number;
  targetPct: number;
  target2Pct: number;
  target3Pct: number;
  riskAmount: number;
  capital: number;
  lotSize: number;
  slippageBps: number;
  partialBookPct1: number;
  partialBookPct2: number;
  partialBookPct3: number;
  trailingEnabled: boolean;
  trailAfterTargetPct: number;
  breakEvenOnTarget1: boolean;
  brokeragePerLeg: number;
}

export interface LtpCalcResult {
  stopLossPrice: number;
  target1Price: number;
  target2Price: number;
  target3Price: number;
  riskReward: number;
  riskRewardT2: number;
  riskRewardT3: number;
  quantity: number;
  lots: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  maxLoss: number;
  maxProfit: number;
  maxProfitT2: number;
  maxProfitT3: number;
  weightedProfit: number;
  marginRequired: number;
  exposure: number;
  netPnlAtTarget: number;
  netPnlAtSl: number;
  effectiveEntry: number;
  slippageCost: number;
  totalCharges: number;
  trailingSlPrice: number;
  breakEvenPrice: number;
}

export interface MarketTechnicals {
  ltp: number;
  vwap: number;
  volume: number;
  prevClose: number;
  changePct: number;
  rsi: number;
  ema9: number;
  ema21: number;
  volumeSpike: boolean;
  oiChange: number;
  iv: number;
}

export interface OptionsInsight {
  premiumMove: number;
  oiChange: number;
  volumeSpike: boolean;
  iv: number;
  delta: number;
  buildup: OiBuildupLabel;
}

export interface SignalResult {
  signal: TradeSignal;
  score: number;
  reasons: string[];
}

const DEFAULT_INPUTS: LtpCalcInputs = {
  direction: 'BUY',
  entry: 0,
  stopLossPct: 1,
  targetPct: 2,
  target2Pct: 3,
  target3Pct: 5,
  riskAmount: 5000,
  capital: 200000,
  lotSize: 1,
  slippageBps: 5,
  partialBookPct1: 40,
  partialBookPct2: 30,
  partialBookPct3: 30,
  trailingEnabled: false,
  trailAfterTargetPct: 1,
  breakEvenOnTarget1: true,
  brokeragePerLeg: 40,
};

export function defaultLtpCalcInputs(entry = 0, lotSize = 1): LtpCalcInputs {
  return { ...DEFAULT_INPUTS, entry, lotSize };
}

function round(n: number, d = 2): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** d) / 10 ** d;
}

function pctDelta(price: number, pct: number): number {
  return (price * pct) / 100;
}

export function targetPrice(entry: number, pct: number, direction: TradeDirection): number {
  if (entry <= 0) return 0;
  return direction === 'BUY'
    ? round(entry + pctDelta(entry, pct))
    : round(entry - pctDelta(entry, pct));
}

export function stopLossPrice(entry: number, pct: number, direction: TradeDirection): number {
  if (entry <= 0) return 0;
  return direction === 'BUY'
    ? round(entry - pctDelta(entry, pct))
    : round(entry + pctDelta(entry, pct));
}

export function riskPerUnit(entry: number, sl: number): number {
  return Math.abs(entry - sl);
}

export function rewardPerUnit(entry: number, target: number, direction: TradeDirection): number {
  return direction === 'BUY' ? target - entry : entry - target;
}

export function riskRewardRatio(entry: number, target: number, sl: number): number {
  const risk = riskPerUnit(entry, sl);
  if (risk <= 0) return 0;
  const reward = Math.abs(target - entry);
  return round(reward / risk, 2);
}

export function positionQuantity(riskAmount: number, entry: number, sl: number, lotSize: number): number {
  const risk = riskPerUnit(entry, sl);
  if (risk <= 0 || riskAmount <= 0) return 0;
  const raw = Math.floor(riskAmount / risk);
  if (lotSize <= 1) return Math.max(1, raw);
  const lots = Math.max(1, Math.floor(raw / lotSize));
  return lots * lotSize;
}

export function pnlAtPrice(
  entry: number,
  exit: number,
  qty: number,
  direction: TradeDirection,
): number {
  if (qty <= 0) return 0;
  const diff = direction === 'BUY' ? exit - entry : entry - exit;
  return round(diff * qty);
}

export function applySlippage(price: number, direction: TradeDirection, bps: number): number {
  const slip = (price * bps) / 10000;
  return direction === 'BUY' ? round(price + slip) : round(price - slip);
}

export function computeLtpCalc(inputs: LtpCalcInputs): LtpCalcResult | null {
  const entry = inputs.entry;
  if (entry <= 0) return null;

  const effectiveEntry = applySlippage(entry, inputs.direction, inputs.slippageBps);
  const sl = stopLossPrice(effectiveEntry, inputs.stopLossPct, inputs.direction);
  const t1 = targetPrice(effectiveEntry, inputs.targetPct, inputs.direction);
  const t2 = targetPrice(effectiveEntry, inputs.target2Pct, inputs.direction);
  const t3 = targetPrice(effectiveEntry, inputs.target3Pct, inputs.direction);

  const risk = riskPerUnit(effectiveEntry, sl);
  let qty = positionQuantity(inputs.riskAmount, effectiveEntry, sl, inputs.lotSize);
  const maxByCapital = Math.floor((inputs.capital * 0.95) / effectiveEntry);
  if (maxByCapital > 0 && qty > maxByCapital) {
    if (inputs.lotSize > 1) {
      qty = Math.max(inputs.lotSize, Math.floor(maxByCapital / inputs.lotSize) * inputs.lotSize);
    } else {
      qty = maxByCapital;
    }
  }

  const lots = inputs.lotSize > 0 ? Math.floor(qty / inputs.lotSize) : qty;
  const rr = riskRewardRatio(effectiveEntry, t1, sl);
  const rr2 = riskRewardRatio(effectiveEntry, t2, sl);
  const rr3 = riskRewardRatio(effectiveEntry, t3, sl);

  const maxLoss = round(risk * qty);
  const maxProfit = pnlAtPrice(effectiveEntry, t1, qty, inputs.direction);
  const maxProfitT2 = pnlAtPrice(effectiveEntry, t2, qty, inputs.direction);
  const maxProfitT3 = pnlAtPrice(effectiveEntry, t3, qty, inputs.direction);

  const p1 = inputs.partialBookPct1 / 100;
  const p2 = inputs.partialBookPct2 / 100;
  const p3 = inputs.partialBookPct3 / 100;
  const q1 = Math.floor(qty * p1);
  const q2 = Math.floor(qty * p2);
  const q3 = Math.max(0, qty - q1 - q2);
  const weightedProfit = round(
    pnlAtPrice(effectiveEntry, t1, q1, inputs.direction) +
      pnlAtPrice(effectiveEntry, t2, q2, inputs.direction) +
      pnlAtPrice(effectiveEntry, t3, q3, inputs.direction),
  );

  const exposure = round(effectiveEntry * qty);
  const marginRequired = round(exposure * 0.2);
  const slippageCost = round(Math.abs(effectiveEntry - entry) * qty);
  const totalCharges = round(inputs.brokeragePerLeg * 2 + slippageCost * 0.001);

  let trailingSlPrice = sl;
  if (inputs.trailingEnabled) {
    const trail = pctDelta(effectiveEntry, inputs.trailAfterTargetPct);
    trailingSlPrice =
      inputs.direction === 'BUY'
        ? round(t1 - trail)
        : round(t1 + trail);
  }
  const breakEvenPrice = inputs.breakEvenOnTarget1 ? effectiveEntry : sl;

  return {
    stopLossPrice: sl,
    target1Price: t1,
    target2Price: t2,
    target3Price: t3,
    riskReward: rr,
    riskRewardT2: rr2,
    riskRewardT3: rr3,
    quantity: qty,
    lots,
    riskPerUnit: round(risk),
    rewardPerUnit: round(rewardPerUnit(effectiveEntry, t1, inputs.direction)),
    maxLoss,
    maxProfit,
    maxProfitT2,
    maxProfitT3,
    weightedProfit,
    marginRequired,
    exposure,
    netPnlAtTarget: round(maxProfit - totalCharges),
    netPnlAtSl: round(-maxLoss - totalCharges),
    effectiveEntry,
    slippageCost,
    totalCharges,
    trailingSlPrice,
    breakEvenPrice,
  };
}

export function scalpingAdjust(
  entry: number,
  delta: number,
  mode: 'points' | 'pct',
  direction: TradeDirection,
  field: 'entry' | 'sl' | 'target',
  current: { slPct: number; targetPct: number },
): { entry: number; slPct: number; targetPct: number } {
  let nextEntry = entry;
  if (field === 'entry') {
    nextEntry = direction === 'BUY' ? entry + delta : entry - delta;
    if (mode === 'pct') {
      nextEntry = direction === 'BUY' ? entry * (1 + delta / 100) : entry * (1 - delta / 100);
    }
    return { entry: round(Math.max(0.05, nextEntry)), slPct: current.slPct, targetPct: current.targetPct };
  }
  const bump = mode === 'pct' ? delta : (entry > 0 ? (delta / entry) * 100 : 0);
  if (field === 'sl') return { entry, slPct: round(current.slPct + bump, 2), targetPct: current.targetPct };
  return { entry, slPct: current.slPct, targetPct: round(current.targetPct + bump, 2) };
}

export function classifyOiBuildup(priceChg: number, oiChg: number): OiBuildupLabel {
  if (Math.abs(oiChg) < 500) return 'Neutral';
  if (oiChg > 0 && priceChg > 0) return 'Long Buildup';
  if (oiChg > 0 && priceChg < 0) return 'Short Buildup';
  if (oiChg < 0 && priceChg > 0) return 'Short Covering';
  if (oiChg < 0 && priceChg < 0) return 'Long Unwinding';
  return 'Neutral';
}

export function buildTechnicals(quote: {
  price: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  prevClose: number;
  vwap?: number;
}): MarketTechnicals {
  const ltp = quote.price;
  const vwap = quote.vwap ?? round((quote.high + quote.low + ltp) / 3);
  const changePct = quote.changePercent;
  const rsi = round(50 + changePct * 2.2, 1);
  const ema9 = round(ltp * (1 + changePct / 900));
  const ema21 = round(ltp * (1 - changePct / 1200));
  const avgVol = Math.max(quote.volume, 1);
  const volumeSpike = quote.volume > avgVol * 1.35;
  return {
    ltp,
    vwap,
    volume: quote.volume,
    prevClose: quote.prevClose,
    changePct,
    rsi: Math.min(99, Math.max(1, rsi)),
    ema9,
    ema21,
    volumeSpike,
    oiChange: 0,
    iv: 18,
  };
}

export function generateTradeSignal(
  tech: MarketTechnicals,
  direction: TradeDirection,
): SignalResult {
  let score = 0;
  const reasons: string[] = [];

  if (tech.ltp > tech.vwap) {
    score += 1;
    reasons.push('Price above VWAP');
  } else {
    score -= 1;
    reasons.push('Price below VWAP');
  }

  if (tech.ema9 > tech.ema21) {
    score += 1;
    reasons.push('EMA9 > EMA21');
  } else {
    score -= 1;
    reasons.push('EMA9 < EMA21');
  }

  if (tech.rsi > 55) {
    score += 1;
    reasons.push(`RSI ${tech.rsi} bullish`);
  } else if (tech.rsi < 45) {
    score -= 1;
    reasons.push(`RSI ${tech.rsi} bearish`);
  }

  if (tech.volumeSpike) {
    score += direction === 'BUY' ? 1 : -1;
    reasons.push('Volume spike');
  }

  if (tech.changePct > 0.25) reasons.push('Positive momentum');
  if (tech.changePct < -0.25) reasons.push('Negative momentum');

  let signal: TradeSignal = 'HOLD';
  if (score >= 2) signal = 'BUY';
  else if (score <= -2) signal = 'SELL';

  return { signal, score, reasons };
}

export function targetZoneProgress(
  entry: number,
  ltp: number,
  sl: number,
  target: number,
  direction: TradeDirection,
): number {
  const range = direction === 'BUY' ? target - sl : sl - target;
  const pos = direction === 'BUY' ? ltp - sl : sl - ltp;
  if (range <= 0) return 0;
  return Math.min(100, Math.max(0, round((pos / range) * 100)));
}

export function exportTradeReport(payload: Record<string, unknown>): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tradex-ltp-plan-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export const SUPPORTED_BROKERS = [
  { id: 'fyers', label: 'TradeX Live', active: true },
  { id: 'zerodha', label: 'Zerodha', active: false },
  { id: 'angel', label: 'Angel One', active: false },
  { id: 'upstox', label: 'Upstox', active: false },
  { id: 'shoonya', label: 'Shoonya', active: false },
] as const;
