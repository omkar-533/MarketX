import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feedState } from './feedState';

const MODES = ['LIVE', 'DEMO'] as const;
const STATUSES = ['LIVE', 'DELAYED', 'DEMO', 'OFFLINE', 'CONNECTING', ''];

describe('opportunity feed state', () => {
  it('never hides the market-data control, in any combination', () => {
    for (const dataMode of MODES) {
      for (const feedStatus of STATUSES) {
        for (const marketOpen of [true, false]) {
          const state = feedState({ dataMode, feedStatus, marketOpen });
          assert.ok(
            state.cta === 'connect' || state.cta === 'manage',
            `no control for ${dataMode}/${feedStatus}/open=${marketOpen}`,
          );
        }
      }
    }
  });

  it('offers connect after the bell when no broker is attached', () => {
    const state = feedState({ dataMode: 'DEMO', feedStatus: 'OFFLINE', marketOpen: false });
    assert.equal(state.cta, 'connect');
    assert.equal(state.label, 'Demo mode');
  });

  it('still reaches the modal on a closed market with a broker attached', () => {
    // The reported bug: "Last session" showed and the connect button vanished.
    const state = feedState({ dataMode: 'LIVE', feedStatus: 'LIVE', marketOpen: false });
    assert.equal(state.label, 'Last session');
    assert.equal(state.cta, 'manage');
  });

  it('asks to connect when the market is open but the tape is not moving', () => {
    const state = feedState({ dataMode: 'LIVE', feedStatus: 'DELAYED', marketOpen: true });
    assert.equal(state.cta, 'connect');
    assert.equal(state.label, 'Delayed');
  });

  it('stays quiet while a live feed is streaming', () => {
    const state = feedState({ dataMode: 'LIVE', feedStatus: 'LIVE', marketOpen: true });
    assert.equal(state.cta, 'manage');
    assert.equal(state.liveStreaming, true);
    assert.equal(state.label, 'Live feed');
  });

  it('treats a live-mode offline feed as no broker', () => {
    const state = feedState({ dataMode: 'LIVE', feedStatus: 'OFFLINE', marketOpen: true });
    assert.equal(state.brokerOn, false);
    assert.equal(state.cta, 'connect');
    assert.equal(state.label, 'Connect for live');
  });
});
