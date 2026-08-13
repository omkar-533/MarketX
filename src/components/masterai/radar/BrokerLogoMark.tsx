/** Broker marks — live favicons when available, original SVG fallbacks otherwise. */
import { useState, type ReactNode } from 'react';

type Props = { id: string; name?: string; className?: string };

const DOMAINS: Record<string, string> = {
  indstocks: 'indstocks.com',
  zerodha: 'zerodha.com',
  groww: 'groww.in',
  upstox: 'upstox.com',
  angelone: 'angelone.in',
  dhan: 'dhan.co',
  fyers: 'fyers.in',
  '5paisa': '5paisa.com',
  aliceblue: 'aliceblueonline.com',
  motilal: 'motilaloswal.com',
  icicidirect: 'icicidirect.com',
  hdfcsec: 'hdfcsec.com',
  kotaksec: 'kotaksecurities.com',
  sharekhan: 'sharekhan.com',
  iifl: 'iiflsecurities.com',
  paytmmoney: 'paytmmoney.com',
  samco: 'samco.in',
  axisdirect: 'axisdirect.in',
  sbisec: 'sbisecurities.in',
  mstock: 'mstock.com',
  shoonya: 'shoonya.com',
  geojit: 'geojit.com',
  choice: 'choiceindia.com',
  nuvama: 'nuvamawealth.com',
  anandrathi: 'rathi.com',
  nirmalbang: 'nirmalbang.com',
  ventura: 'venturasecurities.com',
  adityabirla: 'adityabirlacapital.com',
  bajajsec: 'bajajbroking.in',
  yessec: 'yesinvest.in',
  religare: 'religareonline.com',
  smc: 'smctradeonline.com',
  mastertrust: 'mastertrust.co.in',
  tradejini: 'tradejini.com',
  pocketful: 'pocketful.in',
  sahi: 'joinsahi.com',
  jainam: 'jainam.in',
  bigul: 'bigul.co',
  navia: 'naviabroking.com',
  flattrade: 'flattrade.in',
  enrich: 'enrichmoney.in',
  zebu: 'zebuetrade.com',
  wisdom: 'wisdomcapital.in',
  profitmart: 'profitmart.in',
  definedge: 'definedge.com',
  jmfinancial: 'jmfinancialservices.in',
  dhani: 'dhanistocks.com',
  globecap: 'globecapital.com',
  emkay: 'emkayglobal.com',
  shareindia: 'shareindia.com',
  monarch: 'mnetindia.com',
  arihant: 'arihantcapital.com',
  bonanza: 'bonanzaonline.com',
  reliancesec: 'reliancesmartmoney.com',
  tradesmart: 'tradesmartonline.in',
  marwadi: 'marwadionline.com',
  swastika: 'swastika.co.in',
  prabhudas: 'plindia.com',
  phillipcap: 'phillipcapital.in',
  incred: 'incred.com',
  njindia: 'njindiaonline.com',
};

function Shell({
  bg,
  className,
  title,
  children,
}: {
  bg: string;
  className?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <span className={`wolf-md-logo ${className || ''}`} aria-hidden title={title}>
      <svg viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="11" fill={bg} />
        {children}
      </svg>
    </span>
  );
}

function Letter({
  bg,
  fg,
  letter,
  title,
  className,
}: {
  bg: string;
  fg: string;
  letter: string;
  title: string;
  className?: string;
}) {
  return (
    <Shell bg={bg} className={className} title={title}>
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        fill={fg}
        fontFamily="Inter, system-ui, sans-serif"
      >
        {letter}
      </text>
    </Shell>
  );
}

