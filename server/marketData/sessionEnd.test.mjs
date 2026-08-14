import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lastCompletedNseSessionEndMs } from './indstocksClient.mjs';

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
