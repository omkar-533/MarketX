/**
 * Client — Teach WOLF parse (structured strategy only).
 */
import { apiFetch } from '../../config/api';
import { openRouterRequestHeaders } from '../openRouterKey';
import type { MultiTimeframes, StrategyCondition, TimeframeMode } from './strategyTypes';
import type { RadarTimeframe } from '../radar/radarTypes';

export type ParseClarity = 'CLEAR' | 'PARTIALLY_CLEAR' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED';

export type ClarificationOption = { id: string; label: string };
export type ClarificationQuestion = {
  id: string;
  prompt: string;
  options: ClarificationOption[];
};

export type ParsedStrategyDraft = {
  name: string;
  description: string;
  timeframeMode: TimeframeMode;
  timeframe: RadarTimeframe;
  timeframes: MultiTimeframes;
  logicOperator?: 'AND' | 'OR';
  conditions: Omit<StrategyCondition, 'id'>[];
  clarity?: ParseClarity;
};

export type StrategyParseResult = {
  ok: boolean;
  clarity: ParseClarity;
  message: string;
  clarifications: ClarificationQuestion[];
  strategy: ParsedStrategyDraft | null;
  source?: string;
  modelUsed?: string;
  errors?: string[];
  warning?: string;
};

export async function parseStrategyFromText(
  description: string,
  answers: Record<string, string> = {},
): Promise<StrategyParseResult> {
  const res = await apiFetch(
    '/api/strategies/parse',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...openRouterRequestHeaders(),
      },
      body: JSON.stringify({ description, answers }),
    },
    { timeoutMs: 45_000, retries: 0 },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err?.error === 'string'
        ? err.error
        : 'Could not reach Strategy Lab parser. Check AI key / API.',
    );
  }

  return (await res.json()) as StrategyParseResult;
}
