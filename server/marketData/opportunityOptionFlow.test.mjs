import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeOptionChain, planOptionFlowExpiries } from './opportunityOptionFlow.mjs';

describe('summarizeOptionChain', () => {
  it('sums CE/PE OI from a strikes object and ATM band', () => {
    const snap = summarizeOptionChain(
      'TCS',
      {
        data: {
          underlying_ltp: 100,
          expiry: '2026-08-21',
          strikes: {
            90: { ce: { oi: 10_000, previous_oi: 9_000, volume: 100 }, pe: { oi: 8_000, previous_oi: 8_500, volume: 80 } },
            100: { ce: { oi: 40_000, previous_oi: 30_000, volume: 400 }, pe: { oi: 20_000, previous_oi: 21_000, volume: 200 } },
            110: { ce: { oi: 12_000, previous_oi: 11_000, volume: 90 }, pe: { oi: 9_000, previous_oi: 8_000, volume: 70 } },
          },
        },
      },
      '2026-08-21',
      1,
    );
    assert.ok(snap);
    assert.equal(snap.symbol, 'TCS');
    assert.equal(snap.ceOi, 62_000);
    assert.equal(snap.peOi, 37_000);
    assert.equal(snap.ceOiChg, 12_000);
    assert.equal(snap.atmStrike, 100);
    assert.ok(snap.atmBandCeOiChg > 0);
  });

  it('returns null when OI is missing', () => {
    assert.equal(
      summarizeOptionChain('TCS', { data: { underlying_ltp: 100, strikes: { 100: { ce: {}, pe: {} } } } }, '2026-08-21'),
      null,
    );
  });

  it('does not guess today Thursday when that is not a listed expiry', () => {
    const now = Date.parse('2026-08-20T09:50:00+05:30');
    const planned = planOptionFlowExpiries('RELIANCE', now);
    assert.deepEqual(planned, ['2026-08-25', '2026-08-27']);
    assert.ok(!planned.includes('2026-08-20'));
  });
});
