import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OPPORTUNITY_SCANNERS } from './opportunityTypes';
import {
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

  it('keeps Boosters on 5m only — the scanner returns null anywhere else', () => {
    assert.deepEqual(scannerTimeframes('opening_drive'), ['5m']);
  });

  it('keeps Morning Sprint intraday so a broken rule can still drop the name', () => {
    assert.deepEqual(scannerTimeframes('morning_sprint'), ['5m', '15m']);
  });

  it('defaults a card to its first listed timeframe', () => {
    assert.equal(defaultScannerTimeframe('morning_sprint'), '5m');
    assert.equal(defaultScannerTimeframe('opening_drive'), '5m');
  });

  it('refuses a timeframe the scanner does not run on', () => {
    assert.equal(coerceScannerTimeframe('opening_drive', '1h'), '5m');
    assert.equal(coerceScannerTimeframe('morning_sprint', '1D'), '5m');
    assert.equal(coerceScannerTimeframe('morning_sprint', '15m'), '15m');
  });

  it('drops a retired card off the desk entirely', () => {
    const ids = OPPORTUNITY_SCANNERS.map((s) => s.id);
    assert.deepEqual(ids, ['morning_sprint', 'opening_drive', 'wolf_hunters']);
    for (const gone of ['breakout_radar', 'trend_rider', 'options_flow', 'wolf_prime']) {
      assert.equal(ids.includes(gone as never), false);
    }
  });

  it('falls back to 5m for an unknown scanner', () => {
    assert.equal(defaultScannerTimeframe('nope'), '5m');
    assert.deepEqual(scannerTimeframes('nope'), ['5m']);
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

  it('asks for only the boards the current selection needs', () => {
    // Morning Sprint and Boosters sit on 5m, Wolf Hunters on 1h.
    assert.deepEqual(timeframesInUse(defaultCardTimeframes()), ['5m', '1h']);
  });

  it('counts a switched card as a new board to load', () => {
    const tfs = timeframesInUse({ ...defaultCardTimeframes(), morning_sprint: '15m' });
    assert.deepEqual(tfs.sort(), ['15m', '1h', '5m']);
  });

  it('keeps Wolf Hunters on the hourly candles its rule is written for', () => {
    assert.deepEqual(scannerTimeframes('wolf_hunters'), ['1h']);
    assert.equal(coerceScannerTimeframe('wolf_hunters', '5m'), '1h');
  });
});
