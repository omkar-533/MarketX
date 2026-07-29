import { motion } from 'framer-motion';

type Props = {
  /** Full viewport overlay (reload / auth boot). Default true. */
  fullscreen?: boolean;
  label?: string;
  className?: string;
};

/** Premium centered boot loader — wolf mark + aggressive red eye glow. */
export default function WolfLoader({
  fullscreen = true,
  label = 'WOLF LOADING',
  className = '',
}: Props) {
  return (
    <div
      className={`wolf-loader ${fullscreen ? 'wolf-loader--full' : 'wolf-loader--inline'} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="wolf-loader__veil" aria-hidden />
      <div className="wolf-loader__orb wolf-loader__orb--a" aria-hidden />
      <div className="wolf-loader__orb wolf-loader__orb--b" aria-hidden />

      <motion.div
        className="wolf-loader__stage"
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 20 }}
      >
        <span className="wolf-loader__ring wolf-loader__ring--outer" aria-hidden />
        <span className="wolf-loader__ring wolf-loader__ring--inner" aria-hidden />

        <motion.div
          className="wolf-loader__badge"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity }}
        >
          <svg className="wolf-loader__svg" viewBox="0 0 64 64" aria-hidden>
            <defs>
              <linearGradient id="wl-lit" x1="8" y1="4" x2="34" y2="58" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff8e4" />
                <stop offset=".42" stopColor="#f0d894" />
                <stop offset="1" stopColor="#cba52a" />
              </linearGradient>
              <linearGradient id="wl-shade" x1="56" y1="4" x2="34" y2="58" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#eacf7e" />
                <stop offset=".5" stopColor="#bf9525" />
                <stop offset="1" stopColor="#94701a" />
              </linearGradient>
              <linearGradient id="wl-snout" x1="32" y1="46" x2="32" y2="60" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#a8811c" />
                <stop offset="1" stopColor="#7a5b10" />
              </linearGradient>
              <radialGradient id="wl-eye" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="#ffe4e6" />
                <stop offset="0.35" stopColor="#ff2d2d" />
                <stop offset="0.75" stopColor="#b91c1c" />
                <stop offset="1" stopColor="#7f1d1d" stopOpacity="0" />
              </radialGradient>
              <filter id="wl-eye-blur" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="wl-mark-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path
              fill="url(#wl-lit)"
              fillRule="evenodd"
              filter="url(#wl-mark-glow)"
              d="M10 5 23 25 32 21 32 59 19 45 12 31Z M20 32 28 35.5 26 40 19 36.5Z"
            />
            <path
              fill="url(#wl-shade)"
              fillRule="evenodd"
              filter="url(#wl-mark-glow)"
              d="M54 5 41 25 32 21 32 59 45 45 52 31Z M44 32 36 35.5 38 40 45 36.5Z"
            />
            <path fill="url(#wl-snout)" d="M27 47 37 47 32 59Z" />

            {/* Aggressive red eye cores + outer glow */}
            <motion.circle
              className="wolf-loader__eye-glow"
              cx="24.5"
              cy="34"
              r="5.2"
              fill="url(#wl-eye)"
              filter="url(#wl-eye-blur)"
              animate={{ opacity: [0.45, 1, 0.45], scale: [0.85, 1.25, 0.85] }}
              transition={{ duration: 1.35, ease: 'easeInOut', repeat: Infinity }}
            />
            <motion.circle
              className="wolf-loader__eye-glow"
              cx="39.5"
              cy="34"
              r="5.2"
              fill="url(#wl-eye)"
              filter="url(#wl-eye-blur)"
              animate={{ opacity: [0.45, 1, 0.45], scale: [0.85, 1.25, 0.85] }}
              transition={{ duration: 1.35, ease: 'easeInOut', repeat: Infinity, delay: 0.18 }}
            />
            <motion.circle
              cx="24.5"
              cy="34"
              r="1.55"
              fill="#fff1f2"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.35, ease: 'easeInOut', repeat: Infinity }}
            />
            <motion.circle
              cx="39.5"
              cy="34"
              r="1.55"
              fill="#fff1f2"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.35, ease: 'easeInOut', repeat: Infinity, delay: 0.18 }}
            />
          </svg>
        </motion.div>
      </motion.div>

      <motion.p
        className="wolf-loader__label"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {label}
      </motion.p>
      <div className="wolf-loader__bar" aria-hidden>
        <span />
      </div>
    </div>
  );
}
