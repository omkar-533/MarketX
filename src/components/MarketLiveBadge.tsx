import { useEffect, useState } from 'react';
import { useBrokerSession } from '../hooks/useBrokerSession';
import { getMarketLiveState, subscribeMarketLive } from '../services/marketLiveStore';
import {
  API_SERVER_READY_EVENT,
  API_CONNECT_STATUS_EVENT,
} from '../services/apiAutoConnect';
import {
  getFyersWsStatus,
  getMarketConnectionState,
  isMarketStreamActive,
  subscribeMarketConnection,
  MARKET_CONNECTION_EVENT,
} from '../services/marketConnection';
import {
  BRAND,
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

  useEffect(() => {
    const onConn = () => bump((n) => n + 1);
    window.addEventListener(API_CONNECT_STATUS_EVENT, onConn);
    window.addEventListener(API_SERVER_READY_EVENT, onConn);
    window.addEventListener(MARKET_CONNECTION_EVENT, onConn);
    const unsub = subscribeMarketConnection(onConn);
    return () => {
      window.removeEventListener(API_CONNECT_STATUS_EVENT, onConn);
      window.removeEventListener(API_SERVER_READY_EVENT, onConn);
      window.removeEventListener(MARKET_CONNECTION_EVENT, onConn);
      unsub();
    };
  }, []);

  const { session } = useBrokerSession(true);
  const { mode, liveCount, error } = getMarketLiveState();
  const wsStatus = getFyersWsStatus();
  const conn = getMarketConnectionState();
  const stream = isMarketStreamActive();
  const wsBusy = wsStatus === 'connecting' || wsStatus === 'reconnecting';
  const needsConnect =
    session.needsLogin ||
    wsStatus === 'token_invalid' ||
    (conn.serverOk && !conn.fyersConnected && !wsBusy);

  // Live-data connect CTA temporarily hidden
  if (needsConnect) return null;

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

  if (!conn.serverOk) return null;

  if (wsBusy) {
    return (
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 animate-pulse"
        title="Linking live market stream…"
      >
        {WS_LABEL[wsStatus] ?? 'Connecting live…'}
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
