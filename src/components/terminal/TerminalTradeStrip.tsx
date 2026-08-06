import { useEffect, useMemo, useState } from 'react';
import {
  getFyersCachedQuote,
  onFyersMarketTicks,
  startFyersSocketClient,
  subscribeFyersMarketSymbols,
  unsubscribeFyersMarketSymbols,
} from '../../services/fyersSocketClient';
import { fetchMarketQuotes } from '../../services/marketApiService';
import { apiSymbolFromTv } from '../../utils/tradingViewSymbols';

export type TerminalTradeStripProps = {
  symbol: string;
  onTrade?: (side: 'BUY' | 'SELL', qty: number) => void;
};

function fmt(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n >= 1000
    ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    : n.toFixed(n >= 100 ? 2 : 4);
}

/** Floating Sell / Buy strip — routes to Paper Trading. */
export default function TerminalTradeStrip({ symbol, onTrade }: TerminalTradeStripProps) {
  const api = useMemo(() => apiSymbolFromTv(symbol), [symbol]);
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
    <div className="wolf-term__trade" aria-label="Quick trade">
      <button
        type="button"
        className="wolf-term__trade-sell"
        title="Paper sell"
        onClick={() => onTrade?.('SELL', qtyNum)}
      >
        <span>Sell</span>
        <b>{px}</b>
      </button>
      <input
        className="wolf-term__trade-qty"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
        aria-label="Quantity"
        inputMode="decimal"
      />
      <button
        type="button"
        className="wolf-term__trade-buy"
        title="Paper buy"
        onClick={() => onTrade?.('BUY', qtyNum)}
      >
        <span>Buy</span>
        <b>{px}</b>
      </button>
    </div>
  );
}
