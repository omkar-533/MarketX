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
  const glow = Boolean(src) && size >= 28;

  return (
    <span
      className={`wolf-stock-logo ${glow ? 'has-glow' : ''} ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.32)) }}
      title={label}
      aria-hidden
    >
      {src && glow ? (
        <img
          className="wolf-stock-logo__glow"
          src={src}
          alt=""
          aria-hidden
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <span className="wolf-stock-logo__disc">
        {src ? (
          <>
            <img
              className="wolf-stock-logo__fill"
              src={src}
              alt=""
              aria-hidden
              decoding="async"
              referrerPolicy="no-referrer"
            />
            <img
              className="wolf-stock-logo__mark"
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setSrcIndex((i) => i + 1)}
            />
          </>
        ) : (
          <span className="wolf-stock-logo__fallback">{initials}</span>
        )}
      </span>
    </span>
  );
}