function FaviconMark({
  domain,
  title,
  className,
  fallback,
}: {
  domain: string;
  title: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    <span className={`wolf-md-logo ${className || ''}`} aria-hidden title={title}>
      <img
        className="wolf-md-logo__img"
        src={`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(domain)}&size=128`}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function fallbackMark(key: string, label: string, className: string): ReactNode {
  if (key.includes('indstock') || key.includes('indmoney')) {
    return (
      <span className={`wolf-md-logo ${className}`} aria-hidden title={label}>
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill="#0B3B2E" />
          <circle cx="20" cy="20" r="11" stroke="#3DDC97" strokeWidth="1.5" opacity="0.55" />
          <path d="M13 24.5 18.2 14h3.6L27 24.5h-3.1l-.9-2H17l-.9 2H13zm4.7-4.2h3.6L20.5 16l-2.8 4.3z" fill="#E8FFF4" />
        </svg>
      </span>
    );
  }
  if (key.includes('zerodha') || key.includes('kite')) {
    return (
      <span className={`wolf-md-logo ${className}`} aria-hidden title={label}>
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill="#387ED1" />
          <path d="M10 27 20 9l10 18H10zm4.2-2.4h11.6L20 14.2 14.2 24.6z" fill="#fff" />
        </svg>
      </span>
    );
  }
  if (key.includes('upstox')) {
    return (
      <span className={`wolf-md-logo ${className}`} aria-hidden title={label}>
        <svg viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill="#5A28FF" />
          <path d="M12 12h4.2l3.8 9.2L23.8 12H28L21.2 28h-4.4L12 12z" fill="#fff" />
        </svg>
      </span>
    );
  }
  if (key.includes('groww')) {
    return (
      <Shell bg="#00B852" className={className} title={label}>
        <path d="M20 9l8 9h-5v13h-6V18h-5l8-9z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('angel')) {
    return (
      <Shell bg="#C8102E" className={className} title={label}>
        <path d="M20 8c3 4 10 8 10 14 0 4.4-4.5 8-10 8s-10-3.6-10-8c0-6 7-10 10-14z" fill="#F5C518" />
        <circle cx="20" cy="21" r="3.2" fill="#C8102E" />
      </Shell>
    );
  }
  if (key.includes('dhani')) {
    return (
      <Shell bg="#DC2626" className={className} title={label}>
        <path d="M14 12h8.2c3.2 0 5.4 2 5.4 5.2S25.4 22.4 22.2 22.4H18.4V28H14V12zm4.4 6.8h3.4c1.2 0 2-.7 2-1.7s-.8-1.7-2-1.7h-3.4v3.4z" fill="#fff" />
      </Shell>
    );
  }
  if (key === 'dhan' || key.includes('dhanhq')) {
    return (
      <Shell bg="#111" className={className} title={label}>
        <path d="M22 8 12 22h7l-1 10 10-14h-7L22 8z" fill="#C8F542" />
      </Shell>
    );
  }
  if (key.includes('sahi')) {
    return (
      <span className={`wolf-md-logo ${className}`} aria-hidden title={label}>
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
  if (key.includes('fyers')) {
    return (
      <Shell bg="#0B2A8A" className={className} title={label}>
        <path d="M12 28V12h16v4.2H17.2V18H26v4H17.2V28H12z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('5paisa') || key.includes('paisa')) {
    return (
      <Shell bg="#E31E24" className={className} title={label}>
        <text x="20" y="26.5" textAnchor="middle" fontSize="18" fontWeight="800" fill="#fff" fontFamily="Inter, system-ui, sans-serif">
          5
        </text>
      </Shell>
    );
  }
  if (key.includes('alice')) {
    return (
      <Shell bg="#1565C0" className={className} title={label}>
        <path d="M8 26 20 10l12 16H8zm6.4-2.2h11.2L20 14.8 14.4 23.8z" fill="#fff" />
        <path d="M12 28h16l-2.2 3H14.2L12 28z" fill="#90CAF9" />
      </Shell>
    );
  }
  if (key.includes('hdfc')) {
    return (
      <Shell bg="#004C8F" className={className} title={label}>
        <rect x="11" y="11" width="18" height="18" rx="2" fill="#E31E24" />
        <rect x="14.5" y="14.5" width="11" height="11" rx="1" fill="#fff" />
        <rect x="17.5" y="17.5" width="5" height="5" fill="#004C8F" />
      </Shell>
    );
  }
  if (key.includes('icici')) {
    return (
      <Shell bg="#F58220" className={className} title={label}>
        <circle cx="20" cy="20" r="8.5" fill="#fff" />
        <path d="M18.2 13.8h3.6v12.4h-3.6z" fill="#F58220" />
      </Shell>
    );
  }
  if (key.includes('sbi')) {
    return (
      <Shell bg="#22409A" className={className} title={label}>
        <circle cx="20" cy="20" r="10" fill="#fff" />
        <circle cx="20" cy="20" r="6.2" fill="#22409A" />
        <circle cx="20" cy="20" r="2.4" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('kotak')) {
    return (
      <Shell bg="#ED1C24" className={className} title={label}>
        <path d="M13 12h5.2l4.2 6.4V12H28v16h-5.6l-4.2-6.4V28H13V12z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('axis')) {
    return (
      <Shell bg="#97144D" className={className} title={label}>
        <path d="M20 10 30 30h-4.4l-1.7-3.6H16.1L14.4 30H10L20 10zm0 8.2-2.4 5.2h4.8L20 18.2z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('sharekhan')) {
    return (
      <Shell bg="#E31837" className={className} title={label}>
        <path d="M20 9c4 3.2 9 7.2 9 13.2 0 5-4 8.8-9 8.8s-9-3.8-9-8.8C11 16.2 16 12.2 20 9z" fill="#fff" />
        <path d="M16.2 22.5c0-2.8 1.6-4.6 3.8-4.6 1.4 0 2.5.6 3.1 1.6l-1.7 1c-.3-.5-.8-.8-1.4-.8-1 0-1.7.8-1.7 2s.7 2 1.7 2c.6 0 1.1-.3 1.4-.8l1.7 1c-.6 1-1.7 1.6-3.1 1.6-2.2 0-3.8-1.8-3.8-4.6z" fill="#E31837" />
      </Shell>
    );
  }
  if (key.includes('paytm')) {
    return (
      <Shell bg="#00BAF2" className={className} title={label}>
        <path d="M13 12h8.4c3.4 0 5.6 2 5.6 5.1 0 3.2-2.2 5.2-5.6 5.2H17.4V28H13V12zm4.4 6.8h3.6c1.4 0 2.2-.8 2.2-1.8s-.8-1.8-2.2-1.8h-3.6v3.6z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('shoonya')) {
    return (
      <Shell bg="#1A1A1A" className={className} title={label}>
        <circle cx="20" cy="20" r="9" stroke="#FF7A1A" strokeWidth="2.2" />
        <path d="M20 13v14M13 20h14" stroke="#FF7A1A" strokeWidth="2.2" />
      </Shell>
    );
  }
  if (key.includes('samco')) {
    return (
      <Shell bg="#00A651" className={className} title={label}>
        <path d="M12 26c0-6 3.6-10 8-10 2.8 0 5 1.4 6.2 3.4L23.6 21c-.6-1-1.8-1.6-3.4-1.6-2.4 0-4 1.6-4 4.2s1.6 4.2 4 4.2c1.6 0 2.8-.6 3.4-1.6l2.6 1.6C25 29.6 22.8 31 20 31c-4.4 0-8-4-8-10z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('iifl')) {
    return (
      <Shell bg="#003399" className={className} title={label}>
        <path d="M11 12h5v16h-5V12zm7 0h5v16h-5V12zm7 0h5v16h-5V12z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('motilal')) {
    return (
      <Shell bg="#003366" className={className} title={label}>
        <path d="M10 28V12h5.2l4.8 8.6L24.8 12H30v16h-4.4V18.2L21.2 28h-2.4l-4.4-9.8V28H10z" fill="#F4C430" />
      </Shell>
    );
  }
  if (key.includes('mstock') || key.includes('mirae')) {
    return (
      <Shell bg="#E31C23" className={className} title={label}>
        <path d="M10 28V12h5.4L20 20.4 24.6 12H30v16h-4.2V18.6L22.2 26h-4.4l-3.6-7.4V28H10z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('bajaj')) {
    return (
      <Shell bg="#0077C8" className={className} title={label}>
        <circle cx="20" cy="20" r="10" fill="#fff" />
        <path d="M15 25V15h6.2c2.6 0 4.2 1.4 4.2 3.6 0 1.2-.6 2.2-1.6 2.8 1.2.5 2 1.6 2 3 0 2.4-1.8 3.6-4.6 3.6H15zm4.2-6.6h1.8c.9 0 1.5-.5 1.5-1.2s-.6-1.2-1.5-1.2h-1.8v2.4zm0 5.2h2.2c1 0 1.6-.5 1.6-1.3s-.6-1.3-1.6-1.3h-2.2v2.6z" fill="#0077C8" />
      </Shell>
    );
  }
  if (key.includes('aditya') || key.includes('birla')) {
    return (
      <Shell bg="#E4002B" className={className} title={label}>
        <path d="M20 9 31 31H9L20 9zm0 8.4-4.2 8.4h8.4L20 17.4z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('yessec') || key.includes('yes ')) {
    return (
      <Shell bg="#111" className={className} title={label}>
        <path d="M12 12h6.2L20 18.2 21.8 12H28L22.2 22.4V28h-4.4v-5.6L12 12z" fill="#ED1C24" />
      </Shell>
    );
  }
  if (key.includes('nuvama') || key.includes('edelweiss')) {
    return (
      <Shell bg="#1A1A2E" className={className} title={label}>
        <path d="M20 8 30 28H10L20 8zm0 7.6-4.6 9.2h9.2L20 15.6z" fill="#C9A227" />
      </Shell>
    );
  }
  if (key.includes('flattrade') || key.includes('flat')) {
    return (
      <Shell bg="#0F172A" className={className} title={label}>
        <path d="M10 26h6V10h8v6h6v14H10z" fill="#38BDF8" />
      </Shell>
    );
  }
  if (key.includes('jainam')) {
    return (
      <Shell bg="#1D4ED8" className={className} title={label}>
        <path d="M20 9l9 22h-4.2l-1.6-4H16.8l-1.6 4H11L20 9zm0 8-2.2 5.4h4.4L20 17z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('navia') || key.includes('tradeplus')) {
    return (
      <Shell bg="#0EA5E9" className={className} title={label}>
        <path d="M8 28 20 8l12 20H8zm7.2-3.2h9.6L20 13.6 15.2 24.8z" fill="#fff" />
      </Shell>
    );
  }
  if (key.includes('bigul')) {
    return (
      <Shell bg="#7C3AED" className={className} title={label}>
        <circle cx="20" cy="20" r="9" fill="#fff" />
        <path d="M15 25V15h7c2.4 0 4 1.4 4 3.4S24.4 22 22 22h-3.2V25H15zm4-6.4h2.4c.8 0 1.4-.4 1.4-1.1s-.6-1.1-1.4-1.1H19v2.2z" fill="#7C3AED" />
      </Shell>
    );
  }

  const letters: { test: (k: string) => boolean; bg: string; fg: string; letter: string }[] = [
    { test: (k) => k.includes('geojit'), bg: '#E31837', fg: '#fff', letter: 'G' },
    { test: (k) => k.includes('choice'), bg: '#00875A', fg: '#fff', letter: 'C' },
    { test: (k) => k.includes('anand') || k.includes('rathi'), bg: '#8B6914', fg: '#fff', letter: 'R' },
    { test: (k) => k.includes('nirmal'), bg: '#1B4F9C', fg: '#fff', letter: 'N' },
    { test: (k) => k.includes('ventura'), bg: '#E31E24', fg: '#fff', letter: 'V' },
    { test: (k) => k.includes('religare'), bg: '#E31E24', fg: '#fff', letter: 'R' },
    { test: (k) => k.includes('smc'), bg: '#003366', fg: '#fff', letter: 'S' },
    { test: (k) => k.includes('mastertrust') || k.includes('master'), bg: '#0D47A1', fg: '#fff', letter: 'M' },
    { test: (k) => k.includes('tradejini') || k.includes('jini'), bg: '#FF6B00', fg: '#fff', letter: 'T' },
    { test: (k) => k.includes('pocketful'), bg: '#6C5CE7', fg: '#fff', letter: 'P' },
    { test: (k) => k.includes('enrich'), bg: '#0F766E', fg: '#fff', letter: 'E' },
    { test: (k) => k.includes('zebu'), bg: '#B45309', fg: '#fff', letter: 'Z' },
    { test: (k) => k.includes('wisdom'), bg: '#1E3A8A', fg: '#FBBF24', letter: 'W' },
    { test: (k) => k.includes('profitmart'), bg: '#166534', fg: '#fff', letter: 'P' },
    { test: (k) => k.includes('definedge'), bg: '#111827', fg: '#22D3EE', letter: 'D' },
    { test: (k) => k.includes('jmfinancial'), bg: '#1E40AF', fg: '#fff', letter: 'J' },
    { test: (k) => k.includes('dhani'), bg: '#DC2626', fg: '#fff', letter: 'D' },
    { test: (k) => k.includes('globecap') || k.includes('globe'), bg: '#0369A1', fg: '#fff', letter: 'G' },
    { test: (k) => k.includes('emkay'), bg: '#0F172A', fg: '#F8FAFC', letter: 'E' },
    { test: (k) => k.includes('shareindia'), bg: '#B91C1C', fg: '#fff', letter: 'S' },
    { test: (k) => k.includes('monarch'), bg: '#7C2D12', fg: '#FDE68A', letter: 'M' },
    { test: (k) => k.includes('arihant'), bg: '#9A3412', fg: '#fff', letter: 'A' },
    { test: (k) => k.includes('bonanza'), bg: '#854D0E', fg: '#FEF3C7', letter: 'B' },
    { test: (k) => k.includes('reliance'), bg: '#1D4ED8', fg: '#fff', letter: 'R' },
    { test: (k) => k.includes('tradesmart'), bg: '#075985', fg: '#fff', letter: 'T' },
    { test: (k) => k.includes('marwadi'), bg: '#9F1239', fg: '#fff', letter: 'M' },
    { test: (k) => k.includes('swastika'), bg: '#C2410C', fg: '#fff', letter: 'S' },
    { test: (k) => k.includes('prabhudas') || k.includes('plindia'), bg: '#1E3A8A', fg: '#fff', letter: 'P' },
    { test: (k) => k.includes('phillip'), bg: '#0B3B6A', fg: '#fff', letter: 'P' },
    { test: (k) => k.includes('incred'), bg: '#4C1D95', fg: '#fff', letter: 'I' },
    { test: (k) => k.includes('njindia'), bg: '#0F766E', fg: '#fff', letter: 'N' },
  ];
  const hit = letters.find((m) => m.test(key));
  if (hit) return <Letter bg={hit.bg} fg={hit.fg} letter={hit.letter} title={label} className={className} />;

  const initial = (label.trim()[0] || '?').toUpperCase();
  return (
    <Shell bg="#1E293B" className={className} title={label}>
      <text x="20" y="26" textAnchor="middle" fontSize="17" fontWeight="800" fill="#F8FAFC" fontFamily="Inter, system-ui, sans-serif">
        {initial}
      </text>
    </Shell>
  );
}

export default function BrokerLogoMark({ id, name = '', className = '' }: Props) {
  const key = id.toLowerCase();
  const label = name || id;
  const domain = DOMAINS[key] || Object.entries(DOMAINS).find(([k]) => key.includes(k))?.[1];
  const fallback = fallbackMark(key, label, className);
  if (domain) {
    return (
      <FaviconMark domain={domain} title={label} className={className} fallback={fallback} />
    );
  }
  return fallback;
}
