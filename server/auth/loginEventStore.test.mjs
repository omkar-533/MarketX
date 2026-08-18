import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendLoginEvent, listLoginEvents } from './loginEventStore.mjs';

describe('login event store', () => {
  it('records a timestamped login that list can read back', async () => {
    const userId = `user-login-test-${Date.now()}`;
    const at = '2026-08-18T09:15:00.000Z';
    const row = await appendLoginEvent(userId, at);
    assert.equal(row.userId, userId);
    assert.equal(row.loggedInAt, at);
    const list = await listLoginEvents({ userId, limit: 20 });
    assert.ok(list.some((e) => e.userId === userId && e.loggedInAt === at));
  });
});
