import { memo, useState } from 'react';
import { useChartLiveTick } from '../../hooks/useChartLiveTick';
import { getLiveQuote } from '../../services/symbolLiveService';

/** Header quote only — re-renders locally, not the whole charts workspace */
function LiveQuoteBadge({ symbol, className = '' }: { symbol: string; className?: string }) {
  const [, bump] = useState(0);
  useChartLiveTick(() => bump((n) => n + 1), 500, true);

  const q = getLiveQuote(symbol);
  if (!q) return null;

  return (
    <span
      className={`text-xs font-bold ${q.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'} ${className}`}
    >
      {q.price.toLocaleString('en-IN')}
    </span>
  );
}

export default memo(LiveQuoteBadge);
