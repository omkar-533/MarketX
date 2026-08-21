import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planOpportunityBoardTick } from './opportunityBoardJob.mjs';

describe('opportunity board job plan', () => {
  it('hunts the hourly board every tick — it is the only one a card reads', () => {
    const plan = planOpportunityBoardTick();
    assert.equal(plan.hunt, true);
    assert.equal(plan.persist, true);
    assert.deepEqual(plan.timeframes, ['1h']);
    assert.deepEqual(plan.universes, ['F&O']);
  });

  it('plans nothing a card cannot show', () => {
    const { timeframes } = planOpportunityBoardTick();
    for (const dead of ['5m', '15m', '1D']) {
      assert.ok(!timeframes.includes(dead), `${dead} board still planned`);
    }
  });

  it('hands back fresh arrays so a caller cannot mutate the plan', () => {
    const a = planOpportunityBoardTick();
    a.timeframes.push('5m');
    a.universes.push('NIFTY50');
    const b = planOpportunityBoardTick();
    assert.deepEqual(b.timeframes, ['1h']);
    assert.deepEqual(b.universes, ['F&O']);
  });
});
