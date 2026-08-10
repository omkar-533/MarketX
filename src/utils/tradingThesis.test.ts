import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTradingThesis,
  buildGuidedTradeSteps,
  parseKeyLevelsBlock,
  formatLevelDisplay,
  explainableEvidenceLabel,
} from './tradingThesis';
import type { WolfEvidenceItem } from './wolfEvidence';

describe('trading thesis V2', () => {
  it('parses Key Levels block', () => {
    const text = `
Market Bias: WAIT
Setup: Breakout + retest
Setup Status: WAITING
Key Observation: Range below resistance
Entry Condition: Close above 66000 + retest
Invalidation: Below 62900
Target Logic: 70000 then 78000
Key Levels:
R1 · 66000 — Decision level
S1 · 63500 — Reaction zone
INV · 62900 — Invalidation
T1 · 70000 — Next liquidity
Why:
1. Ceiling reactions
`;
    const levels = parseKeyLevelsBlock(text);
    assert.ok(levels.length >= 3);
    assert.equal(levels[0].id, 'R1');
    assert.match(levels[0].display, /66,?000/);
  });

  it('builds thesis answering 7 questions without inventing', () => {
    const text = `
Market Bias: WAIT
Setup: Breakout + retest
Setup Status: WAITING FOR CONFIRMATION
Key Observation: Consolidating below major resistance
Next Action: Wait for close
Entry Condition: 4H close above 66000 + retest
Stop Loss Logic: Below structure
Target Logic: 70000 / 78000
Invalidation: Below 62900
Key Levels:
R1 · 66000 — Decision level
S1 · 63500 — Reaction zone
INV · 62900 — Invalidation
T1 · 70000 — Target 1
Evidence Score: 62 / 100
Why:
1. Repeated reactions at ceiling
Alternative Scenario: Rejection sends price to support
Assumptions: HTF unread
`;
    const thesis = buildTradingThesis({ text });
    assert.equal(thesis.status, 'WAIT');
    assert.notEqual(thesis.answers.marketDoing, 'Not enough evidence.');
    assert.ok(thesis.keyLevels.length >= 3);
    assert.match(thesis.waitFor, /66000|close/i);
    const steps = buildGuidedTradeSteps(thesis);
    assert.equal(steps.length, 6);
    assert.equal(steps[0].title, 'MARKET CONTEXT');
  });

  it('formats explainable evidence labels', () => {
    const item: WolfEvidenceItem = {
      id: 'e1',
      type: 'resistance',
      title: '66000',
      description: 'Repeated reactions at range ceiling.',
      bbox: { x: 0.2, y: 0.2, width: 0.5, height: 0.08 },
      confidence: 'high',
    };
    const label = explainableEvidenceLabel(item);
    assert.match(label, /R ·|66000/);
    assert.equal(formatLevelDisplay('R1', '66000', 'Key resistance'), 'R1 · 66,000 — Key resistance');
  });
});
