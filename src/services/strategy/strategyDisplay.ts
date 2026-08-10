/**
 * Human-readable condition / strategy preview builders.
 */
import { getConditionDef } from './conditionRegistry';
import type { LogicNode, StrategyCondition, StrategyDefinition } from './strategyTypes';

export function formatCondition(c: StrategyCondition): string {
  const def = getConditionDef(c.type);
  const name = def?.name || c.type;
  const tf = c.timeframe.toUpperCase();
  const dir =
    c.direction && c.direction !== 'ANY' ? ` ${c.direction.charAt(0)}${c.direction.slice(1).toLowerCase()}` : '';
  if (c.value != null && c.operator) {
    return `${tf} ${name}${dir} ${c.operator} ${c.value}${c.type === 'RELATIVE_VOLUME' ? 'x' : ''}`;
  }
  return `${tf} ${name}${dir}`;
}

export function formatLogicPreview(node: LogicNode, depth = 0): string[] {
  if ('type' in node && !('operator' in node && 'conditions' in node)) {
    return [formatCondition(node as StrategyCondition)];
  }
  const group = node as { operator: 'AND' | 'OR'; conditions: LogicNode[] };
  const lines: string[] = [];
  group.conditions.forEach((child, i) => {
    const childLines = formatLogicPreview(child, depth + 1);
    childLines.forEach((line, j) => {
      if (j === 0 && i > 0) lines.push(group.operator);
      lines.push(line);
    });
  });
  return lines;
}

export function formatStrategyPreview(s: StrategyDefinition): string[] {
  if (s.conditions.length) {
    return s.conditions.flatMap((c, i) => (i === 0 ? [formatCondition(c)] : ['AND', formatCondition(c)]));
  }
  return formatLogicPreview(s.logic);
}

export function formatTimeframeStack(s: StrategyDefinition): string {
  if (s.timeframeMode === 'SINGLE') return s.timeframe.toUpperCase();
  const parts = [
    s.timeframes.context,
    s.timeframes.structure,
    s.timeframes.setup || s.timeframe,
    s.timeframes.confirmation,
  ].filter(Boolean) as string[];
  return parts.map((p) => p.toUpperCase()).join(' → ') || s.timeframe.toUpperCase();
}
