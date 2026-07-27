import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';

type LuxCardProps = {
  children: ReactNode;
  className?: string;
  /** Extra classes on the inner body (above plate). */
  bodyClassName?: string;
  /** Gold-tinted featured surface */
  featured?: boolean;
  /** Disable hover lift / ring spin (large shells, tables) */
  staticSurface?: boolean;
  /** Enable cursor spotlight like landing feature cards */
  spotlight?: boolean;
  as?: 'div' | 'article' | 'section';
} & Omit<HTMLAttributes<HTMLElement>, 'children'>;

/**
 * Exact landing-page card chrome: ring + deep plate + optional spotlight.
 * Same visual system as `.auth-lux-feature` / pricing `.plan`.
 */
export default function LuxCard({
  children,
  className = '',
  bodyClassName = '',
  featured = false,
  staticSurface = false,
  spotlight = true,
  as: Tag = 'div',
  onMouseMove,
  onMouseLeave,
  ...rest
}: LuxCardProps) {
  const reduced = useReducedMotion();

  const handleMove = (e: MouseEvent<HTMLElement>) => {
    onMouseMove?.(e);
    if (!spotlight || reduced || staticSurface) return;
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * 100;
    const py = ((e.clientY - box.top) / box.height) * 100;
    el.style.setProperty('--mx', `${px}%`);
    el.style.setProperty('--my', `${py}%`);
  };

  const handleLeave = (e: MouseEvent<HTMLElement>) => {
    onMouseLeave?.(e);
    e.currentTarget.style.removeProperty('--mx');
    e.currentTarget.style.removeProperty('--my');
  };

  return (
    <Tag
      className={[
        'lux-card',
        featured ? 'lux-card--featured' : '',
        staticSurface ? 'lux-card--static' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--mx': '50%', '--my': '40%' } as CSSProperties}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      {...rest}
    >
      <span className="lux-card__ring" aria-hidden="true" />
      <span className="lux-card__plate" aria-hidden="true" />
      {spotlight && !staticSurface ? <span className="lux-card__spot" aria-hidden="true" /> : null}
      <div className={`lux-card__body ${bodyClassName}`.trim()}>{children}</div>
    </Tag>
  );
}
