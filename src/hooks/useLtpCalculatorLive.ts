import { useCallback, useEffect, useState } from 'react';
import { getFnoInstrument } from '../data/fnoUniverse';
import { useAutoRefresh } from './useAutoRefresh';
import { subscribeLiveSymbols } from '../services/marketTickStream';
import {
  getLiveQuote,
  refreshFnoLiveQuotes,
  searchFnoSymbols,
  type LiveSymbolQuote,
} from '../services/symbolLiveService';
import { getFyersWsStatus, getMarketConnectionState } from '../services/marketConnection';

export function useLtpCalculatorLive(symbol: string, liveEnabled: boolean) {
  const [quote, setQuote] = useState<LiveSymbolQuote | null>(null);
  const [flash, setFlash] = useState(false);

  const sym = symbol.trim().toUpperCase();

  const refresh = useCallback(() => {
    if (!sym) {
      setQuote(null);
      return;
    }
    refreshFnoLiveQuotes();
    subscribeLiveSymbols([sym]);
    const q = getLiveQuote(sym);
    if (q) {
      setQuote((prev) => {
        if (prev && prev.price !== q.price) {
          setFlash(true);
          setTimeout(() => setFlash(false), 320);
        }
        return q;
      });
    }
  }, [sym]);

  useEffect(() => {
    refresh();
  }, [refresh, liveEnabled]);

  useAutoRefresh(() => {
    if (liveEnabled) refresh();
  }, liveEnabled);

  const inst = sym ? getFnoInstrument(sym) : undefined;
  const conn = getMarketConnectionState();
  const wsStatus = getFyersWsStatus();

  return {
    quote,
    flash,
    lotSize: inst?.lotSize ?? 1,
    instrumentName: inst?.name ?? sym,
    instrumentType: inst?.type ?? 'stock',
    search: searchFnoSymbols,
    connected: conn.serverOk && (conn.fyersConnected || wsStatus === 'connected'),
    wsStatus,
    refresh,
  };
}
