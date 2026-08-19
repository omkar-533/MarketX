import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planOpportunityBoardTick } from './opportunityBoardJob.mjs';

describe('opportunity board job plan', () => {
  it('hunts 5m every minute while the cash session is open', () => {
    const open = Date.parse('2026-08-17T11:20:00+05:30');
    const plan = planOpportunityBoardTick(open, 1);
    assert.equal(plan.hunt, true);
    assert.deepEqual(plan.timeframes, ['5m']);
    assert.deepEqual(plan.universes, ['F&O']);
  });

  it('also covers slower TFs on cadence ticks', () => {
    const open = Date.parse('2026-08-17T11:20:00+05:30');
    const plan = planOpportunityBoardTick(open, 30);
    assert.equal(plan.hunt, true);
    assert.ok(plan.timeframes.includes('5m'));
    assert.ok(plan.timeframes.includes('15m'));
    assert.ok(plan.timeframes.includes('1h'));
    assert.ok(plan.timeframes.includes('1D'));
    assert.deepEqual(plan.universes, ['F&O']);
  });

  it('after the bell still hunts 5m so Created times rebuild from the last session', () => {
    const closed = Date.parse('2026-08-17T18:05:00+05:30');
    const plan = planOpportunityBoardTick(closed, 3);
    assert.equal(plan.hunt, true);
    assert.equal(plan.persist, true);
    assert.deepEqual(plan.timeframes, ['5m']);
    assert.deepEqual(plan.universes, ['F&O']);
  });
});
