import { memo, useState } from 'react';
import { useChartLiveTick } from '../../hooks/useChartLiveTick';
import { getLiveQuote } from '../../services/symbolLiveService';
import type { ChartDataSource, ChartTimeframe } from '../../types/chart';

function ProChartHeader({
  symbol,
  timeframe,
  resolvedSource,
}: {
  symbol: string;
  timeframe: ChartTimeframe;
  resolvedSource: ChartDataSource;
}) {
  const [, bump] = useState(0);
  useChartLiveTick(() => bump((n) => n + 1), 600, true);

  const quote = getLiveQuote(symbol);

  return (
    <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b border-dark-border text-[11px]">
      <span className="font-bold text-gold">{symbol}</span>
      <span className="text-dark-muted">NSE · {timeframe}</span>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded ${
          quote?.dataSource === 'live'
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-dark-elevated text-dark-muted'
        }`}
      >
        {resolvedSource === 'broker'
          ? 'Broker API'
          : quote?.dataSource === 'live'
            ? 'NSE · real OHLC'
            : 'Loading Fyers OHLC…'}
      </span>
      {quote && (
        <>
          <span className="font-bold text-slate-100">{quote.price.toLocaleString('en-IN')}</span>
          <span className={quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {quote.changePercent >= 0 ? '+' : ''}
            {quote.changePercent.toFixed(2)}%
          </span>
        </>
      )}
      {quote && (
        <span className="text-dark-muted ml-auto">
          LTP <span className="text-slate-200">{quote.price}</span>
        </span>
      )}
    </div>
  );
}

export default memo(ProChartHeader);
