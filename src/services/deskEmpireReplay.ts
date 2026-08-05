/**
 * Desk Empire — OHLC replay scenario, liquidity hints, virtual PnL.
 */

import { fetchMarketOhlc } from './marketApiService';
import type { DetectiveCard } from './mentorDrills';

export type EmpireBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EmpireSide = 'up' | 'down';

export type EmpireScenario = {
  id: string;
  symbol: string;
  interval: string;
  /** Bars shown during warmup → freeze (inclusive end = decision bar) */
  visible: EmpireBar[];
  /** Bars revealed after the call */
  future: EmpireBar[];
  entry: number;
  hints: string[];
  ask: string;
  /** Soft lean for teach line — not shown as “correct answer” before call */
  lean: EmpireSide | 'balanced';
  levels: { price: number; label: string; tone: 'bull' | 'bear' | 'neutral' }[];
};

export type EmpireResolve = {
  exit: number;
  movePct: number;
  pnl: number;
  won: boolean;
  teach: string;
};

const FALLBACK_SYMBOLS = ['NSE:NIFTY', 'NSE:BANKNIFTY', 'NSE:RELIANCE', 'NSE:TCS'];

/** Synthetic path if API fails — still playable. */
function synthBars(count = 80, seed = Date.now()): EmpireBar[] {
  const bars: EmpireBar[] = [];
  let px = 22000 + (seed % 500);
  const t0 = Math.floor(seed / 1000) - count * 300;
  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 7) * 18 + (Math.random() - 0.48) * 40;
    const open = px;
    const close = px + drift;
    const high = Math.max(open, close) + Math.random() * 25;
    const low = Math.min(open, close) - Math.random() * 25;
    bars.push({
      time: t0 + i * 300,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 5000,
    });
    px = close;
  }
  return bars;
}

function sliceScenario(bars: EmpireBar[], symbol: string, interval: string, detective: DetectiveCard | null): EmpireScenario {
  const need = 50;
  const src = bars.length >= need ? bars : synthBars(need);
  const maxStart = Math.max(0, src.length - 36);
  const start = Math.floor(Math.random() * (maxStart + 1));
  const decisionIdx = Math.min(src.length - 13, start + 22);
  const visible = src.slice(start, decisionIdx + 1);
  const future = src.slice(decisionIdx + 1, decisionIdx + 1 + 12);
  const entry = visible[visible.length - 1]?.close || 0;

  const hi = Math.max(...visible.slice(-20).map((b) => b.high));
  const lo = Math.min(...visible.slice(-20).map((b) => b.low));
  const mid = (hi + lo) / 2;
  const zone = detective?.zone || (entry >= mid ? 'premium' : 'discount');
  const liq = detective?.liquidity || (entry >= mid ? 'sell-side above' : 'buy-side below');

  const hints: string[] = [];
  if (zone === 'premium') hints.push('Price in premium vs recent range');
  else if (zone === 'discount') hints.push('Price in discount vs recent range');
  else hints.push('Price near equilibrium of recent range');

  if (/sell|bsl|above/i.test(liq)) hints.push('Sell-side liquidity / stops likely above highs');
  else if (/buy|ssl|below/i.test(liq)) hints.push('Buy-side liquidity / stops likely below lows');
  else hints.push(`Liquidity read: ${liq}`);

  const last = visible[visible.length - 1];
  const prev = visible[visible.length - 2];
  if (last && prev) {
    if (last.high > prev.high && last.close < last.open) hints.push('Upper wick rejection near highs');
    else if (last.low < prev.low && last.close > last.open) hints.push('Lower wick rejection near lows');
    else hints.push('Watch acceptance vs rejection on next candles');
  }

  let lean: EmpireScenario['lean'] = 'balanced';
  if (zone === 'premium' && /sell|reject|above/i.test(hints.join(' '))) lean = 'down';
  else if (zone === 'discount' && /buy|below|lower wick/i.test(hints.join(' '))) lean = 'up';
  else if (detective?.trend) {
    if (/bull|up/i.test(detective.trend)) lean = 'up';
    else if (/bear|down/i.test(detective.trend)) lean = 'down';
  }

  return {
    id: `sc-${symbol}-${decisionIdx}-${Date.now()}`,
    symbol,
    interval,
    visible,
    future: future.length ? future : synthBars(12, entry),
    entry,
    hints: hints.slice(0, 3),
    ask: 'Liquidity / structure ke hisaab se agla move — UP ya DOWN?',
    lean,
    levels: [
      { price: hi, label: 'Range high / liq magnet', tone: 'bear' },
      { price: mid, label: 'EQ', tone: 'neutral' },
      { price: lo, label: 'Range low / liq magnet', tone: 'bull' },
      { price: entry, label: 'Decision · LTP', tone: 'neutral' },
    ],
  };
}

export async function loadEmpireScenario(
  detective: DetectiveCard | null,
): Promise<EmpireScenario> {
  const symbol = detective?.symbol || FALLBACK_SYMBOLS[Math.floor(Math.random() * FALLBACK_SYMBOLS.length)];
  const interval = detective?.interval || '5';
  const tf = /m$/i.test(interval) ? interval : `${interval}m`;
  try {
    const res = await fetchMarketOhlc(symbol, tf, '5d');
    if (res?.bars?.length && res.bars.length >= 40) {
      return sliceScenario(res.bars, symbol, tf, detective);
    }
  } catch {
    /* fall through */
  }
  return sliceScenario(synthBars(90), symbol, tf, detective);
}

/** Stake is virtual notional; PnL ≈ notional * move% * 8 leverage feel (capped). */
export function resolveEmpireCall(
  scenario: EmpireScenario,
  side: EmpireSide,
  stake: number,
): EmpireResolve {
  const future = scenario.future;
  const entry = scenario.entry;
  const exitBar = future[future.length - 1] || future[0];
  const exit = exitBar?.close ?? entry;
  const movePct = entry > 0 ? (exit - entry) / entry : 0;
  const dir = side === 'up' ? 1 : -1;
  const signed = movePct * dir;
  const leveraged = signed * 8;
  const capped = Math.max(-0.35, Math.min(0.45, leveraged));
  const pnl = Math.round(stake * capped);
  const won = pnl > 0;

  let teach: string;
  if (Math.abs(movePct) < 0.0008) {
    teach = 'Tape stayed tight — small move. Process > force.';
  } else if (won) {
    teach =
      side === 'up'
        ? `Price accepted higher (+${(movePct * 100).toFixed(2)}%). Your UP call matched follow-through.`
        : `Price offered lower (${(movePct * 100).toFixed(2)}%). Your DOWN call matched the tape.`;
  } else {
    teach =
      scenario.lean !== 'balanced' && scenario.lean !== side
        ? `Tape went the other way. Hint lean was ${scenario.lean === 'up' ? 'UP' : 'DOWN'} — review liquidity location.`
        : `Move went against the call (${(movePct * 100).toFixed(2)}%). Location + confirmation still matter.`;
  }

  return { exit, movePct, pnl, won, teach };
}
