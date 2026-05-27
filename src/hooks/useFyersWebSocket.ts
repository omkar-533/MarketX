import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FyersConnectionPayload,
  FyersMarketQuote,
  FyersWsConnectionStatus,
} from '../types/fyersMarket';
import {
  forceFyersReconnect,
  getFyersCachedQuote,
  getFyersConnectionStatus,
  onFyersConnectionStatus,
  onFyersMarketTicks,
  onFyersTokenInvalid,
  startFyersSocketClient,
  subscribeFyersMarketSymbols,
  unsubscribeFyersMarketSymbols,
} from '../services/fyersSocketClient';

export type UseFyersWebSocketOptions = {
  /** Subscribe to these symbols (ref-counted, safe across mounts) */
  symbols?: string[];
  /** Start Socket.IO client on mount (default true) */
  autoConnect?: boolean;
  /** Navigate to login when token invalid */
  onTokenInvalid?: () => void;
};

export type UseFyersWebSocketResult = {
  status: FyersWsConnectionStatus;
  connected: boolean;
  connection: FyersConnectionPayload | null;
  quotes: Record<string, FyersMarketQuote>;
  getQuote: (symbol: string) => FyersMarketQuote | undefined;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
  reconnect: () => void;
};

/**
 * React hook for FYERS live data via backend Socket.IO (single shared connection).
 */
export function useFyersWebSocket(options: UseFyersWebSocketOptions = {}): UseFyersWebSocketResult {
  const { symbols = [], autoConnect = true, onTokenInvalid } = options;
  const symKey = useMemo(
    () => [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].sort().join(','),
    [symbols],
  );

  const [connection, setConnection] = useState<FyersConnectionPayload | null>(null);
  const [quotes, setQuotes] = useState<Record<string, FyersMarketQuote>>({});
  const subscribedRef = useRef<string[]>([]);

  useEffect(() => {
    if (!autoConnect) return;
    const stop = startFyersSocketClient();
    return stop;
  }, [autoConnect]);

  useEffect(() => {
    const unsubStatus = onFyersConnectionStatus(setConnection);
    const unsubTick = onFyersMarketTicks((payload) => {
      setQuotes((prev) => {
        const next = { ...prev };
        for (const q of payload.quotes) {
          next[q.symbol] = q;
        }
        return next;
      });
    });
    const unsubToken = onFyersTokenInvalid(() => {
      onTokenInvalid?.();
    });
    return () => {
      unsubStatus();
      unsubTick();
      unsubToken();
    };
  }, [onTokenInvalid]);

  useEffect(() => {
    const list = symKey ? symKey.split(',') : [];
    const prev = subscribedRef.current;
    if (prev.length) unsubscribeFyersMarketSymbols(prev);
    if (list.length) subscribeFyersMarketSymbols(list);
    subscribedRef.current = list;
    return () => {
      if (list.length) unsubscribeFyersMarketSymbols(list);
      subscribedRef.current = [];
    };
  }, [symKey]);

  const subscribe = useCallback((syms: string[]) => {
    subscribeFyersMarketSymbols(syms);
  }, []);

  const unsubscribe = useCallback((syms: string[]) => {
    unsubscribeFyersMarketSymbols(syms);
  }, []);

  const getQuote = useCallback((symbol: string) => {
    const sym = symbol.trim().toUpperCase();
    return quotes[sym] ?? getFyersCachedQuote(sym);
  }, [quotes]);

  const reconnect = useCallback(() => {
    forceFyersReconnect();
  }, []);

  const status = connection?.status ?? getFyersConnectionStatus();

  return {
    status,
    connected: connection?.connected ?? status === 'connected',
    connection,
    quotes,
    getQuote,
    subscribe,
    unsubscribe,
    reconnect,
  };
}
