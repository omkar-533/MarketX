import { useId, useMemo } from 'react';
import { motion } from 'framer-motion';

type Props = {
  caption?: string;
};

function huntRatio(caption: string): number | null {
  const m = caption.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const checked = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(checked) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((checked / total) * 100)));
}

/**
 * Opportunity live-scan overlay — wolf pounces and strikes with claws.
 * Cosmetic only. Does not invent prices or scanner hits.
 */
export default function WolfHuntLoader({ caption = 'Scanning…' }: Props) {
  const uid = useId().replace(/:/g, '');
  const pct = useMemo(() => huntRatio(caption), [caption]);

  return (
    <motion.div
      className="wolf-opp__hunt"
      role="status"
      aria-live="polite"
      aria-label={caption}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="wolf-opp__hunt-veil" aria-hidden />
      <div className="wolf-opp__hunt-motes" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} className={`wolf-opp__hunt-mote wolf-opp__hunt-mote--${i + 1}`} />
        ))}
      </div>

      <div className="wolf-opp__hunt-stage">
        <svg className="wolf-opp__hunt-svg" viewBox="0 0 720 380" aria-hidden>
          <defs>
            <linearGradient id={`${uid}-fur`} x1="120" y1="80" x2="540" y2="300" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fff6da" />
              <stop offset="0.38" stopColor="#f0d78c" />
              <stop offset="0.72" stopColor="#d4af37" />
              <stop offset="1" stopColor="#8a6a18" />
            </linearGradient>
            <linearGradient id={`${uid}-shade`} x1="200" y1="120" x2="280" y2="320" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#c9a227" />
              <stop offset="1" stopColor="#5c4810" />
            </linearGradient>
            <linearGradient id={`${uid}-claw`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff8e4" />
              <stop offset="0.45" stopColor="#f0d78c" />
              <stop offset="1" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id={`${uid}-slash`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff8e4" />
              <stop offset="0.5" stopColor="#f0d78c" />
              <stop offset="1" stopColor="#ef4444" stopOpacity="0.15" />
            </linearGradient>
            <radialGradient id={`${uid}-eye`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#ffe4e6" />
              <stop offset="0.35" stopColor="#ff2d2d" />
              <stop offset="1" stopColor="#7f1d1d" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-ground`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(212,175,55,0.22)" />
              <stop offset="1" stopColor="rgba(212,175,55,0)" />
            </radialGradient>
            <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-slash-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-drop`} x="-20%" y="-10%" width="140%" height="150%">
              <feDropShadow dx="0" dy="14" stdDeviation="10" floodColor="#000" floodOpacity="0.55" />
            </filter>
          </defs>

          <ellipse className="woh__ground" cx="360" cy="328" rx="250" ry="26" fill={`url(#${uid}-ground)`} />

          <g className="woh__wolf" filter={`url(#${uid}-drop)`}>
            <path
              className="woh__tail"
              fill={`url(#${uid}-shade)`}
              d="M132 198 C 78 214, 42 188, 48 150 C 40 128, 62 118, 78 138 C 92 162, 108 178, 148 190 Z"
            />

            <path
              className="woh__hind"
              fill={`url(#${uid}-shade)`}
              d="M168 214 C 148 236, 136 268, 142 302 C 146 322, 172 326, 180 306 C 188 282, 196 254, 214 232 Z"
            />
            <path
              fill={`url(#${uid}-shade)`}
              d="M214 228 C 228 256, 236 288, 228 316 C 224 332, 250 336, 258 316 C 266 290, 262 258, 248 232 Z"
            />

            <path
              fill={`url(#${uid}-fur)`}
              d="M148 196 C 156 142, 228 108, 312 122 C 372 132, 428 158, 458 192 C 430 236, 338 258, 248 252 C 188 248, 152 226, 148 196 Z"
            />

            <path
              fill={`url(#${uid}-fur)`}
              d="M430 168 C 448 128, 478 112, 508 128 C 492 148, 478 158, 458 168 Z"
            />
            <path
              fill={`url(#${uid}-shade)`}
              d="M456 164 C 478 118, 508 108, 528 132 C 510 148, 490 158, 468 170 Z"
            />

            <path
              fill={`url(#${uid}-fur)`}
              d="M430 156 C 458 132, 508 128, 548 154 C 572 170, 580 190, 568 204 C 552 222, 520 226, 492 216 C 468 228, 448 214, 430 186 Z"
            />
            <path
              fill="#5c4810"
              d="M548 168 C 568 174, 578 186, 572 198 C 560 194, 548 188, 540 180 Z"
            />
            <path fill="#fff6da" d="M538 196 L 552 204 L 536 208 Z" />
            <path fill="#fff6da" d="M544 200 L 558 210 L 540 212 Z" />

            <circle cx="492" cy="164" r="10" fill={`url(#${uid}-eye)`} filter={`url(#${uid}-glow)`} />
            <circle className="woh__eye" cx="492" cy="164" r="3.2" fill="#fff1f2" />

            <g className="woh__fore">
              <path
                fill={`url(#${uid}-fur)`}
                d="M412 198 C 448 206, 486 198, 522 188 C 538 184, 552 196, 540 210 C 522 222, 488 228, 452 224 C 428 222, 408 214, 412 198 Z"
              />
              <g className="woh__paw" filter={`url(#${uid}-glow)`}>
                <ellipse cx="536" cy="204" rx="18" ry="12" fill="#c9a227" />
                <path className="woh__claw" fill={`url(#${uid}-claw)`} d="M546 190 L 612 154 L 558 204 Z" />
                <path className="woh__claw" fill={`url(#${uid}-claw)`} d="M552 202 L 628 196 L 558 214 Z" />
                <path className="woh__claw" fill={`url(#${uid}-claw)`} d="M546 214 L 616 236 L 550 224 Z" />
                <path className="woh__claw" fill={`url(#${uid}-claw)`} d="M532 220 L 586 258 L 540 230 Z" />
              </g>
            </g>
          </g>

          <g className="woh__prey">
            <line x1="628" y1="138" x2="628" y2="168" stroke="#9aa6bc" strokeWidth="3" strokeLinecap="round" />
            <rect x="614" y="168" width="28" height="78" rx="4" fill="#1b2433" stroke="rgba(212,175,55,0.35)" />
            <rect x="614" y="188" width="28" height="42" rx="3" fill="#16a34a" />
            <line x1="628" y1="246" x2="628" y2="272" stroke="#9aa6bc" strokeWidth="3" strokeLinecap="round" />
          </g>

          <g className="woh__slashes" filter={`url(#${uid}-slash-glow)`} fill="none" stroke={`url(#${uid}-slash)`} strokeLinecap="round">
            <path className="woh__slash woh__slash--1" strokeWidth="5" d="M500 168 C 548 152, 596 148, 650 142" />
            <path className="woh__slash woh__slash--2" strokeWidth="4.2" d="M508 196 C 560 190, 608 188, 662 186" />
            <path className="woh__slash woh__slash--3" strokeWidth="4.6" d="M498 226 C 552 236, 604 246, 654 258" />
          </g>

          <g className="woh__burst" fill="none" stroke="#f0d78c" strokeLinecap="round">
            <path d="M628 196 L 668 176" />
            <path d="M628 196 L 672 196" />
            <path d="M628 196 L 664 220" />
            <path d="M628 196 L 598 168" />
            <path d="M628 196 L 590 210" />
          </g>
        </svg>

        <p className="wolf-opp__hunt-kicker">On the hunt</p>
        <p className="wolf-opp__hunt-caption">{caption}</p>
        <div className="wolf-opp__hunt-bar" aria-hidden>
          <span
            className={pct == null ? 'is-indeterminate' : undefined}
            style={pct != null ? { width: `${pct}%` } : undefined}
          />
        </div>
      </div>
    </motion.div>
  );
}
