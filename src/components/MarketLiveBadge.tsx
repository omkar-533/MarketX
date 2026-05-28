import { useEffect, useState } from 'react';
import { getMarketLiveState, subscribeMarketLive } from '../services/marketLiveStore';
import {
  getFyersWsStatus,
  getMarketConnectionState,
  isMarketStreamActive,
} from '../services/marketConnection';
import {
  BRAND,
  CONNECT_LIVE_LABEL,
  CONNECT_PATH,
  LIVE_DATA_LABEL,
  sanitizeDisplayMessage,
} from '../constants/brandLabels';

const WS_LABEL: Record<string, string> = {
  connected: `${BRAND} Live`,
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  token_invalid: 'Login required',
  degraded: 'Reconnecting…',
  disconnected: 'Offline',
};

export default function MarketLiveBadge() {
  const [, bump] = useState(0);

  useEffect(() => subscribeMarketLive(() => bump((n) => n + 1)), []);

  const { mode, liveCount, error, provider } = getMarketLiveState();
  const wsStatus = getFyersWsStatus();
  const conn = getMarketConnectionState();
  const stream = isMarketStreamActive();
  const needsConnect =
    wsStatus === 'token_invalid' || (provider === 'fyers-offline' && !conn.fyersConnected);

  if (needsConnect) {
    return (
      <a
        href={CONNECT_PATH}
        className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
        title={CONNECT_LIVE_LABEL}
      >
        {CONNECT_LIVE_LABEL}
      </a>
    );
  }

  if (mode === 'live') {
    const label = stream ? WS_LABEL[wsStatus] ?? LIVE_DATA_LABEL : LIVE_DATA_LABEL;
    const ok = wsStatus === 'connected' && stream;
    return (
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
          ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        }`}
        title={sanitizeDisplayMessage(error || conn.wsLastError || `${liveCount} live symbols`)}
      >
        {label}
      </span>
    );
  }

  if (provider === 'fyers-offline' || !conn.serverOk) {
    return (
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded border border-slate-500/30 bg-slate-500/10 text-slate-400"
        title={CONNECT_LIVE_LABEL}
      >
        Setup required
      </span>
    );
  }

  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded border border-slate-600/40 bg-slate-800/40 text-slate-500"
      title={error || 'Waiting for live stream'}
    >
      {stream ? WS_LABEL[wsStatus] ?? 'Syncing…' : 'Offline'}
    </span>
  );
}
