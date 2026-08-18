import { useEffect, useMemo, useState } from 'react';
import {
  nseLogoSymbol,
  probeLogoBoxFill,
  readCachedLogoBoxFill,
  stockLogoInitials,
  stockLogoSources,
  type LogoBoxFill,
} from '../../../services/opportunity/stockLogo';

type Props = {
  symbol: string;
  size?: number;
  className?: string;
};

export default function StockLogoMark({ symbol, size = 36, className = '' }: Props) {
  const sources = useMemo(() => stockLogoSources(symbol), [symbol]);
  const [srcIndex, setSrcIndex] = useState(0);
  const src = sources[srcIndex];
  const [box, setBox] = useState<LogoBoxFill | null>(() =>
    src ? readCachedLogoBoxFill(src) ?? null : null,
  );

  useEffect(() => {
    setSrcIndex(0);
  }, [symbol]);

  useEffect(() => {
    if (!src) {
      setBox(null);
      return;
    }
    const cached = readCachedLogoBoxFill(src);
    if (cached !== undefined) {
      setBox(cached);
      return;
    }
    let alive = true;
    setBox(null);
    void probeLogoBoxFill(src).then((found) => {
      if (alive) setBox(found);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  const initials = stockLogoInitials(symbol);
  const label = nseLogoSymbol(symbol);
  const glow = Boolean(src) && size >= 28;
  const markSrc = box?.cropSrc || src;

  return (
    <span
      className={`wolf-stock-logo ${glow ? 'has-glow' : ''} ${box ? 'is-box' : ''} ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.32)) }}
      title={label}
      aria-hidden
    >
      {markSrc && glow ? (
        <img
          className="wolf-stock-logo__glow"
          src={markSrc}
          alt=""
          aria-hidden
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <span
        className="wolf-stock-logo__disc"
        style={box ? { backgroundColor: box.fill } : undefined}
      >
        {src ? (
          <img
            className="wolf-stock-logo__mark"
            src={markSrc}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setSrcIndex((i) => i + 1)}
          />
        ) : (
          <span className="wolf-stock-logo__fallback">{initials}</span>
        )}
      </span>
    </span>
  );
}
