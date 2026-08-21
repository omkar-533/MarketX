import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLiveScanCards,
  applyScanCardsKeepingFirstSeen,
  emptyOpportunityCards,
  mergeOpportunityHitIntoCards,
  nextOpportunityDeskSort,
  opportunityPrintOrdinal,
  scannerPrintLabelOf,
  scannerPrintLabels,
  sortHitsForDesk,
} from './opportunityStore';
import type { OpportunityHit } from './opportunityTypes';

function hit(partial: Partial<OpportunityHit> & Pick<OpportunityHit, 'symbol' | 'scannerId' | 'score'>): OpportunityHit {
  return {
    id: `opp-${partial.scannerId}-${partial.symbol}`,
    exchange: 'NSE',
    price: 100,
    changePercent: 1,
    timeframe: '1h',
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
  it('keeps every qualifying name instead of swapping out an earlier print for a hotter late score', () => {
    let cards = emptyOpportunityCards();
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'wolf_hunters', symbol: 'AAA', score: 61, detectedAt: 10 }),
    );
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'wolf_hunters', symbol: 'BBB', score: 62, detectedAt: 20 }),
    );
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'wolf_hunters', symbol: 'CCC', score: 90, detectedAt: 30 }),
    );
    const names = cards.find((c) => c.scannerId === 'wolf_hunters')?.hits.map((h) => h.symbol) || [];
    assert.deepEqual(names, ['AAA', 'BBB', 'CCC']);
  });

  it('adds a 2nd listing when the same name prints again later', () => {
    let cards = emptyOpportunityCards();
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'wolf_hunters', symbol: 'INFY', score: 70, detectedAt: 111 }),
    );
    cards = mergeOpportunityHitIntoCards(
      cards,
      hit({ scannerId: 'wolf_hunters', symbol: 'INFY', score: 81, detectedAt: 999 }),
    );
    const hits = cards.find((c) => c.scannerId === 'wolf_hunters')?.hits || [];
    assert.deepEqual(
      hits.map((h) => h.detectedAt).sort((a, b) => a - b),
      [111, 999],
    );
    assert.equal(hits.find((h) => h.detectedAt === 111)?.score, 70);
  });

  it('replaces the board with the completed scan, keeping listing time on repeats', () => {
    const prev = emptyOpportunityCards().map((c) =>
      c.scannerId === 'wolf_hunters'
        ? {
            ...c,
            hits: [hit({ scannerId: 'wolf_hunters', symbol: 'RELIANCE', score: 70, detectedAt: 111 })],
            status: 'ready' as const,
          }
        : c,
    );
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'wolf_hunters'
        ? {
            ...c,
            hits: [
              hit({ scannerId: 'wolf_hunters', symbol: 'TCS', score: 88, detectedAt: 222 }),
              hit({ scannerId: 'wolf_hunters', symbol: 'RELIANCE', score: 80, detectedAt: 333 }),
            ],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyScanCardsKeepingFirstSeen(prev, incoming);
    const hits = next.find((c) => c.scannerId === 'wolf_hunters')?.hits || [];
    assert.equal(hits.map((h) => h.symbol).join(','), 'TCS,RELIANCE');
    assert.equal(hits.find((h) => h.symbol === 'RELIANCE')?.detectedAt, 111);
    assert.equal(hits.find((h) => h.symbol === 'TCS')?.detectedAt, 222);
  });

  it('does not keep leftover names from a previous browser board', () => {
    const prev = emptyOpportunityCards().map((c) =>
      c.scannerId === 'wolf_hunters'
        ? {
            ...c,
            hits: [hit({ scannerId: 'wolf_hunters', symbol: 'OLDPC', score: 99, detectedAt: 1 })],
            status: 'ready' as const,
          }
        : c,
    );
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'wolf_hunters'
        ? {
            ...c,
            hits: [hit({ scannerId: 'wolf_hunters', symbol: 'TCS', score: 80, detectedAt: 2 })],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyScanCardsKeepingFirstSeen(prev, incoming);
    const names = next.find((c) => c.scannerId === 'wolf_hunters')?.hits.map((h) => h.symbol) || [];
    assert.deepEqual(names, ['TCS']);
  });

  it('live apply uses this scan only, never a saved board', () => {
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'wolf_hunters'
        ? {
            ...c,
            hits: [hit({ scannerId: 'wolf_hunters', symbol: 'INFY', score: 77, detectedAt: 9 })],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyLiveScanCards(incoming);
    const hits = next.find((c) => c.scannerId === 'wolf_hunters')?.hits || [];
    assert.deepEqual(hits.map((h) => h.symbol), ['INFY']);
    assert.equal(hits[0]?.detectedAt, 9);
  });

  it('quiet refresh keeps listing time when the same names still qualify', () => {
    const prev = emptyOpportunityCards().map((c) =>
      c.scannerId === 'wolf_hunters'
        ? {
            ...c,
            hits: [hit({ scannerId: 'wolf_hunters', symbol: 'INFY', score: 70, detectedAt: 111 })],
            status: 'ready' as const,
          }
        : c,
    );
    const incoming = emptyOpportunityCards().map((c) =>
      c.scannerId === 'wolf_hunters'
        ? {
            ...c,
            hits: [hit({ scannerId: 'wolf_hunters', symbol: 'INFY', score: 81, detectedAt: 999 })],
            status: 'ready' as const,
          }
        : c,
    );
    const next = applyScanCardsKeepingFirstSeen(prev, incoming);
    const row = next.find((c) => c.scannerId === 'wolf_hunters')?.hits[0];
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
      hit({ scannerId: 'wolf_hunters', symbol: 'LOW', score: 61, direction: 'bullish', changePercent: 3, detectedAt: 40 }),
      hit({ scannerId: 'wolf_hunters', symbol: 'HIGH', score: 92, direction: 'bullish', changePercent: 0.4, detectedAt: 10 }),
      hit({ scannerId: 'wolf_hunters', symbol: 'SHORT', score: 88, direction: 'bearish', changePercent: -1, detectedAt: 30 }),
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

  it('numbers 1st–4th per scanner only when the same stock reprints there', () => {
    assert.equal(opportunityPrintOrdinal(1), '1st');
    assert.equal(opportunityPrintOrdinal(2), '2nd');
    assert.equal(opportunityPrintOrdinal(3), '3rd');
    assert.equal(opportunityPrintOrdinal(4), '4th');
    const radar = [
      hit({ id: 'r-infy-1', scannerId: 'wolf_hunters', symbol: 'INFY', score: 70, detectedAt: 10 }),
      hit({ id: 'r-infy-2', scannerId: 'wolf_hunters', symbol: 'INFY', score: 80, detectedAt: 20 }),
      hit({ id: 'r-infy-3', scannerId: 'wolf_hunters', symbol: 'INFY', score: 88, detectedAt: 30 }),
      hit({ id: 'r-tcs-1', scannerId: 'wolf_hunters', symbol: 'TCS', score: 75, detectedAt: 15 }),
    ];
    const surge = [
      hit({ id: 's-infy-1', scannerId: 'momentum_surge', symbol: 'INFY', score: 90, detectedAt: 40 }),
      hit({ id: 's-infy-2', scannerId: 'momentum_surge', symbol: 'INFY', score: 91, detectedAt: 50 }),
    ];
    const radarLabels = scannerPrintLabels(radar);
    assert.equal(scannerPrintLabelOf(radar[0], radarLabels), '1st');
    assert.equal(scannerPrintLabelOf(radar[1], radarLabels), '2nd');
    assert.equal(scannerPrintLabelOf(radar[2], radarLabels), '3rd');
    assert.equal(scannerPrintLabelOf(radar[3], radarLabels), '');
    const surgeLabels = scannerPrintLabels(surge);
    assert.equal(scannerPrintLabelOf(surge[0], surgeLabels), '1st');
    assert.equal(scannerPrintLabelOf(surge[1], surgeLabels), '2nd');
    assert.equal(
      scannerPrintLabelOf(
        hit({
          id: 'r-infy-now',
          scannerId: 'wolf_hunters',
          symbol: 'INFY',
          score: 88,
          detectedAt: 50,
          meta: { signalN: 3, signalCount: 3 },
        }),
        new Map(),
      ),
      '',
    );
  });
});
