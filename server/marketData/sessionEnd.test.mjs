import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  lastCompletedNseSessionEndMs,
  nextNseWeeklyExpiryYmd,
  nseMonthlyExpiryYmd,
  parseOptionExpiryMs,
} from './indstocksClient.mjs';

describe('lastCompletedNseSessionEndMs', () => {
  it('clamps Friday night to 15:30 IST the same day', () => {
    const now = Date.parse('2026-08-14T22:32:00+05:30');
    const end = lastCompletedNseSessionEndMs(now);
    assert.equal(end, Date.parse('2026-08-14T15:30:00+05:30'));
  });

  it('uses now during the cash session', () => {
    const now = Date.parse('2026-08-14T11:00:00+05:30');
    assert.equal(lastCompletedNseSessionEndMs(now), now);
  });

  it('walks Sunday back to Friday close', () => {
    const now = Date.parse('2026-08-16T10:00:00+05:30');
    const end = lastCompletedNseSessionEndMs(now);
    assert.equal(end, Date.parse('2026-08-14T15:30:00+05:30'));
  });
});

describe('option expiry helpers', () => {
  it('parses 20-AUG-2026 and ISO the same IST day', () => {
    const istYmd = (ms) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(ms));
    const a = parseOptionExpiryMs('20-AUG-2026');
    const b = parseOptionExpiryMs('2026-08-20');
    assert.ok(a > 0 && b > 0);
    assert.equal(istYmd(a), '2026-08-20');
    assert.equal(istYmd(b), '2026-08-20');
  });

  it('uses this Thursday before the open as the weekly expiry', () => {
    const now = Date.parse('2026-08-20T04:03:00+05:30');
    assert.equal(nextNseWeeklyExpiryYmd(now), '2026-08-20');
    assert.equal(nseMonthlyExpiryYmd(now), '2026-08-27');
  });
});
