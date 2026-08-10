/**
 * Strategy Lab data model — local private strategies (no fake performance metrics).
 */
import type { RadarTimeframe } from '../radar/radarTypes';
import type { ConditionDirection } from './conditionRegistry';

export type TimeframeMode = 'SINGLE' | 'MULTI';

export type CreationMethod = 'MANUAL' | 'AI_ASSISTED' | 'TEMPLATE' | 'LEGACY';

export type StrategyStatus = 'ACTIVE' | 'PAUSED';

export type StrategyCondition = {
  id: string;
  type: string;
  timeframe: RadarTimeframe;
  direction?: ConditionDirection;
  operator?: '>=' | '<=' | '>' | '<' | '==';
  value?: number;
  target?: string;
};

export type LogicNode =
  | StrategyCondition
  | { id: string; operator: 'AND' | 'OR'; conditions: LogicNode[] };

export type MultiTimeframes = {
  context?: RadarTimeframe | null;
  structure?: RadarTimeframe | null;
  setup?: RadarTimeframe | null;
  confirmation?: RadarTimeframe | null;
};

export type StrategyDefinition = {
  id: string;
  name: string;
  description: string;
  creationMethod: CreationMethod;
  status: StrategyStatus;
  timeframeMode: TimeframeMode;
  /** Single TF or primary setup TF */
  timeframe: RadarTimeframe;
  timeframes: MultiTimeframes;
  /** Flat list used by current scanner filter (AND across all) */
  conditions: StrategyCondition[];
  /** Nested logic tree (Phase 5+). Scanner uses AND flatten for now. */
  logic: LogicNode;
  version: number;
  templateId?: string;
  createdAt: number;
  updatedAt: number;
  lastScanAt?: number | null;
};

export type StrategyTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  timeframeMode: TimeframeMode;
  timeframe: RadarTimeframe;
  timeframes: MultiTimeframes;
  conditions: Omit<StrategyCondition, 'id'>[];
};
