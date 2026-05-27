import { useEffect, useState } from 'react';
import { getMarketLiveState, subscribeMarketLive } from '../services/marketLiveStore';
import {
  getFyersWsStatus,
  getMarketConnectionState,
  isMarketStreamActive,
} from '../services/marketConnection';

const WS_LABEL: Record<string, string> = {
  connected: 'Fyers WS Live',
  connecting: 'WS Connecting…',
  reconnecting: 'WS Reconnecting…',
  token_invalid: 'Fyers Login Required',
  degraded: 'WS Degraded',
  disconnected: 'WS Offline',
};

export default function MarketLiveBadge() {
  const [, bump] = useState(0);

  useEffect(() => subscribeMarketLive(() => bump((n) => n + 1)), []);

  const { mode, liveCount, error, provider } = getMarketLiveState();
  const wsStatus = getFyersWsStatus();
  const conn = getMarketConnectionState();
  const isFyers = provider === 'fyers';
  const stream = isMarketStreamActive();

  if (wsStatus === 'token_invalid') {
    return (
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300"
        title="Fyers token expired — reconnect in Profile"
      >
        Fyers Login
      </span>
    );
  }

  if (mode === 'live') {
    const label = stream ? WS_LABEL[wsStatus] ?? 'Socket.IO Live' : isFyers ? 'Fyers REST' : 'NSE Live';
    const ok = wsStatus === 'connected' && stream;
    return (
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
          ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-gold/30 bg-gold/10 text-gold'
        }`}
        title={`${liveCount} symbols · ${label} · ${conn.provider}`}
      >
        {label}
      </span>
    );
  }

  if (provider === 'fyers-offline') {
    return (
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300"
        title="Connect Fyers in Profile"
      >
        Fyers required
      </span>
    );
  }

  if (mode === 'mixed') {
    return (
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded border border-gold/30 bg-gold/10 text-gold"
        title={error || 'Partial live feed'}
      >
        Live+ ({liveCount})
      </span>
    );
  }

  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400"
      title={error || conn.wsLastError || 'API server offline — npm run dev:all'}
    >
      {stream ? WS_LABEL[wsStatus] ?? 'WS wait' : 'API offline'}
    </span>
  );
}
