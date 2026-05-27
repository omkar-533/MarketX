import type { FilterGroup, FilterRule } from '../types/screener';
import { CHARTINK_FIELD_CATALOG } from './chartinkScreenerEngine';

function fieldLabel(field: string): string {
  return CHARTINK_FIELD_CATALOG.find((f) => f.value === field)?.label ?? field;
}

function ruleToString(rule: FilterRule): string {
  if (rule.ruleType === 'max') {
    return `Max(${rule.period ?? 20}, ${fieldLabel(rule.field)}) ${rule.operator} ${rule.value}`;
  }
  if (rule.ruleType === 'min') {
    return `Min(${rule.period ?? 20}, ${fieldLabel(rule.field)}) ${rule.operator} ${rule.value}`;
  }
  if (rule.ruleType === 'count') {
    return `Count(${rule.period ?? 5}, condition)`;
  }
  if (rule.ruleType === 'greatest' && rule.extraFields?.length) {
    return `Greatest(${[rule.field, ...rule.extraFields].map(fieldLabel).join(', ')}) ${rule.operator} ${rule.value}`;
  }
  if (rule.ruleType === 'least' && rule.extraFields?.length) {
    return `Least(${[rule.field, ...rule.extraFields].map(fieldLabel).join(', ')}) ${rule.operator} ${rule.value}`;
  }

  const tf = rule.timeframe && rule.timeframe !== '1D' ? `[${rule.timeframe}] ` : '';
  const off =
    rule.offset && rule.offset !== 'latest'
      ? ` (${rule.offset === 'prev1' ? '1 candle ago' : rule.offset === 'prev5' ? '5 candles ago' : '20 candles ago'})`
      : '';

  let left = `${fieldLabel(rule.field)}${off}`;
  if (rule.arithmeticOp && rule.arithmeticOp !== 'none' && rule.arithmeticValue != null) {
    const op = { add: '+', subtract: '-', multiply: '*', divide: '/' }[rule.arithmeticOp];
    left = `(${left} ${op} ${rule.arithmeticValue})`;
  }

  if (rule.operator === 'crosses_above' || rule.operator === 'crosses_below') {
    const rhs =
      rule.compareTarget === 'field' && rule.compareField
        ? fieldLabel(rule.compareField)
        : String(rule.value);
    return `${tf}${left} ${rule.operator.replace('_', ' ')} ${rhs}`;
  }

  if (rule.compareTarget === 'field' && rule.compareField) {
    return `${tf}${left} ${rule.operator} ${fieldLabel(rule.compareField)}`;
  }

  if (rule.operator === 'between') {
    return `${tf}${left} between ${rule.value} and ${rule.secondValue ?? '?'}`;
  }

  if (rule.operator === 'contains' || rule.operator === 'not contains') {
    return `${tf}${left} ${rule.operator} "${rule.value}"`;
  }

  return `${tf}${left} ${rule.operator} ${rule.value}`;
}

function groupToString(group: FilterGroup, depth = 0): string {
  const parts: string[] = [];
  group.rules.forEach((rule, idx) => {
    const prefix = idx > 0 ? ` ${rule.logic} ` : '';
    parts.push(`${prefix}${ruleToString(rule)}`);
  });
  group.children.forEach((child, idx) => {
    const glue = group.logic === 'AND' ? ' AND ' : ' OR ';
    const childStr = `(${groupToString(child, depth + 1)})`;
    parts.push(parts.length || idx ? `${glue}${childStr}` : childStr);
  });
  const inner = parts.join('');
  return depth > 0 ? inner : inner || '(empty)';
}

/** Chartink-style readable scan formula */
export function groupsToFormula(groups: FilterGroup[], topLogic: 'AND' | 'OR' = 'AND'): string {
  if (!groups.length) return '';
  return groups.map((g) => groupToString(g)).join(` ${topLogic} `);
}

export function copyFormulaToClipboard(groups: FilterGroup[], topLogic: 'AND' | 'OR' = 'AND'): string {
  const formula = groupsToFormula(groups, topLogic);
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    void navigator.clipboard.writeText(formula);
  }
  return formula;
}
