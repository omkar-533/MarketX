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
    const plan = planOpportunityBoardTick(open, 12);
    assert.equal(plan.hunt, true);
    assert.ok(plan.timeframes.includes('5m'));
    assert.ok(plan.timeframes.includes('15m'));
    assert.ok(plan.timeframes.includes('1h'));
    assert.deepEqual(plan.universes, ['F&O']);
  });

  it('keeps the 1h board on a short rotation — Wolf Hunters reads nothing else', () => {
    const open = Date.parse('2026-08-17T11:20:00+05:30');
    const ticks = [0, 1, 2, 3, 4, 5].map((n) => planOpportunityBoardTick(open, n).timeframes);
    const withHour = ticks.filter((tf) => tf.includes('1h')).length;
    assert.equal(withHour, 2, 'expected 1h twice in six minutes');
  });

  it('after the bell still hunts 5m plus a slower TF so 15m/1h do not go empty', () => {
    const closed = Date.parse('2026-08-17T18:05:00+05:30');
    const a = planOpportunityBoardTick(closed, 0);
    const b = planOpportunityBoardTick(closed, 1);
    const c = planOpportunityBoardTick(closed, 2);
    assert.equal(a.hunt, true);
    assert.equal(a.persist, true);
    assert.ok(a.timeframes.includes('5m') && a.timeframes.includes('15m'));
    assert.ok(b.timeframes.includes('5m') && b.timeframes.includes('1h'));
    assert.ok(c.timeframes.includes('5m') && c.timeframes.includes('15m'));
    assert.deepEqual(a.universes, ['F&O']);
  });

  it('never plans a daily board — no card reads one, and each costs a full pull', () => {
    const open = Date.parse('2026-08-17T11:20:00+05:30');
    const closed = Date.parse('2026-08-17T18:05:00+05:30');
    for (let n = 0; n < 24; n += 1) {
      assert.ok(!planOpportunityBoardTick(open, n).timeframes.includes('1D'));
      assert.ok(!planOpportunityBoardTick(closed, n).timeframes.includes('1D'));
    }
  });
});
