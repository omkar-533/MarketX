import brandMarkUrl from '../assets/brand/wolf-mark.svg';
import { BRAND } from '../constants/brandLabels';

type BrandMarkProps = {
  className?: string;
  imgClassName?: string;
  /** sm = sidebar, md = auth nav, lg = wide nav */
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
  title?: string;
};

const sizeClass = {
  sm: 'w-9 h-9',
  md: 'w-10 h-10 sm:w-11 sm:h-11',
  lg: 'w-12 h-12',
} as const;

/** Wolf Trade AI emblem — transparent vector, crisp at any size. */
export default function BrandMark({
  className = '',
  imgClassName = '',
  size = 'md',
  iconOnly: _iconOnly = false,
  title = BRAND,
}: BrandMarkProps) {
  return (
    <div className={`brand-mark ${sizeClass[size]} shrink-0 ${className}`} title={title}>
      <img
        src={brandMarkUrl}
        alt={BRAND}
        className={`brand-logo ${imgClassName}`}
        width={64}
        height={64}
        decoding="async"
      />
    </div>
  );
}
