/** Live tape removed — no WS, no ticks. */

export function getLiveWsStatus() {
  return {
    status: 'removed',
    connected: false,
    hasTicks: false,
    lastTickAt: null,
    reconnectAttempt: 0,
    upstream: 'removed',
    wsLastError: '',
  };
}

export function getLiveTickSnapshot() {
  return [];
}

export function subscribeLiveSymbols() {}

export function startLiveFeed() {}

export function stopLiveFeed() {}
