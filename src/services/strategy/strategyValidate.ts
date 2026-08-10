/**
 * Strategy validation — no contradictory HTF trends, known condition IDs only.
 */
import { isKnownConditionId } from './conditionRegistry';
import type { StrategyCondition, StrategyDefinition } from './strategyTypes';

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateConditions(conditions: StrategyCondition[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!conditions.length) errors.push('Add at least one condition.');

  for (const c of conditions) {
    if (!isKnownConditionId(c.type)) {
      errors.push(`Unsupported condition: ${c.type}`);
    }
    if (c.type === 'RELATIVE_VOLUME' || c.type === 'RSI_ABOVE' || c.type === 'RSI_BELOW' || c.type === 'EMA_CROSS') {
      if (c.value == null || !Number.isFinite(c.value)) {
        errors.push(`${c.type} needs a numeric value.`);
      }
    }
    if (c.type === 'EMA_CROSS' && !c.operator) {
      errors.push('EMA_CROSS needs an operator (< or >).');
    }
  }

  const htfBull = conditions.some((c) => c.type === 'HTF_TREND' && c.direction === 'BULLISH');
  const htfBear = conditions.some((c) => c.type === 'HTF_TREND' && c.direction === 'BEARISH');
  if (htfBull && htfBear) errors.push('Conflicting HTF trend conditions (bullish and bearish).');

  const hasBreakout = conditions.some((c) => c.type === 'BREAKOUT');
  const hasBreakdown = conditions.some((c) => c.type === 'BREAKDOWN');
  if (hasBreakout && hasBreakdown) {
    warnings.push('Breakout and Breakdown both selected — may rarely match together.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateStrategyDraft(
  draft: Pick<StrategyDefinition, 'name' | 'conditions' | 'timeframe' | 'timeframeMode'>,
): ValidationResult {
  const base = validateConditions(draft.conditions);
  if (!draft.name.trim()) base.errors.push('Setup name is required.');
  if (!draft.timeframe) base.errors.push('Timeframe is required.');
  return { ok: base.errors.length === 0, errors: base.errors, warnings: base.warnings };
}
