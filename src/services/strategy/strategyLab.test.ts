/**
 * Strategy Lab unit tests — validation, display, templates, evaluator soft-matching.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STRATEGY_TEMPLATES } from './strategyTemplates';
import { createStrategyFromParts, strategyFromTemplate } from './strategyStore';
import { formatCondition, formatStrategyPreview, formatTimeframeStack } from './strategyDisplay';
import { validateConditions, validateStrategyDraft } from './strategyValidate';
import { isKnownConditionId } from './conditionRegistry';
import { evaluateCondition, evaluateStrategy } from './conditionEvaluator';
import type { RadarResult } from '../radar/radarTypes';

function stubResult(partial: Partial<RadarResult> = {}): RadarResult {
  return {
    id: 'r1',
    symbol: 'RELIANCE',
    exchange: 'NSE',
    price: 2500,
    timeframe: '5m',
    setupType: 'Liquidity Sweep',
    direction: 'bullish',
    score: 90,
    scoreBreakdown: {
      structure: 20,
      liquidity: 20,
      volume: 15,
      momentum: 15,
      htfAlignment: 10,
      volatility: 5,
      setupQuality: 5,
    },
    status: 'SETUP DEVELOPING',
    confirmations: ['Liquidity Sweep', 'Volume Expansion'],
    structure: 'Bullish structure shift',
    liquidity: 'Previous low liquidity sweep',
    volume: 'Volume expansion',
    momentum: 'Momentum building',
    htfAlignment: true,
    keyLevels: [],
    invalidation: 'Below sweep low',
    explanation: 'test',
    detectedAt: Date.now(),
    dataMode: 'DEMO',
    ...partial,
  };
}

describe('condition registry', () => {
  it('knows core condition ids', () => {
    assert.equal(isKnownConditionId('LIQUIDITY_SWEEP'), true);
    assert.equal(isKnownConditionId('FAKE_ORDER_FLOW'), false);
  });
});

describe('validation', () => {
  it('rejects empty conditions and conflicting HTF', () => {
    assert.equal(validateConditions([]).ok, false);
    const conflict = validateConditions([
      { id: 'a', type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' },
      { id: 'b', type: 'HTF_TREND', timeframe: '1h', direction: 'BEARISH' },
    ]);
    assert.equal(conflict.ok, false);
    assert.match(conflict.errors.join(' '), /Conflicting/);
  });

  it('requires name on draft', () => {
    const r = validateStrategyDraft({
      name: '  ',
      timeframe: '5m',
      timeframeMode: 'SINGLE',
      conditions: [{ id: 'c', type: 'BREAKOUT', timeframe: '5m' }],
    });
    assert.equal(r.ok, false);
  });
});

describe('templates & store helpers', () => {
  it('builds strategies from templates with AND preview', () => {
    const tpl = STRATEGY_TEMPLATES.find((t) => t.id === 'tpl-liquidity-reversal');
    assert.ok(tpl);
    const s = strategyFromTemplate(tpl!);
    assert.equal(s.creationMethod, 'TEMPLATE');
    assert.equal(s.conditions.length, 4);
    assert.match(formatTimeframeStack(s), /1H/);
    assert.match(formatStrategyPreview(s)[0], /15M/);
  });

  it('createStrategyFromParts keeps user name', () => {
    const s = createStrategyFromParts({
      name: 'My Hunt',
      creationMethod: 'MANUAL',
      timeframeMode: 'SINGLE',
      timeframe: '15m',
      conditions: [{ id: 'c', type: 'LIQUIDITY_SWEEP', timeframe: '15m', direction: 'BULLISH' }],
    });
    assert.equal(s.name, 'My Hunt');
    assert.match(formatCondition(s.conditions[0]), /Liquidity Sweep/);
  });
});

describe('condition evaluator', () => {
  it('matches liquidity + structure soft signals', () => {
    const r = stubResult();
    assert.equal(
      evaluateCondition(
        { id: '1', type: 'LIQUIDITY_SWEEP', timeframe: '15m', direction: 'BULLISH' },
        r,
      ),
      true,
    );
    const report = evaluateStrategy(
      createStrategyFromParts({
        name: 'LR',
        creationMethod: 'MANUAL',
        timeframeMode: 'MULTI',
        timeframe: '5m',
        conditions: [
          { id: '1', type: 'LIQUIDITY_SWEEP', timeframe: '15m', direction: 'BULLISH' },
          { id: '2', type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'BULLISH' },
        ],
      }),
      r,
    );
    assert.equal(report.ok, true);
    assert.equal(report.matched.length, 2);
  });

  it('fails closed on unknown types', () => {
    assert.equal(
      evaluateCondition({ id: 'x', type: 'SMART_MONEY_FLOW', timeframe: '5m' }, stubResult()),
      false,
    );
  });
});
