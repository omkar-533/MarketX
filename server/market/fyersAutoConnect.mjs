/**
 * Backend Fyers auto-connect: on server boot + watchdog reconnect (live data only).
 * One-time OAuth → token in data/fyers-token.json → every restart auto-connects.
 */
import { getFyersConfig, getFyersAccessToken, isFyersConfigured, validateFyersToken } from './fyersSession.mjs';
import { ensureFyersSocket, getFyersWsStatus } from './fyersWsManager.mjs';
import { getFnoSymbolList } from './fyersUniverse.mjs';

const WATCH_MS = 25_000;
let watchTimer = null;

export async function bootFyersAutoConnect() {
  const { appId } = getFyersConfig();
  const token = getFyersAccessToken();

  if (!appId) {
    console.warn('[FyersAuto] FYERS_APP_ID missing in .env.local — live data off');
    return { ok: false, reason: 'no_app_id' };
  }

  if (!token) {
    console.warn('[FyersAuto] No saved token — one-time login: http://localhost:5173 → Connect Fyers');
    return { ok: false, reason: 'no_token' };
  }

  const valid = await validateFyersToken();
  if (!valid) {
    console.warn('[FyersAuto] Token expired/invalid — re-login once via /api/fyers/go');
    return { ok: false, reason: 'invalid_token' };
  }

  const symbols = getFnoSymbolList();
  ensureFyersSocket(symbols);
  const ws = getFyersWsStatus();
  console.log(
    `[FyersAuto] Live stream starting — ${symbols.length} symbols · ws=${ws.status}`,
  );
  return { ok: true, symbols: symbols.length, wsStatus: ws.status };
}

export function startFyersAutoConnectWatch() {
  if (watchTimer) return;
  watchTimer = setInterval(() => {
    void tickFyersAutoConnect();
  }, WATCH_MS);
}

async function tickFyersAutoConnect() {
  if (!isFyersConfigured()) {
    const token = getFyersAccessToken();
    if (!token) return;
    await bootFyersAutoConnect();
    return;
  }

  const ws = getFyersWsStatus();
  if (ws.status === 'token_invalid') return;

  if (!ws.connected && ws.status !== 'connecting' && ws.status !== 'reconnecting') {
    ensureFyersSocket(getFnoSymbolList());
  }
}

export function stopFyersAutoConnectWatch() {
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
}
