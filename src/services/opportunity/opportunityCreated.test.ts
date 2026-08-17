import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatOpportunityCreatedClock, opportunityCreatedAtMs } from './opportunityCreated';
import {
  applyScanCardsKeepingFirstSeen,
  emptyOpportunityCards,
} from './opportunityStore';
import type { OpportunityHit } from './opportunityTypes';

const FIVE = 5 * 60_000;

function bar(ts: number) {
  return { timestamp: ts };
}

function session(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => bar(start + i * FIVE));
}

function hit(partial: Partial<OpportunityHit> & Pick<OpportunityHit, 'symbol' | 'detectedAt'>): OpportunityHit {
  return {
    id: `opp-breakout_radar-${partial.symbol}`,
    scannerId: 'breakout_radar',
    exchange: 'NSE',
    price: 100,
    changePercent: 1,
    timeframe: '5m',
    direction: 'bullish',
    status: 'WATCH',
    score: 70,
    breakdown: {},
    stateLabel: 'WATCH',
    why: 'test',
    keyLevel: null,
    trigger: null,
    invalidation: '',
    confirmationNeeded: '',
    evidence: [],
    dataMode: 'LIVE',
    ...partial,
  };
}

describe('Opportunity Created clock', () => {
  it('first qualify at 10:20 shows 10:25 IST, not the scan clock', () => {
    const now = Date.parse('2026-08-17T14:32:00+05:30');
    const start = Date.parse('2026-08-17T09:15:00+05:30');
    const candles = session(start, 64);
    const first = 13; // 09:15 + 13*5m = 10:20 open → close 10:25
    const created = opportunityCreatedAtMs(candles, '5m', (i) => i >= first, now);
    const expected = Date.parse('2026-08-17T10:25:00+05:30');
    assert.equal(created, expected);
    assert.equal(formatOpportunityCreatedClock(created, now), '10:25 am');
    assert.notEqual(formatOpportunityCreatedClock(created, now), formatOpportunityCreatedClock(now, now));
  });

  it('a name that first prints at 14:05 shows that time, not a dead 9:20', () => {
    const now = Date.parse('2026-08-17T14:32:00+05:30');
    const start = Date.parse('2026-08-17T09:15:00+05:30');
    const candles = session(start, 64);
    const morning = 1; // 9:20 close
    const afternoon = 58; // 09:15 + 58*5m = 14:05 open → 14:10 close
    const created = opportunityCreatedAtMs(
      candles,
      '5m',
      (i) => i === morning || i >= afternoon,
      now,
    );
    assert.equal(created, Date.parse('2026-08-17T14:10:00+05:30'));
    assert.equal(formatOpportunityCreatedClock(created, now), '2:10 pm');
  });

  it('after the bell still shows first-create time, not 3:30 for every name', () => {
    const now = Date.parse('2026-08-17T16:22:00+05:30');
    const start = Date.parse('2026-08-17T09:15:00+05:30');
    const candles = session(start, 75);
    const first = 13;
    const created = opportunityCreatedAtMs(candles, '5m', (i) => i >= first, now);
    assert.equal(created, Date.parse('2026-08-17T10:25:00+05:30'));
    assert.equal(formatOpportunityCreatedClock(created, now), '10:25 am');
    assert.notEqual(created, Date.parse('2026-08-17T15:30:00+05:30'));
  });

  it('blank when the setup never printed', () => {
    const now = Date.parse('2026-08-17T14:32:00+05:30');
    const start = Date.parse('2026-08-17T09:15:00+05:30');
    const candles = session(start, 40);
    assert.equal(opportunityCreatedAtMs(candles, '5m', () => false, now), 0);
    assert.equal(formatOpportunityCreatedClock(0, now), '—');
  });

  it('quiet refresh keeps the first-create clock when the same name stays on the board', () => {
    const first = Date.parse('2026-08-17T10:25:00+05:30');
    const later = Date.parse('2026-08-17T15:30:00+05:30');
    const prev = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [hit({ symbol: 'INFY', score: 70, detectedAt: first })],
            status: 'ready' as const,
          }
        : c,
    );
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [hit({ symbol: 'INFY', score: 81, detectedAt: later })],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyScanCardsKeepingFirstSeen(prev, incoming);
    const row = next.find((c) => c.scannerId === 'breakout_radar')?.hits[0];
    assert.equal(row?.detectedAt, first);
    assert.equal(formatOpportunityCreatedClock(row?.detectedAt || 0, later), '10:25 am');
  });
});
