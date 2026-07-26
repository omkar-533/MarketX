import brandLogoUrl from '../assets/brand/brand-logo.png';
import brandMarkUrl from '../assets/brand/brand-mark.png';
import { BRAND } from '../constants/brandLabels';

type BrandMarkProps = {
  className?: string;
  imgClassName?: string;
  /** sm = sidebar, md = auth nav, lg = wide nav */
  size?: 'sm' | 'md' | 'lg';
  /** Square emblem only (collapsed sidebar / favicon-style) */
  iconOnly?: boolean;
  title?: string;
};

const fullWrap = {
  sm: 'h-9 w-auto max-w-[9.5rem]',
  md: 'h-10 sm:h-11 w-auto max-w-[12rem] sm:max-w-[14rem]',
  lg: 'h-11 w-auto max-w-[15rem]',
} as const;

const iconWrap = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9 sm:w-10 sm:h-10',
  lg: 'w-10 h-10',
} as const;

/** Full APMI logo — Vite-bundled so it always ships */
export default function BrandMark({
  className = '',
  imgClassName = '',
  size = 'md',
  iconOnly = false,
  title = BRAND,
}: BrandMarkProps) {
  if (iconOnly) {
    return (
      <div
        className={`${iconWrap[size]} rounded-xl overflow-hidden shrink-0 ring-1 ring-gold/25 bg-[#0a0e17] ${className}`}
        title={title}
      >
        <img
          src={brandMarkUrl}
          alt={BRAND}
          className={`w-full h-full object-cover ${imgClassName}`}
          width={80}
          height={80}
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div className={`${fullWrap[size]} shrink-0 overflow-hidden rounded-lg ${className}`} title={title}>
      <img
        src={brandLogoUrl}
        alt={BRAND}
        className={`block h-full w-auto max-w-full object-contain object-left ${imgClassName}`}
        width={320}
        height={174}
        decoding="async"
      />
    </div>
  );
}
