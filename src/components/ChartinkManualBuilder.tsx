import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import ChartinkElementToolbar from './chartink/ChartinkElementToolbar';
import {
  CATEGORY_LABELS,
  CHARTINK_FIELD_CATALOG,
  CHARTINK_SCAN_PRESETS,
  createDefaultChartinkGroup,
  createDefaultChartinkRule,
  FIELD_BY_CATEGORY,
  TIME_FRAMES,
  TIME_OFFSETS,
  type FieldCategory,
} from '../services/chartinkScreenerEngine';
import { copyFormulaToClipboard, groupsToFormula } from '../services/screenerFormula';
import type { FilterField, FilterGroup, FilterRule, Operator } from '../types/screener';

const FIELD_CATEGORIES = Object.keys(CATEGORY_LABELS) as FieldCategory[];

function fieldDef(field: FilterField) {
  return CHARTINK_FIELD_CATALOG.find((f) => f.value === field);
}

function operatorsForField(field: FilterField): Operator[] {
  const def = fieldDef(field);
  if (!def) return ['>', '<', '='];
  if (def.type === 'string') return ['=', '!=', 'contains', 'not contains'];
  if (def.type === 'boolean') return ['='];
  return ['>', '<', '=', '!=', 'between', 'crosses_above', 'crosses_below'];
}

interface ChartinkManualBuilderProps {
  groups: FilterGroup[];
  onGroupsChange: (groups: FilterGroup[]) => void;
  onPresetApply?: (label: string) => void;
  topLevelLogic?: 'AND' | 'OR';
  onTopLevelLogicChange?: (logic: 'AND' | 'OR') => void;
}

function updateGroupInTree(groups: FilterGroup[], groupId: string, patch: Partial<FilterGroup>): FilterGroup[] {
  return groups.map((g) => {
    if (g.id === groupId) return { ...g, ...patch };
    if (g.children.length) return { ...g, children: updateGroupInTree(g.children, groupId, patch) };
    return g;
  });
}

function updateRuleInTree(groups: FilterGroup[], groupId: string, ruleId: string, patch: Partial<FilterRule>): FilterGroup[] {
  return groups.map((g) => {
    if (g.id === groupId) {
      return { ...g, rules: g.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) };
    }
    if (g.children.length) return { ...g, children: updateRuleInTree(g.children, groupId, ruleId, patch) };
    return g;
  });
}

function removeRuleFromTree(groups: FilterGroup[], groupId: string, ruleId: string): FilterGroup[] {
  return groups.map((g) => {
    if (g.id === groupId) return { ...g, rules: g.rules.filter((r) => r.id !== ruleId) };
    if (g.children.length) return { ...g, children: removeRuleFromTree(g.children, groupId, ruleId) };
    return g;
  });
}

function removeGroupFromTree(groups: FilterGroup[], groupId: string): FilterGroup[] {
  return groups
    .filter((g) => g.id !== groupId)
    .map((g) => ({ ...g, children: removeGroupFromTree(g.children, groupId) }));
}

function addRuleToGroup(groups: FilterGroup[], groupId: string, rule: FilterRule): FilterGroup[] {
  return groups.map((g) => {
    if (g.id === groupId) return { ...g, rules: [...g.rules, rule] };
    if (g.children.length) return { ...g, children: addRuleToGroup(g.children, groupId, rule) };
    return g;
  });
}

function addChildGroup(groups: FilterGroup[], parentId: string, child: FilterGroup): FilterGroup[] {
  return groups.map((g) => {
    if (g.id === parentId) return { ...g, children: [...g.children, child] };
    if (g.children.length) return { ...g, children: addChildGroup(g.children, parentId, child) };
    return g;
  });
}

function FieldSelect({
  value,
  category,
  onChange,
  className = 'ci-select',
}: {
  value: FilterField;
  category: FieldCategory | 'all';
  onChange: (f: FilterField) => void;
  className?: string;
}) {
  const options = category === 'all' ? CHARTINK_FIELD_CATALOG : FIELD_BY_CATEGORY[category] ?? CHARTINK_FIELD_CATALOG;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as FilterField)} className={className}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/** Chartink-style single-line condition row */
