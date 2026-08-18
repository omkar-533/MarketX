import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  accumulateSessionMs,
  appendLoginEvent,
  listLoginEvents,
  spentMsNow,
  stampLoginNumbers,
  touchLoginSession,
} from './loginEventStore.mjs';

describe('login event store', () => {
  it('records a timestamped login that list can read back', async () => {
    const userId = `user-login-test-${Date.now()}`;
    const at = '2026-08-18T09:15:00.000Z';
    const row = await appendLoginEvent(userId, at, 3);
    assert.equal(row.userId, userId);
    assert.equal(row.loggedInAt, at);
    assert.equal(row.loginN, 3);
    const list = await listLoginEvents({ userId, limit: 20 });
    assert.ok(list.some((e) => e.userId === userId && e.loggedInAt === at));
  });

  it('stamps 1st/2nd/3rd from history when login_n is missing', () => {
    const events = [
      { userId: 'u1', loggedInAt: '2026-08-18T10:00:00.000Z', loginN: null },
      { userId: 'u1', loggedInAt: '2026-08-18T08:00:00.000Z', loginN: null },
      { userId: 'u1', loggedInAt: '2026-08-18T09:00:00.000Z', loginN: null },
    ];
    stampLoginNumbers(events, new Map([['u1', 10]]));
    const byTime = [...events].sort((a, b) => Date.parse(a.loggedInAt) - Date.parse(b.loggedInAt));
    assert.equal(byTime[0].loginN, 8);
    assert.equal(byTime[1].loginN, 9);
    assert.equal(byTime[2].loginN, 10);
    assert.equal(events[0].timesLoggedIn, 10);
  });

  it('accumulates heartbeat time and ignores idle gaps', () => {
    const t0 = Date.parse('2026-08-18T09:15:00.000Z');
    const first = accumulateSessionMs({
      durationMs: 0,
      lastSeenAt: new Date(t0).toISOString(),
      loggedInAt: new Date(t0).toISOString(),
      now: t0 + 30_000,
    });
    assert.equal(first.durationMs, 30_000);
    const idle = accumulateSessionMs({
      durationMs: first.durationMs,
      lastSeenAt: first.lastSeenAt,
      now: t0 + 30_000 + 10 * 60_000,
    });
    assert.equal(idle.addedMs, 0);
    assert.equal(idle.durationMs, 30_000);
  });

  it('touchLoginSession adds time for this login', async () => {
    const userId = `user-spend-${Date.now()}`;
    const at = '2026-08-18T09:15:00.000Z';
    const row = await appendLoginEvent(userId, at, 1);
    const touched = await touchLoginSession(userId, {
      eventId: row.id,
      now: Date.parse(at) + 45_000,
    });
    assert.equal(touched.durationMs, 45_000);
    assert.equal(spentMsNow({ ...touched, lastSeenAt: new Date(Date.parse(at) + 45_000).toISOString() }, Date.parse(at) + 45_000), 45_000);
  });
});
