/** Exponential backoff: 2s → 5s → 10s → … max 30s */
const STEPS_MS = [2000, 5000, 10000, 15000, 20000, 25000, 30000];

export function getReconnectDelayMs(attempt) {
  const idx = Math.max(0, Math.min(attempt, STEPS_MS.length - 1));
  return STEPS_MS[idx];
}

export function createBackoffScheduler(onFire) {
  let attempt = 0;
  let timer = null;

  return {
    schedule() {
      if (timer) return;
      const delay = getReconnectDelayMs(attempt);
      attempt += 1;
      timer = setTimeout(() => {
        timer = null;
        onFire(attempt, delay);
      }, delay);
    },
    reset() {
      attempt = 0;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    getAttempt() {
      return attempt;
    },
  };
}
