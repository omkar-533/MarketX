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
 * Opportunity live-scan overlay — a red-hot claw rips a candle through the middle.
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
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={`wolf-opp__hunt-mote wolf-opp__hunt-mote--${i + 1}`} />
        ))}
      </div>

      <div className="wolf-opp__hunt-stage">
        <svg className="wolf-opp__hunt-svg" viewBox="0 0 720 420" aria-hidden>
          <defs>
            <linearGradient id={`${uid}-ker`} x1="120" y1="80" x2="430" y2="280" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#2a1a16" />
              <stop offset="0.38" stopColor="#4a2a22" />
              <stop offset="0.72" stopColor="#1a100e" />
              <stop offset="1" stopColor="#0b0706" />
            </linearGradient>
            <linearGradient id={`${uid}-ridge`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6b4338" />
              <stop offset="0.55" stopColor="#2a1814" />
              <stop offset="1" stopColor="#140c0a" />
            </linearGradient>
            <linearGradient id={`${uid}-hot`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7f1d1d" stopOpacity="0" />
              <stop offset="0.45" stopColor="#ef4444" />
              <stop offset="0.78" stopColor="#ff2d2d" />
              <stop offset="1" stopColor="#ffe4e6" />
            </linearGradient>
            <linearGradient id={`${uid}-bull`} x1="360" y1="90" x2="440" y2="330" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#4ade80" />
              <stop offset="0.18" stopColor="#22c55e" />
              <stop offset="0.62" stopColor="#15803d" />
              <stop offset="1" stopColor="#14532d" />
            </linearGradient>
            <linearGradient id={`${uid}-bull-l`} x1="360" y1="0" x2="388" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#052e16" />
              <stop offset="1" stopColor="#166534" />
            </linearGradient>
            <linearGradient id={`${uid}-core`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7f1d1d" />
              <stop offset="0.45" stopColor="#ff2d2d" />
              <stop offset="1" stopColor="#450a0a" />
            </linearGradient>
            <radialGradient id={`${uid}-bloom`} cx="58%" cy="50%" r="42%">
              <stop offset="0" stopColor="#ff2d2d" stopOpacity="0.55" />
              <stop offset="0.45" stopColor="#b91c1c" stopOpacity="0.22" />
              <stop offset="1" stopColor="#7f1d1d" stopOpacity="0" />
            </radialGradient>
            <filter id={`${uid}-red`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-hotglow`} x="-60%" y="-80%" width="220%" height="260%">
              <feGaussianBlur stdDeviation="2.1" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`${uid}-crack`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.45" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={`${uid}-top`}>
              <path d="M360 92 H440 V198 L428 190 416 206 404 188 392 204 380 186 368 200 360 192 Z" />
            </clipPath>
            <clipPath id={`${uid}-bot`}>
              <path d="M360 328 H440 V214 L428 222 416 206 404 224 392 208 380 226 368 212 360 220 Z" />
            </clipPath>
          </defs>

          <ellipse className="woh__bloom" cx="400" cy="210" rx="210" ry="120" fill={`url(#${uid}-bloom)`} />

          {/* Bottom candle half */}
          <g className="woh__candle-bot">
            <line x1="400" y1="328" x2="400" y2="378" stroke="#94a3b8" strokeWidth="3.2" strokeLinecap="round" />
            <path
              fill={`url(#${uid}-bull)`}
              d="M360 328 V214 L368 212 380 226 392 208 404 224 416 206 428 222 440 214 V328 Z"
            />
            <path fill={`url(#${uid}-bull-l)`} d="M360 328 V220 L368 212 380 226 392 216 V328 Z" opacity="0.72" />
            <path
              className="woh__inner"
              fill={`url(#${uid}-core)`}
              d="M360 220 L368 212 380 226 392 208 404 224 416 206 428 222 440 214 L440 228 428 234 416 220 404 236 392 222 380 238 368 226 360 232 Z"
            />
            <g clipPath={`url(#${uid}-bot)`} fill="none" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${uid}-crack)`}>
              <path className="woh__crack woh__crack--a" stroke="#1c1917" strokeWidth="2.3" d="M400 214 L422 236 432 258 438 292" />
              <path className="woh__crack" stroke="#1c1917" strokeWidth="1.45" d="M422 236 L436 240 438 252" />
              <path className="woh__crack woh__crack--a" stroke="#1c1917" strokeWidth="2.1" d="M400 214 L376 238 368 262 364 298" />
              <path className="woh__crack" stroke="#1c1917" strokeWidth="1.3" d="M376 238 L366 242 362 256" />
              <path className="woh__crack woh__crack--a" stroke="#ff4d4d" strokeWidth="0.85" d="M400 214 L422 236 432 258 438 292" />
              <path className="woh__crack woh__crack--a" stroke="#ff4d4d" strokeWidth="0.8" d="M400 214 L376 238 368 262 364 298" />
            </g>
          </g>

          {/* Top candle half */}
          <g className="woh__candle-top">
            <line x1="400" y1="48" x2="400" y2="92" stroke="#94a3b8" strokeWidth="3.2" strokeLinecap="round" />
            <path
              fill={`url(#${uid}-bull)`}
              d="M360 92 H440 V198 L428 190 416 206 404 188 392 204 380 186 368 200 360 192 Z"
            />
            <path fill={`url(#${uid}-bull-l)`} d="M360 92 V192 L368 200 380 186 392 198 V92 Z" opacity="0.72" />
            <rect x="360" y="92" width="80" height="7" fill="#86efac" opacity="0.55" />
            <path
              className="woh__inner"
              fill={`url(#${uid}-core)`}
              d="M360 192 L368 200 380 186 392 204 404 188 416 206 428 190 440 198 L440 186 428 178 416 192 404 176 392 190 380 174 368 186 360 180 Z"
            />
            <g clipPath={`url(#${uid}-top)`} fill="none" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${uid}-crack)`}>
              <path className="woh__crack woh__crack--a" stroke="#1c1917" strokeWidth="2.4" d="M400 198 L418 176 426 154 422 128 434 108" />
              <path className="woh__crack" stroke="#1c1917" strokeWidth="1.5" d="M418 176 L432 170 438 158" />
              <path className="woh__crack" stroke="#1c1917" strokeWidth="1.25" d="M426 154 L436 148 438 136" />
              <path className="woh__crack woh__crack--a" stroke="#1c1917" strokeWidth="2.2" d="M400 198 L378 174 368 150 362 118" />
              <path className="woh__crack" stroke="#1c1917" strokeWidth="1.35" d="M378 174 L366 178 362 166" />
              <path className="woh__crack woh__crack--a" stroke="#ff4d4d" strokeWidth="0.9" d="M400 198 L418 176 426 154 422 128 434 108" />
              <path className="woh__crack woh__crack--a" stroke="#ff4d4d" strokeWidth="0.85" d="M400 198 L378 174 368 150 362 118" />
            </g>
          </g>

          <g className="woh__shards">
            <path fill="#22c55e" d="M392 206 L408 198 L404 214 Z" />
            <path fill="#166534" d="M414 218 L428 214 L422 232 Z" />
            <path fill="#4ade80" d="M378 198 L368 210 L386 208 Z" />
            <path fill="#14532d" d="M420 188 L434 178 L428 198 Z" />
            <path fill="#16a34a" d="M370 226 L358 220 L366 240 Z" />
          </g>

          {/* Claw — keratin + red-hot edges, no full wolf */}
          <g className="woh__claw" filter={`url(#${uid}-red)`}>
            <ellipse cx="168" cy="208" rx="78" ry="52" fill="#0a0706" opacity="0.55" />

            <path
              fill={`url(#${uid}-ker)`}
              d="M168 132 C 248 108, 332 112, 412 142 C 428 148, 434 158, 418 160 C 338 132, 252 140, 172 154 C 158 144, 156 134, 168 132 Z"
            />
            <path
              fill={`url(#${uid}-ker)`}
              d="M158 172 C 250 150, 348 156, 448 186 C 468 194, 472 208, 448 210 C 348 180, 250 186, 160 198 C 146 186, 146 176, 158 172 Z"
            />
            <path
              fill={`url(#${uid}-ker)`}
              d="M164 214 C 252 200, 350 208, 442 236 C 460 244, 456 258, 436 258 C 348 228, 250 228, 166 240 C 152 228, 152 218, 164 214 Z"
            />
            <path
              fill={`url(#${uid}-ker)`}
              d="M176 254 C 258 248, 342 262, 418 292 C 434 300, 428 312, 410 308 C 338 278, 256 272, 178 278 C 164 266, 164 256, 176 254 Z"
            />

            <path fill={`url(#${uid}-ridge)`} opacity="0.55" d="M190 146 C 270 128, 350 134, 408 152 C 350 140, 270 144, 188 158 Z" />
            <path fill={`url(#${uid}-ridge)`} opacity="0.5" d="M182 184 C 280 168, 370 176, 440 198 C 370 182, 280 184, 180 196 Z" />

            <g className="woh__edge" filter={`url(#${uid}-hotglow)`} fill="none" stroke={`url(#${uid}-hot)`} strokeLinecap="round">
              <path strokeWidth="3.1" d="M172 154 C 252 138, 338 134, 418 160" />
              <path strokeWidth="3.6" d="M160 198 C 250 184, 348 180, 448 210" />
              <path strokeWidth="3.3" d="M166 240 C 250 226, 348 228, 436 258" />
              <path strokeWidth="2.8" d="M178 278 C 256 270, 338 278, 410 308" />
            </g>
            <g className="woh__tips" fill="#ffe4e6" filter={`url(#${uid}-hotglow)`}>
              <path d="M412 142 L 428 148 L 418 160 Z" />
              <path d="M448 186 L 472 200 L 448 210 Z" />
              <path d="M442 236 L 460 250 L 436 258 Z" />
              <path d="M418 292 L 434 304 L 410 308 Z" />
            </g>
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
