import brandMarkUrl from '../assets/brand/brand-mark.png';
import { BRAND } from '../constants/brandLabels';

type BrandMarkProps = {
  className?: string;
  imgClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
};

const sizeClass = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9 sm:w-10 sm:h-10',
  lg: 'w-10 h-10',
} as const;

/** App brand emblem — Vite-bundled so it always ships in /assets */
export default function BrandMark({
  className = '',
  imgClassName = '',
  size = 'md',
  title = BRAND,
}: BrandMarkProps) {
  return (
    <div
      className={`${sizeClass[size]} rounded-xl overflow-hidden shrink-0 shadow-lg shadow-gold/20 ring-1 ring-gold/25 bg-[#0a0e17] ${className}`}
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
