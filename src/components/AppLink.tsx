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
    if (!onActivate) return;
    e.preventDefault();
    // Apply the real hash first so LIVE WOLF / Radar boot from ?symbol= instead of NIFTY.
    if (href.startsWith('#')) {
      const next = `${window.location.pathname}${window.location.search}${href}`;
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (here !== next) {
        window.history.pushState({ tab: to }, '', next);
      }
    }
    onActivate();
  };

  return (
    <a href={href} className={`app-nav-link ${className}`.trim()} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
