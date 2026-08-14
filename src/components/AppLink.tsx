import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { isPlainLeftClick, tabHref, type AppNavQuery } from '../utils/appNav';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  query?: AppNavQuery;
  /** Same-tab SPA navigation. Ctrl/⌘/middle/right-click keep the native browser behavior. */
  onActivate?: () => void;
  children?: ReactNode;
};

export default function AppLink({
  to,
  query,
  onActivate,
  className = '',
  children,
  onClick,
  ...rest
}: Props) {
  const href = tabHref(to, query);
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (!isPlainLeftClick(e)) return;
    onActivate?.();
    // Same-tab SPA handlers already change the hash. Native click is kept when
    // there is no handler so right-click AND left-click both use the href.
    if (onActivate) e.preventDefault();
  };

  return (
    <a href={href} className={`app-nav-link ${className}`.trim()} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
