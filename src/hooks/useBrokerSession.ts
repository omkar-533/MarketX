import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../config/api';
import { refreshMarketConnection } from '../services/marketConnection';
import { FYERS_MARKET_LIVE_EVENT } from '../services/apiAutoConnect';

export type BrokerSession = {
  loading: boolean;
  broker: string;
  brokerConnected: boolean;
  configured: boolean;
  hasToken: boolean;
  sessionActive: boolean;
  wsStatus: string;
  wsConnected: boolean;
  needsLogin: boolean;
  autoReconnect: boolean;
  redirectUri: string;
};

const defaultState: BrokerSession = {
  loading: true,
  broker: 'fyers',
  brokerConnected: false,
  configured: false,
  hasToken: false,
  sessionActive: false,
  wsStatus: 'disconnected',
  wsConnected: false,
  needsLogin: true,
  autoReconnect: true,
  redirectUri: '',
};

export function useBrokerSession(enabled = true) {
  const [session, setSession] = useState<BrokerSession>(defaultState);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSession({ ...defaultState, loading: false });
      return;
    }
    try {
      const res = await apiFetch('/api/auth/session');
      if (!res.ok) {
        setSession((s) => ({ ...s, loading: false, needsLogin: true }));
        return;
      }
      const data = await res.json();
      setSession({
        loading: false,
        broker: data.broker || 'fyers',
        brokerConnected: Boolean(data.brokerConnected),
        configured: Boolean(data.configured),
        hasToken: Boolean(data.hasToken),
        sessionActive: Boolean(data.sessionActive),
        wsStatus: data.wsStatus || 'disconnected',
        wsConnected: Boolean(data.wsConnected),
        needsLogin: Boolean(data.needsLogin),
        autoReconnect: Boolean(data.autoReconnect ?? true),
        redirectUri: data.redirectUri || '',
      });
      if (data.brokerConnected) {
        window.dispatchEvent(new CustomEvent(FYERS_MARKET_LIVE_EVENT));
      }
      await refreshMarketConnection();
    } catch {
      setSession((s) => ({ ...s, loading: false }));
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 12_000);
    const onLive = () => void refresh();
    window.addEventListener(FYERS_MARKET_LIVE_EVENT, onLive);
    return () => {
      clearInterval(id);
      window.removeEventListener(FYERS_MARKET_LIVE_EVENT, onLive);
    };
  }, [refresh]);

  const startBrokerLogin = useCallback(() => {
    const base = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') || '';
    window.location.href = `${base}/api/auth/fyers/login`;
  }, []);

  return { session, refresh, startBrokerLogin };
}
