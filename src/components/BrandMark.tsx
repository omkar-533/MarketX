import brandMarkUrl from '../assets/brand/wolf-mark.svg';
import { BRAND } from '../constants/brandLabels';

type BrandMarkProps = {
  className?: string;
  imgClassName?: string;
  nameClassName?: string;
  /** sm = sidebar, md = auth nav, lg = wide nav */
  size?: 'sm' | 'md' | 'lg';
  /** Logo only — use when the name is already rendered beside this mark. */
  iconOnly?: boolean;
  title?: string;
};

const sizeClass = {
  sm: 'w-9 h-9',
  md: 'w-10 h-10 sm:w-11 sm:h-11',
  lg: 'w-12 h-12',
} as const;

/** Wolf Trade AI emblem — name sits to the right in large letters when not icon-only. */
export default function BrandMark({
  className = '',
  imgClassName = '',
  nameClassName = '',
  size = 'md',
  iconOnly = false,
  title = BRAND,
}: BrandMarkProps) {
  return (
    <div
      className={`brand-lockup ${iconOnly ? 'brand-lockup--icon' : ''} ${className}`}
      title={title}
    >
      <div className={`brand-mark ${sizeClass[size]} shrink-0`}>
        <img
          src={brandMarkUrl}
          alt={iconOnly ? BRAND : ''}
          className={`brand-logo ${imgClassName}`}
          width={64}
          height={64}
          decoding="async"
        />
      </div>
      {!iconOnly ? (
        <span className={`brand-lockup__name brand-lockup__name--${size} ${nameClassName}`}>
          {BRAND}
        </span>
      ) : null}
    </div>
  );
}
