import { useState } from 'react';
import { Brackets, Hash, Layers, Maximize2, Minimize2, Plus, TrendingUp } from 'lucide-react';
import {
  CATEGORY_LABELS,
  CHARTINK_FIELD_CATALOG,
  createDefaultChartinkGroup,
  createDefaultChartinkRule,
  FIELD_BY_CATEGORY,
  type FieldCategory,
} from '../../services/chartinkScreenerEngine';
import type { FilterField, FilterGroup, FilterRule } from '../../types/screener';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FieldCategory[];

interface ChartinkElementToolbarProps {
  groups: FilterGroup[];
  onGroupsChange: (groups: FilterGroup[]) => void;
}

function addRuleToFirstGroup(groups: FilterGroup[], rule: FilterRule): FilterGroup[] {
  if (!groups.length) {
    return [{ ...createDefaultChartinkGroup('group-1', 'Main'), rules: [rule], children: [] }];
  }
  return groups.map((g, i) => (i === 0 ? { ...g, rules: [...g.rules, rule] } : g));
}

function addSubGroup(groups: FilterGroup[]): FilterGroup[] {
  if (!groups.length) return [createDefaultChartinkGroup('group-1', 'Main')];
  return groups.map((g, i) =>
    i === 0
      ? {
          ...g,
          children: [
            ...g.children,
            createDefaultChartinkGroup(`sub-${Date.now()}`, `Sub-group ${g.children.length + 1}`),
          ],
        }
      : g,
  );
}

export default function ChartinkElementToolbar({ groups, onGroupsChange }: ChartinkElementToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'stock' | 'indicator' | null>(null);

  const addFieldRule = (field: FilterField) => {
    const def = CHARTINK_FIELD_CATALOG.find((f) => f.value === field);
    const rule = createDefaultChartinkRule(`rule-${Date.now()}`);
    rule.field = field;
    if (def?.type === 'string') {
      rule.compareTarget = 'number';
      rule.operator = 'contains';
      rule.value = '';
    } else if (def?.type === 'boolean') {
      rule.compareTarget = 'number';
      rule.operator = '=';
      rule.value = true;
    }
    onGroupsChange(addRuleToFirstGroup(groups, rule));
    setOpenMenu(null);
  };

  const addNumberRule = () => {
    const rule = createDefaultChartinkRule(`rule-${Date.now()}`);
    rule.field = 'close';
    rule.compareTarget = 'number';
    rule.operator = '>';
    rule.value = 0;
    onGroupsChange(addRuleToFirstGroup(groups, rule));
  };

  const addMaxRule = () => {
    const rule = createDefaultChartinkRule(`rule-${Date.now()}`);
    rule.ruleType = 'max';
    rule.period = 20;
    rule.field = 'close';
    rule.operator = '>';
    rule.compareTarget = 'number';
    onGroupsChange(addRuleToFirstGroup(groups, rule));
  };

  const addMinRule = () => {
    const rule = createDefaultChartinkRule(`rule-${Date.now()}`);
    rule.ruleType = 'min';
    rule.period = 20;
    rule.field = 'close';
    rule.operator = '<';
    rule.compareTarget = 'number';
    onGroupsChange(addRuleToFirstGroup(groups, rule));
  };

  return (
    <div className="ci-element-toolbar">
      <span className="ci-element-toolbar-label">Add</span>

      <div className="ci-element-menu-wrap">
        <button type="button" className="ci-element-btn" onClick={() => setOpenMenu(openMenu === 'stock' ? null : 'stock')}>
          <Plus className="h-3 w-3" /> Stock attribute
        </button>
        {openMenu === 'stock' && (
          <div className="ci-element-dropdown">
            {(['close', 'open', 'high', 'low', 'volume', 'changePercent', 'vwap'] as FilterField[]).map((f) => {
              const label = CHARTINK_FIELD_CATALOG.find((x) => x.value === f)?.label ?? f;
              return (
                <button key={f} type="button" className="ci-element-dropdown-item" onClick={() => addFieldRule(f)}>
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="ci-element-menu-wrap">
        <button type="button" className="ci-element-btn" onClick={() => setOpenMenu(openMenu === 'indicator' ? null : 'indicator')}>
          <TrendingUp className="h-3 w-3" /> Indicator
        </button>
        {openMenu === 'indicator' && (
          <div className="ci-element-dropdown ci-element-dropdown--wide">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="ci-element-dropdown-section">
                <p className="ci-element-dropdown-heading">{CATEGORY_LABELS[cat]}</p>
                <div className="ci-element-dropdown-grid">
                  {(FIELD_BY_CATEGORY[cat] ?? []).slice(0, 8).map((f) => (
                    <button key={f.value} type="button" className="ci-element-dropdown-item" onClick={() => addFieldRule(f.value)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="ci-element-btn" onClick={addNumberRule}>
        <Hash className="h-3 w-3" /> Number
      </button>
      <button type="button" className="ci-element-btn" onClick={() => onGroupsChange(addSubGroup(groups))}>
        <Layers className="h-3 w-3" /> Sub-filter
      </button>
      <button type="button" className="ci-element-btn" onClick={addMaxRule}>
        <Maximize2 className="h-3 w-3" /> Max
      </button>
      <button type="button" className="ci-element-btn" onClick={addMinRule}>
        <Minimize2 className="h-3 w-3" /> Min
      </button>
      <button
        type="button"
        className="ci-element-btn"
        onClick={() => {
          const rule = createDefaultChartinkRule(`rule-${Date.now()}`);
          rule.field = 'close';
          rule.operator = '>';
          rule.compareTarget = 'number';
          rule.bracketInner = true;
          onGroupsChange(addRuleToFirstGroup(groups, rule));
        }}
      >
        <Brackets className="h-3 w-3" /> Bracket
      </button>
    </div>
  );
}
