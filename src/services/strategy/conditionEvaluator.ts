/**
 * Evaluate strategy conditions against a RadarResult (post-scan filter).
 * Soft matching — unknown types fail closed.
 */
import type { RadarResult } from '../radar/radarTypes';
import type { StrategyCondition, StrategyDefinition } from './strategyTypes';
import { formatCondition } from './strategyDisplay';

export type MatchReport = {
  ok: boolean;
  matched: string[];
  missed: string[];
};

function setupTypeHay(r: RadarResult): string {
  return [r.setupType, ...r.confirmations, r.structure, r.liquidity, r.volume, r.momentum]
    .join(' ')
    .toLowerCase();
}

export function evaluateCondition(c: StrategyCondition, r: RadarResult): boolean {
  const hay = setupTypeHay(r);
  const dir = (c.direction || 'ANY').toUpperCase();
  const bullOk = dir === 'ANY' || dir === 'BULLISH';
  const bearOk = dir === 'ANY' || dir === 'BEARISH';

  switch (c.type) {
    case 'LIQUIDITY_SWEEP':
      return /liquidity sweep|sweep/.test(hay) && (bullOk || bearOk);
    case 'EQUAL_HIGHS':
      return /equal high/.test(hay);
    case 'EQUAL_LOWS':
      return /equal low/.test(hay);
    case 'STRUCTURE_SHIFT':
      return /structure shift|structure/.test(hay) && (r.direction !== 'bearish' || bearOk) && (r.direction !== 'bullish' || bullOk);
    case 'BOS':
      return /bos|break of structure|breakout|breakdown/.test(hay);
    case 'HH':
    case 'HL':
      return r.direction === 'bullish' || /higher/.test(hay);
    case 'LH':
    case 'LL':
      return r.direction === 'bearish' || /lower/.test(hay);
    case 'BREAKOUT':
      return r.setupType === 'Breakout' || /breakout/.test(hay);
    case 'BREAKDOWN':
      return r.setupType === 'Breakdown' || /breakdown/.test(hay);
    case 'VOLUME_EXPANSION':
      return /volume expansion|expanding|unusual/.test(hay) || r.setupType === 'Volume Expansion';
    case 'VOLUME_CONTRACTION':
      return /contract/.test(hay);
    case 'RELATIVE_VOLUME': {
      // Soft: volume expansion presence approximates RVOL gate until engine exposes ratio on result
      const need = c.value ?? 1.5;
      return need <= 1.2 ? true : /volume expansion|expanding|unusual|relative/.test(hay);
    }
    case 'HTF_TREND':
      if (dir === 'BULLISH') return r.htfAlignment && r.direction !== 'bearish';
      if (dir === 'BEARISH') return r.htfAlignment && r.direction !== 'bullish';
      return r.htfAlignment;
    case 'TREND_CONTINUATION':
      return r.setupType === 'Trend Continuation' || /continuation|trend/.test(hay);
    case 'REVERSAL':
      return /reversal|sweep|structure shift/.test(hay);
    case 'EMA_ALIGNMENT':
      return r.htfAlignment || /ema|trend/.test(hay);
    case 'EMA_CROSS': {
      // Soft until engine exposes EMA50/200 on RadarResult — align with trend bias
      if (c.operator === '<' || dir === 'BEARISH') return r.direction === 'bearish' || /ema|trend|death/.test(hay);
      if (c.operator === '>' || dir === 'BULLISH') return r.direction === 'bullish' || /ema|trend|golden/.test(hay);
      return /ema|trend/.test(hay);
    }
    case 'PRICE_ABOVE_EMA':
      return r.direction === 'bullish' || bullOk;
    case 'PRICE_BELOW_EMA':
      return r.direction === 'bearish' || bearOk;
    case 'RSI_ABOVE':
    case 'RSI_BELOW':
      // Soft until RSI is exposed on RadarResult — require momentum text, never invent a pass
      return /rsi|momentum/.test(hay);
    default:
      return false;
  }
}

export function evaluateStrategy(strategy: StrategyDefinition, r: RadarResult): MatchReport {
  const matched: string[] = [];
  const missed: string[] = [];
  for (const c of strategy.conditions) {
    const label = formatCondition(c);
    if (evaluateCondition(c, r)) matched.push(label);
    else missed.push(label);
  }
  return {
    ok: missed.length === 0 && matched.length > 0,
    matched,
    missed,
  };
}

export function filterResultsByStrategy(
  strategy: StrategyDefinition,
  results: RadarResult[],
): Array<RadarResult & { matchedConditions: string[] }> {
  return results
    .map((r) => {
      const report = evaluateStrategy(strategy, r);
      return report.ok ? { ...r, matchedConditions: report.matched } : null;
    })
    .filter(Boolean) as Array<RadarResult & { matchedConditions: string[] }>;
}
