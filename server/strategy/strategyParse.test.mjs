import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectClarifications,
  detectUnsupported,
  localParseStrategy,
  parseStrategyDescription,
  sanitizeParsedStrategy,
} from './strategyParse.mjs';

describe('unsupported data', () => {
  it('rejects institutional order flow pretence', () => {
    const msg = detectUnsupported(
      'Find stocks where smart money enters based on institutional order flow.',
    );
    assert.ok(msg);
    assert.match(msg, /isn't currently supported/i);
  });
});

describe('clarifications', () => {
  it('asks which liquidity for bare sweep', () => {
    const q = detectClarifications('Liquidity sweep.');
    assert.ok(q.some((x) => x.id === 'liquidityTarget'));
  });

  it('does not ask when previous low is stated', async () => {
    const out = await parseStrategyDescription({
      apiKey: null,
      description:
        'I want 15M previous low sweep and 5M bullish structure shift and 5M volume 1.5x and 1H bullish trend.',
      preferLocal: true,
    });
    assert.equal(out.result.ok, true);
    assert.equal(out.result.clarifications.length, 0);
    const types = out.result.strategy.conditions.map((c) => c.type);
    assert.ok(types.includes('LIQUIDITY_SWEEP'));
    assert.ok(types.includes('STRUCTURE_SHIFT'));
    assert.ok(types.includes('RELATIVE_VOLUME'));
    assert.ok(types.includes('HTF_TREND'));
  });
});

describe('local parse OR', () => {
  it('maps breakout or liquidity with OR operator hint', () => {
    const draft = localParseStrategy('Breakout or liquidity sweep previous low');
    assert.equal(draft.logicOperator, 'OR');
    assert.ok(draft.conditions.some((c) => c.type === 'BREAKOUT'));
    assert.ok(draft.conditions.some((c) => c.type === 'LIQUIDITY_SWEEP'));
  });
});

describe('sanitize', () => {
  it('drops unknown condition types', () => {
    const r = sanitizeParsedStrategy({
      name: 'X',
      conditions: [
        { type: 'LIQUIDITY_SWEEP', timeframe: '15m', direction: 'BULLISH' },
        { type: 'SMART_MONEY', timeframe: '5m' },
      ],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /Unsupported/.test(e)));
  });
});
