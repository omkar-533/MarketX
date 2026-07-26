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
  sm: 'w-10 h-10',
  md: 'w-11 h-11 sm:w-12 sm:h-12',
  lg: 'w-14 h-14',
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
      className={`brand-mark brand-mark--square ${sizeClass[size]} shrink-0 ${className}`}
      title={title}
    >
      <img
        src={brandLogoUrl}
        alt={BRAND}
        className={`brand-logo-blend brand-logo-blend--square ${imgClassName}`}
        width={128}
        height={128}
        decoding="async"
      />
    </div>
  );
}
