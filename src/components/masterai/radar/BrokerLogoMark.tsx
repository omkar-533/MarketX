/** Stylized broker marks — original monograms, not scraped brand assets. */
import { useId } from 'react';

type Props = { id: string; name?: string; className?: string };

export default function BrokerLogoMark({ id, name = '', className = '' }: Props) {
  const uid = useId().replace(/:/g, '');
  const key = id.toLowerCase();
  const label = name || id;

  if (key.includes('demo') || key === 'mock-demo') {
    const gid = `mdDemo-${uid}`;
    return (
      <span className={`wolf-md-logo wolf-md-logo--demo ${className}`} aria-hidden>
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill={`url(#${gid})`} />
          <path
            d="M12 26V14h3.2l2.6 7.4L20.4 14H24v12h-2.4v-7.2L18.8 26h-2.1l-2.7-7.1V26H12z"
            fill="#1a1205"
          />
          <defs>
            <linearGradient id={gid} x1="6" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f0d78c" />
              <stop offset="1" stopColor="#b8860b" />
            </linearGradient>
          </defs>
        </svg>
      </span>
    );
  }

  if (key.includes('indstock') || key.includes('indmoney')) {
    return (
      <span className={`wolf-md-logo wolf-md-logo--ind ${className}`} aria-hidden title={label}>
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill="#0B3B2E" />
          <circle cx="20" cy="20" r="11" stroke="#3DDC97" strokeWidth="1.5" opacity="0.55" />
          <path d="M13 24.5 18.2 14h3.6L27 24.5h-3.1l-.9-2H17l-.9 2H13zm4.7-4.2h3.6L20.5 16l-2.8 4.3z" fill="#E8FFF4" />
        </svg>
      </span>
    );
  }

  if (key.includes('sahi')) {
    return (
      <span className={`wolf-md-logo wolf-md-logo--sahi ${className}`} aria-hidden title={label}>
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill="#1B1F3B" />
          <path
            d="M12 20c0-4.4 3.2-7.2 8-7.2 3.2 0 5.7 1.3 7 3.4l-2.6 1.5c-.8-1.3-2.3-2.1-4.4-2.1-2.7 0-4.6 1.6-4.6 4.4s1.9 4.4 4.6 4.4c2.1 0 3.6-.8 4.4-2.1l2.6 1.5c-1.3 2.1-3.8 3.4-7 3.4-4.8 0-8-2.8-8-7.2z"
            fill="#8B9CFF"
          />
        </svg>
      </span>
    );
  }

  if (key.includes('zerodha') || key.includes('kite')) {
    return (
      <span className={`wolf-md-logo wolf-md-logo--zerodha ${className}`} aria-hidden title={label}>
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill="#387ED1" />
          <path d="M10 27 20 9l10 18H10zm4.2-2.4h11.6L20 14.2 14.2 24.6z" fill="#fff" />
        </svg>
      </span>
    );
  }

  if (key.includes('upstox')) {
    return (
      <span className={`wolf-md-logo wolf-md-logo--upstox ${className}`} aria-hidden title={label}>
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill="#5A28FF" />
          <path d="M12 12h4.2l3.8 9.2L23.8 12H28L21.2 28h-4.4L12 12z" fill="#fff" />
        </svg>
      </span>
    );
  }

  const initial = (label.trim()[0] || '?').toUpperCase();
  return (
    <span className={`wolf-md-logo wolf-md-logo--fallback ${className}`} aria-hidden title={label}>
      <svg viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="11" fill="rgba(212,175,55,0.16)" stroke="rgba(212,175,55,0.45)" />
        <text x="20" y="25" textAnchor="middle" fontSize="16" fontWeight="700" fill="#e8c547">
          {initial}
        </text>
      </svg>
    </span>
  );
}
