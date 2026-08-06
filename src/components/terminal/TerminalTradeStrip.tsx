import { useEffect, useId, useMemo, useState } from 'react';
import {
  getFyersCachedQuote,
  onFyersMarketTicks,
  startFyersSocketClient,
  subscribeFyersMarketSymbols,
  unsubscribeFyersMarketSymbols,
} from '../../services/fyersSocketClient';
import { fetchMarketQuotes } from '../../services/marketApiService';
import { apiSymbolFromTv, tradingViewSymbolLabel } from '../../utils/tradingViewSymbols';

export type TerminalTradeStripProps = {
  symbol: string;
  onTrade?: (side: 'BUY' | 'SELL', qty: number, price?: number) => void;
  /** Embed under chart symbol legend (default look). */
  variant?: 'legend' | 'bar';
  className?: string;
};

function fmt(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n >= 1000
    ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    : n.toFixed(n >= 100 ? 2 : 4);
}

/** Compact Sell / Buy strip — Paper Trading handoff. */
export default function TerminalTradeStrip({
  symbol,
  onTrade,
  variant = 'legend',
  className = '',
}: TerminalTradeStripProps) {
  const qtyId = useId();
  const api = useMemo(() => apiSymbolFromTv(symbol), [symbol]);
  const label = useMemo(() => tradingViewSymbolLabel(symbol), [symbol]);
  const [price, setPrice] = useState(0);
  const [qty, setQty] = useState('1');

  useEffect(() => {
    startFyersSocketClient();
    subscribeFyersMarketSymbols([api]);
    const c = getFyersCachedQuote(api);
    if (c?.price) setPrice(c.price);

    const unsub = onFyersMarketTicks((payload) => {
      for (const q of payload.quotes) {
        const key = String(q.symbol || '')
          .toUpperCase()
          .replace(/^NSE:|^BSE:|^MCX:/, '');
        if (key === api || q.symbol.toUpperCase() === api) {
          setPrice(q.price);
        }
      }
    });

    const poll = window.setInterval(() => {
      if (document.hidden) return;
      void fetchMarketQuotes([api]).then((res) => {
        const q = res?.quotes?.[0];
        if (q?.price) setPrice(q.price);
      });
    }, 4000);

    return () => {
      unsub();
      unsubscribeFyersMarketSymbols([api]);
      window.clearInterval(poll);
    };
  }, [api]);

  const px = fmt(price);
  const qtyNum = Math.max(1, Number(qty) || 1);

  return (
    <div
      className={`wolf-term__trade wolf-term__trade--${variant} ${className}`.trim()}
      aria-label="Quick trade"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="wolf-term__trade-sell"
        title={`Paper sell ${label}`}
        onClick={() => onTrade?.('SELL', qtyNum, price > 0 ? price : undefined)}
      >
        <em>S</em>
        <span>{px}</span>
      </button>

      <div className="wolf-term__trade-mid">
        <input
          id={qtyId}
          className="wolf-term__trade-qty"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
          aria-label="Quantity"
          inputMode="decimal"
          title="Quantity"
        />
      </div>

      <button
        type="button"
        className="wolf-term__trade-buy"
        title={`Paper buy ${label}`}
        onClick={() => onTrade?.('BUY', qtyNum, price > 0 ? price : undefined)}
      >
        <em>B</em>
        <span>{px}</span>
      </button>
    </div>
  );
}
