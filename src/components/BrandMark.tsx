import brandLogoUrl from '../assets/brand/brand-logo.png';
import { BRAND } from '../constants/brandLabels';

type BrandMarkProps = {
  className?: string;
  imgClassName?: string;
  /** sm = sidebar, md = auth nav, lg = wide nav */
  size?: 'sm' | 'md' | 'lg';
  /** Same circular emblem (logo is already a round badge) */
  iconOnly?: boolean;
  title?: string;
};

const sizeClass = {
  sm: 'w-9 h-9',
  md: 'w-10 h-10 sm:w-11 sm:h-11',
  lg: 'w-12 h-12',
} as const;

/** Wolf Trade AI emblem — black plate blends into dark UI via lighten */
export default function BrandMark({
  className = '',
  imgClassName = '',
  size = 'md',
  iconOnly: _iconOnly = false,
  title = BRAND,
}: BrandMarkProps) {
  return (
    <div
      className={`brand-mark ${sizeClass[size]} shrink-0 ${className}`}
      title={title}
    >
      <img
        src={brandLogoUrl}
        alt={BRAND}
        className={`brand-logo-blend brand-logo-blend--round ${imgClassName}`}
        width={128}
        height={128}
        decoding="async"
      />
    </div>
  );
}