function RuleRow({
  rule,
  ruleIndex,
  fieldCategory,
  onUpdate,
  onRemove,
}: {
  rule: FilterRule;
  ruleIndex: number;
  fieldCategory: FieldCategory | 'all';
  onUpdate: (patch: Partial<FilterRule>) => void;
  onRemove: () => void;
}) {
  const def = fieldDef(rule.field);
  const rt = rule.ruleType ?? 'simple';
  const isMinMax = rt === 'min' || rt === 'max';
  const isCount = rt === 'count' || rt === 'countstreak';
  const isCross = rule.operator === 'crosses_above' || rule.operator === 'crosses_below';
  const compareField = rule.compareTarget === 'field' || isCross;
  const allowedOps = isMinMax || isCount ? (['>', '<', '='] as Operator[]) : operatorsForField(rule.field);

  return (
    <div className="ci-rule-row">
      {ruleIndex > 0 && (
        <select
          value={rule.logic}
          onChange={(e) => onUpdate({ logic: e.target.value as 'AND' | 'OR' })}
          className="ci-select ci-select--sm"
          style={{ width: '3.5rem' }}
        >
          <option value="AND">and</option>
          <option value="OR">or</option>
        </select>
      )}

      <select
        value={rt}
        onChange={(e) => {
          const v = e.target.value as FilterRule['ruleType'];
          if (v === 'max' || v === 'min') {
            onUpdate({ ruleType: v, period: 20, field: 'close', operator: v === 'max' ? '>' : '<', compareTarget: 'number' });
          } else if (v === 'count' || v === 'countstreak') {
            onUpdate({ ruleType: v, period: 5, operator: '>', value: 3, compareTarget: 'number' });
          } else {
            onUpdate({ ruleType: 'simple', compareTarget: 'field', compareField: 'sma20' });
          }
        }}
        className="ci-select ci-select--sm"
      >
        <option value="simple">Where</option>
        <option value="max">Max</option>
        <option value="min">Min</option>
        <option value="count">Count</option>
      </select>

      {!isMinMax && !isCount && (
        <>
          <select
            value={rule.timeframe ?? '1D'}
            onChange={(e) => onUpdate({ timeframe: e.target.value as FilterRule['timeframe'] })}
            className="ci-select ci-select--sm"
          >
            {TIME_FRAMES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={rule.offset ?? 'latest'}
            onChange={(e) => onUpdate({ offset: e.target.value as FilterRule['offset'] })}
            className="ci-select ci-select--sm"
          >
            {TIME_OFFSETS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </>
      )}

      <FieldSelect value={rule.field} category={fieldCategory} onChange={(f) => onUpdate({ field: f })} className="ci-select" />

      <select
        value={rule.operator}
        onChange={(e) => {
          const op = e.target.value as Operator;
          onUpdate({
            operator: op,
            ...(op === 'crosses_above' || op === 'crosses_below'
              ? { compareTarget: 'field' as const, compareField: rule.compareField ?? 'sma20' }
              : {}),
          });
        }}
        className="ci-select ci-select--sm"
      >
        {allowedOps.map((op) => (
          <option key={op} value={op}>{op.replace('_', ' ')}</option>
        ))}
      </select>

      {(isMinMax || isCount) && (
        <input
          type="number"
          value={rule.period ?? 20}
          onChange={(e) => onUpdate({ period: Number(e.target.value) })}
          className="ci-select"
          style={{ width: '3.5rem' }}
          title="Period"
        />
      )}

      {!isMinMax && !isCount && (
        <>
          {!isCross && (
            <select
              value={rule.compareTarget ?? 'number'}
              onChange={(e) =>
                onUpdate({
                  compareTarget: e.target.value as 'number' | 'field',
                  compareField: e.target.value === 'field' ? rule.compareField ?? 'sma20' : undefined,
                })
              }
              className="ci-select ci-select--sm"
            >
              <option value="number">#</option>
              <option value="field">field</option>
            </select>
          )}
          {compareField ? (
            <FieldSelect
              value={rule.compareField ?? 'sma20'}
              category="all"
              onChange={(f) => onUpdate({ compareField: f })}
              className="ci-select"
            />
          ) : def?.type === 'boolean' ? (
            <select
              value={String(rule.value)}
              onChange={(e) => onUpdate({ value: e.target.value === 'true' })}
              className="ci-select ci-select--sm"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : def?.type === 'string' ? (
            <input
              value={String(rule.value)}
              onChange={(e) => onUpdate({ value: e.target.value })}
              className="ci-select"
              placeholder="value"
            />
          ) : (
            <input
              type="number"
              value={typeof rule.value === 'number' ? rule.value : 0}
              onChange={(e) => onUpdate({ value: Number(e.target.value) })}
              className="ci-select"
              style={{ width: '4rem' }}
            />
          )}
        </>
      )}

      <button type="button" onClick={onRemove} className="ci-btn-ghost" style={{ padding: '0.25rem' }} aria-label="Remove">
        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
      </button>
    </div>
  );
}

function GroupBlock({
  group,
  groupIndex,
  depth,
  fieldCategory,
  onUpdateGroup,
  onRemoveGroup,
  onAddRule,
  onAddSubGroup,
  onUpdateRule,
  onRemoveRule,
}: {
  group: FilterGroup;
  groupIndex: number;
  depth: number;
  fieldCategory: FieldCategory | 'all';
  onUpdateGroup: (patch: Partial<FilterGroup>) => void;
  onRemoveGroup: () => void;
  onAddRule: () => void;
  onAddSubGroup: () => void;
  onUpdateRule: (ruleId: string, patch: Partial<FilterRule>) => void;
  onRemoveRule: (ruleId: string) => void;
}) {
  return (
    <div className={depth > 0 ? 'ml-3 border-l-2 border-gold/20 pl-2 mt-2' : 'mb-3'}>
      <div className="ci-group-header">
        <span className="text-[10px] uppercase tracking-wider text-dark-muted">Group</span>
        <input
          value={group.name}
          onChange={(e) => onUpdateGroup({ name: e.target.value })}
          className="ci-select flex-1 min-w-0"
        />
        <select
          value={group.logic}
          onChange={(e) => onUpdateGroup({ logic: e.target.value as 'AND' | 'OR' })}
          className="ci-select ci-select--sm"
          title="Passes All / Any"
        >
          <option value="AND">Passes All</option>
          <option value="OR">Passes Any</option>
        </select>
        <button type="button" onClick={onAddRule} className="ci-link">+ condition</button>
        <button type="button" onClick={onAddSubGroup} className="ci-link">+ sub-group</button>
        {(depth > 0 || groupIndex > 0) && (
          <button type="button" onClick={onRemoveGroup} className="ci-link text-rose-400">remove</button>
        )}
      </div>

      <div className="ci-conditions-box">
        {group.rules.map((rule, ruleIndex) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            ruleIndex={ruleIndex}
            fieldCategory={fieldCategory}
            onUpdate={(patch) => onUpdateRule(rule.id, patch)}
            onRemove={() => onRemoveRule(rule.id)}
          />
        ))}
        {!group.rules.length && (
          <p className="px-3 py-4 text-xs text-dark-muted text-center">No conditions — click + condition</p>
        )}
      </div>

      {group.children.map((child, childIdx) => (
        <GroupBlock
          key={child.id}
          group={child}
          groupIndex={childIdx}
          depth={depth + 1}
          fieldCategory={fieldCategory}
          onUpdateGroup={(patch) => onUpdateGroup({ children: group.children.map((c) => (c.id === child.id ? { ...c, ...patch } : c)) })}
          onRemoveGroup={() => onUpdateGroup({ children: group.children.filter((c) => c.id !== child.id) })}
          onAddRule={() =>
            onUpdateGroup({
              children: group.children.map((c) =>
                c.id === child.id ? { ...c, rules: [...c.rules, createDefaultChartinkRule(`r-${Date.now()}`)] } : c,
              ),
            })
          }
          onAddSubGroup={() => {
            const sub = createDefaultChartinkGroup(`sg-${Date.now()}`, `Sub ${child.children.length + 1}`);
            onUpdateGroup({
              children: group.children.map((c) => (c.id === child.id ? { ...c, children: [...c.children, sub] } : c)),
            });
          }}
          onUpdateRule={(ruleId, patch) =>
            onUpdateGroup({
              children: group.children.map((c) =>
                c.id === child.id ? { ...c, rules: c.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) } : c,
              ),
            })
          }
          onRemoveRule={(ruleId) =>
            onUpdateGroup({
              children: group.children.map((c) =>
                c.id === child.id ? { ...c, rules: c.rules.filter((r) => r.id !== ruleId) } : c,
              ),
            })
          }
        />
      ))}
    </div>
  );
}

export default function ChartinkManualBuilder({
  groups,
  onGroupsChange,
  onPresetApply,
  topLevelLogic = 'AND',
  onTopLevelLogicChange,
}: ChartinkManualBuilderProps) {
  const [fieldCategory, setFieldCategory] = useState<FieldCategory | 'all'>('all');

  const addTopGroup = () => onGroupsChange([...groups, createDefaultChartinkGroup(`group-${Date.now()}`, `Group ${groups.length + 1}`)]);

  const applyChartinkPreset = (preset: (typeof CHARTINK_SCAN_PRESETS)[number]) => {
    onGroupsChange(preset.groups.map((g) => ({ ...g, rules: g.rules.map((r) => ({ ...r })), children: [] })));
    onPresetApply?.(preset.label);
  };

  return (
    <div className="ci-conditions-wrap">
      <ChartinkElementToolbar groups={groups} onGroupsChange={onGroupsChange} />

      <div className="flex flex-wrap items-center gap-2 py-2 border-b border-dark-border">
        <button type="button" onClick={addTopGroup} className="ci-link">+ Add group</button>
        {onTopLevelLogicChange && (
          <select
            value={topLevelLogic}
            onChange={(e) => onTopLevelLogicChange(e.target.value as 'AND' | 'OR')}
            className="ci-select ci-select--sm ml-auto"
          >
            <option value="AND">All groups (AND)</option>
            <option value="OR">Any group (OR)</option>
          </select>
        )}
      </div>

      <div className="ci-presets border-b border-dark-border">
        {[{ id: 'all' as const, label: 'All' }, ...FIELD_CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABELS[c] }))].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFieldCategory(tab.id)}
            className={`ci-pill ${fieldCategory === tab.id ? 'ci-pill--active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="ci-presets">
        {CHARTINK_SCAN_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyChartinkPreset(preset)}
            title={preset.description}
            className="ci-pill"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {groups.map((group, groupIndex) => (
        <GroupBlock
          key={group.id}
          group={group}
          groupIndex={groupIndex}
          depth={0}
          fieldCategory={fieldCategory}
          onUpdateGroup={(patch) => onGroupsChange(updateGroupInTree(groups, group.id, patch))}
          onRemoveGroup={() => onGroupsChange(removeGroupFromTree(groups, group.id))}
          onAddRule={() => onGroupsChange(addRuleToGroup(groups, group.id, createDefaultChartinkRule(`rule-${Date.now()}`)))}
          onAddSubGroup={() => {
            const child = createDefaultChartinkGroup(`sub-${Date.now()}`, `Sub-group ${group.children.length + 1}`);
            onGroupsChange(addChildGroup(groups, group.id, child));
          }}
          onUpdateRule={(ruleId, patch) => onGroupsChange(updateRuleInTree(groups, group.id, ruleId, patch))}
          onRemoveRule={(ruleId) => onGroupsChange(removeRuleFromTree(groups, group.id, ruleId))}
        />
      ))}

      {!groups.length && (
        <button
          type="button"
          onClick={() => onGroupsChange([createDefaultChartinkGroup('group-1', 'Main conditions')])}
          className="w-full py-6 text-sm text-gold border border-dashed border-gold/30 rounded-md hover:bg-gold/5"
        >
          + Start your scan (Chartink style)
        </button>
      )}

    </div>
  );
}

export function ChartinkFormulaBar({ groups, topLevelLogic = 'AND' }: { groups: FilterGroup[]; topLevelLogic?: 'AND' | 'OR' }) {
  const formula = useMemo(() => groupsToFormula(groups, topLevelLogic), [groups, topLevelLogic]);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const formula = copyFormulaToClipboard(groups, topLevelLogic);
    setCopied(Boolean(formula));
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="ci-formula-bar ci-formula-bar--footer">
      <span className="ci-formula-text">{formula || 'Build scan conditions above…'}</span>
      <button type="button" className="ci-btn-ghost shrink-0" onClick={() => void handleCopy()} disabled={!formula}>
        {copied ? 'Copied' : 'Copy formula'}
      </button>
    </div>
  );
}
