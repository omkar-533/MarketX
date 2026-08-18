import { useEffect, useMemo, useState } from 'react';
import { nseLogoSymbol, stockLogoInitials, stockLogoSources } from '../../../services/opportunity/stockLogo';

type Props = {
  symbol: string;
  size?: number;
  className?: string;
};

export default function StockLogoMark({ symbol, size = 36, className = '' }: Props) {
  const sources = useMemo(() => stockLogoSources(symbol), [symbol]);
  const [srcIndex, setSrcIndex] = useState(0);

  useEffect(() => {
    setSrcIndex(0);
  }, [symbol]);

  const src = sources[srcIndex];
  const initials = stockLogoInitials(symbol);
  const label = nseLogoSymbol(symbol);

  return (
    <span
      className={`wolf-stock-logo ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) }}
      title={label}
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setSrcIndex((i) => i + 1)}
        />
      ) : (
        <span className="wolf-stock-logo__fallback">{initials}</span>
      )}
    </span>
  );
}
