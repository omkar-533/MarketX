import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLiveScanCards,
  applyScanCardsKeepingFirstSeen,
  emptyOpportunityCards,
  mergeOpportunityHitIntoCards,
  nextOpportunityDeskSort,
  sortHitsForDesk,
} from './opportunityStore';
import type { OpportunityHit } from './opportunityTypes';

function hit(partial: Partial<OpportunityHit> & Pick<OpportunityHit, 'symbol' | 'scannerId' | 'score'>): OpportunityHit {
  return {
    id: `opp-${partial.scannerId}-${partial.symbol}`,
    exchange: 'NSE',
    price: 100,
    changePercent: 1,
    timeframe: '5m',
    direction: 'bullish',
    status: 'WATCH',
    breakdown: {},
    stateLabel: 'WATCH',
    why: 'test',
    keyLevel: null,
    trigger: null,
    invalidation: '',
    confirmationNeeded: '',
    evidence: [],
    detectedAt: 1,
    dataMode: 'LIVE',
    ...partial,
  };
}

describe('opportunityStore ranking', () => {
  it('keeps the first names of the day instead of swapping in a hotter late print', () => {
    let cards = emptyOpportunityCards();
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'breakout_radar', symbol: 'AAA', score: 61, detectedAt: 10 }),
      2,
    );
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'breakout_radar', symbol: 'BBB', score: 62, detectedAt: 20 }),
      2,
    );
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'breakout_radar', symbol: 'CCC', score: 90, detectedAt: 30 }),
      2,
    );
    const names = cards.find((c) => c.scannerId === 'breakout_radar')?.hits.map((h) => h.symbol) || [];
    assert.deepEqual(names, ['AAA', 'BBB']);
  });

  it('adds a 2nd listing when the same name prints again later', () => {
    let cards = emptyOpportunityCards();
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'breakout_radar', symbol: 'INFY', score: 70, detectedAt: 111 }),
    );
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'breakout_radar', symbol: 'INFY', score: 81, detectedAt: 999 }),
    );
    const hits = cards.find((c) => c.scannerId === 'breakout_radar')?.hits || [];
    assert.deepEqual(
      hits.map((h) => h.detectedAt).sort((a, b) => a - b),
      [111, 999],
    );
    assert.equal(hits.find((h) => h.detectedAt === 111)?.score, 70);
  });

  it('replaces the board with the completed scan, keeping listing time on repeats', () => {
    const prev = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [hit({ scannerId: 'breakout_radar', symbol: 'RELIANCE', score: 70, detectedAt: 111 })],
            status: 'ready' as const,
          }
        : c,
    );
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [
              hit({ scannerId: 'breakout_radar', symbol: 'TCS', score: 88, detectedAt: 222 }),
              hit({ scannerId: 'breakout_radar', symbol: 'RELIANCE', score: 80, detectedAt: 333 }),
            ],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyScanCardsKeepingFirstSeen(prev, incoming);
    const hits = next.find((c) => c.scannerId === 'breakout_radar')?.hits || [];
    assert.equal(hits.map((h) => h.symbol).join(','), 'TCS,RELIANCE');
    assert.equal(hits.find((h) => h.symbol === 'RELIANCE')?.detectedAt, 111);
    assert.equal(hits.find((h) => h.symbol === 'TCS')?.detectedAt, 222);
  });

  it('does not keep leftover names from a previous browser board', () => {
    const prev = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [hit({ scannerId: 'breakout_radar', symbol: 'OLDPC', score: 99, detectedAt: 1 })],
            status: 'ready' as const,
          }
        : c,
    );
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [hit({ scannerId: 'breakout_radar', symbol: 'TCS', score: 80, detectedAt: 2 })],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyScanCardsKeepingFirstSeen(prev, incoming);
    const names = next.find((c) => c.scannerId === 'breakout_radar')?.hits.map((h) => h.symbol) || [];
    assert.deepEqual(names, ['TCS']);
  });

  it('live apply uses this scan only, never a saved board', () => {
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [hit({ scannerId: 'breakout_radar', symbol: 'INFY', score: 77, detectedAt: 9 })],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyLiveScanCards(incoming);
    const hits = next.find((c) => c.scannerId === 'breakout_radar')?.hits || [];
    assert.deepEqual(hits.map((h) => h.symbol), ['INFY']);
    assert.equal(hits[0]?.detectedAt, 9);
  });

  it('quiet refresh keeps listing time when the same names still qualify', () => {
    const prev = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [hit({ scannerId: 'breakout_radar', symbol: 'INFY', score: 70, detectedAt: 111 })],
            status: 'ready' as const,
          }
        : c,
    );
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'breakout_radar'
        ? {
            ...c,
            hits: [hit({ scannerId: 'breakout_radar', symbol: 'INFY', score: 81, detectedAt: 999 })],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyScanCardsKeepingFirstSeen(prev, incoming);
    const row = next.find((c) => c.scannerId === 'breakout_radar')?.hits[0];
    assert.equal(row?.symbol, 'INFY');
    assert.equal(row?.score, 81);
    assert.equal(row?.detectedAt, 111);
  });
});

describe('desk sort cycle', () => {
  it('starts on Default and cycles Default → Long → Short → Created → % change', () => {
    assert.equal(nextOpportunityDeskSort('default'), 'long');
    assert.equal(nextOpportunityDeskSort('long'), 'short');
    assert.equal(nextOpportunityDeskSort('short'), 'created');
    assert.equal(nextOpportunityDeskSort('created'), 'percent');
    assert.equal(nextOpportunityDeskSort('percent'), 'default');
  });

  it('keeps original Created ranking on Default, and Wolf score first on other cycle steps', () => {
    const rows = [
      hit({ scannerId: 'breakout_radar', symbol: 'LOW', score: 61, direction: 'bullish', changePercent: 3, detectedAt: 40 }),
      hit({ scannerId: 'breakout_radar', symbol: 'HIGH', score: 92, direction: 'bullish', changePercent: 0.4, detectedAt: 10 }),
      hit({ scannerId: 'breakout_radar', symbol: 'SHORT', score: 88, direction: 'bearish', changePercent: -1, detectedAt: 30 }),
    ];
    assert.deepEqual(
      sortHitsForDesk(rows, 'default').map((h) => h.symbol),
      ['LOW', 'SHORT', 'HIGH'],
    );
    assert.deepEqual(
      sortHitsForDesk(rows, 'long').map((h) => h.symbol),
      ['HIGH', 'LOW', 'SHORT'],
    );
    assert.equal(sortHitsForDesk(rows, 'short')[0].symbol, 'SHORT');
    assert.equal(sortHitsForDesk(rows, 'created')[0].symbol, 'HIGH');
    assert.equal(sortHitsForDesk(rows, 'percent')[0].symbol, 'HIGH');
  });
});
