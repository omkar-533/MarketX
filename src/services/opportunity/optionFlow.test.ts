import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { optionFlowDayPct, optionFlowSignal, type OptionFlowSnap } from './optionFlow';

function flow(over: Partial<OptionFlowSnap> = {}): OptionFlowSnap {
  return {
    symbol: 'TCS',
    expiry: '2026-08-21',
    fetchedAt: 1,
    spot: 101,
    ceOi: 200_000,
    peOi: 120_000,
    ceOiChg: 20_000,
    peOiChg: 2_000,
    ceVol: 5_000,
    peVol: 2_000,
    pcr: 0.6,
    atmStrike: 100,
    atmBandCeOiChg: 12_000,
    atmBandPeOiChg: -1_000,
    ...over,
  };
}

describe('optionFlowSignal', () => {
  it('lists long buildup when price and CE OI both rise', () => {
    const s = optionFlowSignal(flow(), 1.2);
    assert.ok(s);
    assert.equal(s?.kind, 'long_buildup');
    assert.equal(s?.direction, 'bullish');
    assert.equal(s?.active, true);
  });

  it('lists short buildup when price falls and PE OI rises', () => {
    const s = optionFlowSignal(
      flow({
        ceOiChg: 1_000,
        peOiChg: 18_000,
        atmBandCeOiChg: -500,
        atmBandPeOiChg: 10_000,
        pcr: 1.4,
      }),
      -1.1,
    );
    assert.ok(s);
    assert.equal(s?.kind, 'short_buildup');
    assert.equal(s?.direction, 'bearish');
  });

  it('skips thin OI', () => {
    assert.equal(
      optionFlowSignal(flow({ ceOi: 2_000, peOi: 1_000, ceOiChg: 200, peOiChg: 100, atmBandCeOiChg: 50 }), 1.2),
      null,
    );
  });

  it('skips two-way ATM add', () => {
    assert.equal(
      optionFlowSignal(flow({ atmBandCeOiChg: 10_000, atmBandPeOiChg: 9_800 }), 1.2),
      null,
    );
  });

  it('skips when ATM band did not participate', () => {
    assert.equal(optionFlowSignal(flow({ atmBandCeOiChg: 0, atmBandPeOiChg: 0 }), 1.2), null);
  });

  it('skips weak cover', () => {
    assert.equal(
      optionFlowSignal(
        flow({
          ceOiChg: -12_000,
          peOiChg: -2_000,
          atmBandCeOiChg: -8_000,
          atmBandPeOiChg: 1_000,
        }),
        0.4,
      ),
      null,
    );
  });

  it('uses prev close for day %, not a 20-bar leftover', () => {
    assert.ok(Math.abs((optionFlowDayPct(370.65, 372.55, 2.4) ?? 0) - ((370.65 - 372.55) / 372.55) * 100) < 1e-9);
  });
});
