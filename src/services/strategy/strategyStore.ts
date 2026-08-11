/**
 * Private strategy store — localStorage first (no DB migration).
 * Migrates legacy UserSetup records from wolf_radar_setups_v1 once.
 */
import type { RadarTimeframe, UserSetup, UserSetupCondition } from '../radar/radarTypes';
import { deleteUserSetup, loadUserSetups } from '../radar/radarStore';
import type {
  CreationMethod,
  StrategyCondition,
  StrategyDefinition,
  StrategyStatus,
  StrategyTemplate,
} from './strategyTypes';

const KEY = 'wolf_strategy_lab_v1';
/** Prevents empty lab list from re-importing deleted legacy setups on refresh. */
const MIGRATED_KEY = 'wolf_strategy_lab_migrated_v1';

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readAll(): StrategyDefinition[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StrategyDefinition[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: StrategyDefinition[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    /* ignore */
  }
}

function hasMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Reverse map strat-* id → legacy setup-* ids that may exist. */
function legacyIdsForStrategy(id: string): string[] {
  const out = [id];
  if (id.startsWith('strat-')) {
    const rest = id.slice('strat-'.length);
    out.push(`setup-${rest}`, rest);
  }
  return out;
}

/** Map legacy chip conditions → registry conditions */
function legacyConditionMap(c: UserSetupCondition, tf: RadarTimeframe): StrategyCondition | null {
  const id = uid('cond');
  switch (c) {
    case 'liquidity_sweep':
      return { id, type: 'LIQUIDITY_SWEEP', timeframe: tf, direction: 'ANY' };
    case 'structure_shift':
      return { id, type: 'STRUCTURE_SHIFT', timeframe: tf, direction: 'ANY' };
    case 'volume_expansion':
      return { id, type: 'VOLUME_EXPANSION', timeframe: tf };
    case 'htf_bullish':
      return { id, type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' };
    case 'htf_bearish':
      return { id, type: 'HTF_TREND', timeframe: '1h', direction: 'BEARISH' };
    case 'breakout':
      return { id, type: 'BREAKOUT', timeframe: tf };
    case 'breakdown':
      return { id, type: 'BREAKDOWN', timeframe: tf };
    case 'reversal':
      return { id, type: 'REVERSAL', timeframe: tf, direction: 'ANY' };
    default:
      return null;
  }
}

function migrateLegacy(setup: UserSetup): StrategyDefinition {
  const conditions = setup.conditions
    .map((c) => legacyConditionMap(c, setup.timeframe))
    .filter(Boolean) as StrategyCondition[];
  return {
    id: setup.id.startsWith('setup-') ? setup.id.replace('setup-', 'strat-') : `strat-${setup.id}`,
    name: setup.name,
    description: 'Migrated from legacy My Setups',
    creationMethod: 'LEGACY',
    status: 'ACTIVE',
    timeframeMode: 'SINGLE',
    timeframe: setup.timeframe,
    timeframes: {},
    conditions,
    logic: { id: uid('logic'), operator: 'AND', conditions },
    version: 1,
    createdAt: setup.createdAt,
    updatedAt: setup.createdAt,
    lastScanAt: null,
  };
}

export function loadStrategies(): StrategyDefinition[] {
  let list = readAll();
  if (!list.length) {
    const legacy = loadUserSetups();
    if (legacy.length) {
      list = legacy.map(migrateLegacy);
      writeAll(list);
    }
  }
  return list;
}

export function saveStrategies(list: StrategyDefinition[]) {
  writeAll(list);
}

export function getStrategy(id: string): StrategyDefinition | null {
  return loadStrategies().find((s) => s.id === id) || null;
}

export function upsertStrategy(strategy: StrategyDefinition): StrategyDefinition[] {
  const list = loadStrategies().filter((s) => s.id !== strategy.id);
  list.unshift({ ...strategy, updatedAt: Date.now() });
  writeAll(list);
  return list;
}

export function deleteStrategy(id: string): StrategyDefinition[] {
  const list = loadStrategies().filter((s) => s.id !== id);
  writeAll(list);
  return list;
}

export function duplicateStrategy(id: string): StrategyDefinition[] {
  const src = getStrategy(id);
  if (!src) return loadStrategies();
  const copy: StrategyDefinition = {
    ...src,
    id: uid('strat'),
    name: `${src.name} - Copy`,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastScanAt: null,
  };
  return upsertStrategy(copy);
}

export function setStrategyStatus(id: string, status: StrategyStatus): StrategyDefinition[] {
  const src = getStrategy(id);
  if (!src) return loadStrategies();
  return upsertStrategy({ ...src, status });
}

export function markStrategyScanned(id: string): StrategyDefinition[] {
  const src = getStrategy(id);
  if (!src) return loadStrategies();
  return upsertStrategy({ ...src, lastScanAt: Date.now() });
}

export function createStrategyFromParts(input: {
  name: string;
  description?: string;
  creationMethod: CreationMethod;
  timeframeMode: StrategyDefinition['timeframeMode'];
  timeframe: RadarTimeframe;
  timeframes?: StrategyDefinition['timeframes'];
  conditions: StrategyCondition[];
  templateId?: string;
  status?: StrategyStatus;
}): StrategyDefinition {
  const conditions = input.conditions.map((c) => ({
    ...c,
    id: c.id || uid('cond'),
  }));
  return {
    id: uid('strat'),
    name: input.name.trim() || 'Untitled setup',
    description: input.description?.trim() || '',
    creationMethod: input.creationMethod,
    status: input.status || 'ACTIVE',
    timeframeMode: input.timeframeMode,
    timeframe: input.timeframe,
    timeframes: input.timeframes || {},
    conditions,
    logic: { id: uid('logic'), operator: 'AND', conditions },
    version: 1,
    templateId: input.templateId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastScanAt: null,
  };
}

export function strategyFromTemplate(tpl: StrategyTemplate, nameOverride?: string): StrategyDefinition {
  return createStrategyFromParts({
    name: nameOverride || tpl.name,
    description: tpl.description,
    creationMethod: 'TEMPLATE',
    timeframeMode: tpl.timeframeMode,
    timeframe: tpl.timeframe,
    timeframes: tpl.timeframes,
    conditions: tpl.conditions.map((c) => ({ ...c, id: uid('cond') })),
    templateId: tpl.id,
    status: 'ACTIVE',
  });
}

export function newConditionId() {
  return uid('cond');
}
