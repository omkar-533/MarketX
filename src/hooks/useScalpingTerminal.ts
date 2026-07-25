import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FyersMarketQuote } from '../types/fyersMarket';
import { onFyersMarketTicks } from '../services/fyersSocketClient';
import { fetchOptionChainLive } from '../services/optionChainLiveService';
import {
  analyzeScalpingTerminal,
  pushTick,
  type ScalpingAnalysis,
  type TickPoint,
} from '../services/scalpingTerminalEngine';
import { useLtpCalculatorLive } from './useLtpCalculatorLive';

export type ChainStrikeRow = {
  strike: number;
  ceLtp: number;
  peLtp: number;
  ceOi: number;
  peOi: number;
  ceOiChg: number;
  peOiChg: number;
};

export type TerminalAlert = {
  id: string;
  at: number;
  message: string;
  type: string;
};

function quoteToTick(q: FyersMarketQuote | null, fallback?: TickPoint): TickPoint | null {
  if (!q?.price) return fallback ?? null;
  return {
    at: Date.now(),
    price: q.price,
    volume: q.volume ?? 0,
    oi: q.oi ?? 0,
    oiChange: q.oiChange ?? 0,
    bid: q.bid ?? q.price,
    ask: q.ask ?? q.price,
    changePct: q.changePercent ?? 0,
  };
}

function playAlertTone() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    /* ignore */
  }
}

export function useScalpingTerminal(symbol: string, liveEnabled: boolean, soundAlerts: boolean) {
  const live = useLtpCalculatorLive(symbol, liveEnabled);
  const [ticks, setTicks] = useState<TickPoint[]>([]);
  const [premiumSeries, setPremiumSeries] = useState<number[]>([]);
  const [chainRows, setChainRows] = useState<ChainStrikeRow[]>([]);
  const [alerts, setAlerts] = useState<TerminalAlert[]>([]);
  const lastSignalRef = useRef<string>('HOLD');

  const sym = symbol.trim().toUpperCase();

  const pushFromQuote = useCallback((q: FyersMarketQuote | null) => {
    const tick = quoteToTick(q);
    if (!tick) return;
    setTicks((prev) => pushTick(prev, tick));
    setPremiumSeries((prev) => [...prev, tick.price].slice(-30));
  }, []);

  useEffect(() => {
    setTicks([]);
    setPremiumSeries([]);
    setChainRows([]);
  }, [sym]);

  useEffect(() => {
    if (!live.quote) return;
    pushFromQuote({
      symbol: sym,
      price: live.quote.price,
      change: live.quote.change,
      changePercent: live.quote.changePercent,
      open: live.quote.open,
      high: live.quote.high,
      low: live.quote.low,
      prevClose: live.quote.prevClose,
      volume: live.quote.volume,
      lastUpdated: live.quote.lastUpdated,
    });
  }, [live.quote, sym, pushFromQuote]);

  useEffect(() => {
    if (!liveEnabled || !sym) return;
    const unsub = onFyersMarketTicks((payload) => {
      const q = payload.quotes.find((x) => x.symbol.toUpperCase() === sym);
      if (q) pushFromQuote(q);
    });
    return unsub;
  }, [sym, liveEnabled, pushFromQuote]);

  useEffect(() => {
    if (!sym || sym.length < 2) return;
    let cancelled = false;
    void fetchOptionChainLive(sym, undefined, { strikeWindow: 7 }).then((snap) => {
      if (cancelled || !snap?.rows?.length) return;
      setChainRows(
        snap.rows.slice(0, 11).map((r) => ({
          strike: r.strike,
          ceLtp: r.ceLtp,
          peLtp: r.peLtp,
          ceOi: r.ceOi,
          peOi: r.peOi,
          ceOiChg: r.ceOiChg,
          peOiChg: r.peOiChg,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [sym]);

  const analysis: ScalpingAnalysis = useMemo(
    () =>
      analyzeScalpingTerminal(ticks, {
        vwap: live.quote?.vwap,
        changePct: live.quote?.changePercent,
        premiumSeries,
      }),
    [ticks, live.quote?.vwap, live.quote?.changePercent, premiumSeries],
  );

  useEffect(() => {
    const sig = analysis.signal;
    if (sig === lastSignalRef.current) return;
    const prev = lastSignalRef.current;
    lastSignalRef.current = sig;

    if (sig === 'STRONG BUY' || sig === 'STRONG SELL') {
      const msg = `${sym} · ${sig} · Momentum ${analysis.momentum}%`;
      setAlerts((a) => [{ id: `${Date.now()}`, at: Date.now(), message: msg, type: sig }, ...a].slice(0, 12));
      if (soundAlerts && (prev !== 'STRONG BUY' && prev !== 'STRONG SELL')) playAlertTone();
    }
    for (const t of analysis.alerts) {
      setAlerts((a) => {
        if (a[0]?.type === t && Date.now() - a[0].at < 8000) return a;
        return [
          { id: `${Date.now()}-${t}`, at: Date.now(), message: `${sym}: ${t}`, type: t },
          ...a,
        ].slice(0, 12);
      });
    }
  }, [analysis.signal, analysis.alerts, analysis.momentum, sym, soundAlerts]);

  return {
    ...live,
    ticks,
    analysis,
    chainRows,
    spot: live.quote?.price ?? 0,
    alerts,
    premiumSeries,
    clearAlerts: () => setAlerts([]),
  };
}
