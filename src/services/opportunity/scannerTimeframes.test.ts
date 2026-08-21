import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OPPORTUNITY_SCANNERS } from './opportunityTypes';
import {
  PRIMARY_TIMEFRAME,
  coerceScannerTimeframe,
  defaultCardTimeframes,
  defaultScannerTimeframe,
  scannerTimeframes,
  timeframesInUse,
} from './scannerTimeframes';

describe('per-card timeframes', () => {
  it('gives every desk card at least one timeframe', () => {
    for (const s of OPPORTUNITY_SCANNERS) {
      assert.ok(s.timeframes.length > 0, `${s.id} has no timeframe`);
    }
  });

  it('keeps the desk on the two sweep cards', () => {
    const ids = OPPORTUNITY_SCANNERS.map((s) => s.id);
    assert.deepEqual(ids, ['wolf_hunters', 'rally_rider']);
  });

  it('drops a retired card off the desk entirely', () => {
    const ids = OPPORTUNITY_SCANNERS.map((s) => s.id);
    for (const gone of ['morning_sprint', 'opening_drive', 'options_flow', 'wolf_prime']) {
      assert.equal(ids.includes(gone as never), false, `${gone} still on the desk`);
    }
  });

  it('keeps both sweep cards on the hourly candles their rules are written for', () => {
    assert.deepEqual(scannerTimeframes('wolf_hunters'), ['1h']);
    assert.deepEqual(scannerTimeframes('rally_rider'), ['1h']);
  });

  it('refuses a timeframe the scanner does not run on', () => {
    assert.equal(coerceScannerTimeframe('wolf_hunters', '5m'), '1h');
    assert.equal(coerceScannerTimeframe('rally_rider', '15m'), '1h');
    assert.equal(coerceScannerTimeframe('rally_rider', '1h'), '1h');
  });

  it('defaults a card to its first listed timeframe', () => {
    assert.equal(defaultScannerTimeframe('wolf_hunters'), '1h');
    assert.equal(defaultScannerTimeframe('rally_rider'), '1h');
  });

  it('falls back to the primary board for an unknown scanner', () => {
    assert.equal(defaultScannerTimeframe('nope'), PRIMARY_TIMEFRAME);
    assert.deepEqual(scannerTimeframes('nope'), [PRIMARY_TIMEFRAME]);
  });

  it('starts every card on a timeframe its own scanner supports', () => {
    const defaults = defaultCardTimeframes();
    for (const s of OPPORTUNITY_SCANNERS) {
      assert.ok(
        s.timeframes.includes(defaults[s.id]!),
        `${s.id} default ${defaults[s.id]} is unsupported`,
      );
    }
  });

  it('asks for one board only — every card is hourly, so there is no side fetch', () => {
    assert.deepEqual(timeframesInUse(defaultCardTimeframes()), ['1h']);
    assert.equal(PRIMARY_TIMEFRAME, '1h');
  });
});
