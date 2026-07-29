import { motion } from 'framer-motion';

type HunterMarkProps = {
  className?: string;
  /** Show HUNTER caption under the wolf */
  showCaption?: boolean;
  /** Smaller mark for journal hero / tight layouts */
  compact?: boolean;
};

/**
 * Premium animated Wolf Hunter emblem for Wolf AI empty state.
 * Uses the brand wolf geometry with orbital rings, glow pulse, and shimmer.
 */
export default function HunterMark({ className = '', showCaption = true, compact = false }: HunterMarkProps) {
  const uid = compact ? 'hunterc' : 'hunter';

  return (
    <div className={`hunter-mark ${compact ? 'hunter-mark--compact' : ''} ${className}`} aria-hidden>
      <div className="hunter-mark__stage">
        <span className="hunter-mark__aura hunter-mark__aura--outer" />
        <span className="hunter-mark__aura hunter-mark__aura--mid" />
        <span className="hunter-mark__aura hunter-mark__aura--core" />

        <motion.span
          className="hunter-mark__orbit hunter-mark__orbit--a"
          animate={{ rotate: 360 }}
          transition={{ duration: 14, ease: 'linear', repeat: Infinity }}
        >
          <i className="hunter-mark__spark hunter-mark__spark--1" />
        </motion.span>
        <motion.span
          className="hunter-mark__orbit hunter-mark__orbit--b"
          animate={{ rotate: -360 }}
          transition={{ duration: 10, ease: 'linear', repeat: Infinity }}
        >
          <i className="hunter-mark__spark hunter-mark__spark--2" />
          <i className="hunter-mark__spark hunter-mark__spark--3" />
        </motion.span>

        <motion.div
          className="hunter-mark__badge"
          initial={{ opacity: 0, scale: 0.55, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        >
          <motion.div
            className="hunter-mark__float"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
          >
            <svg
              className="hunter-mark__svg"
              viewBox="0 0 64 64"
              role="img"
              aria-label="Hunter"
            >
              <defs>
                <linearGradient id={`${uid}-lit`} x1="8" y1="4" x2="34" y2="58" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#fff8e4" />
                  <stop offset=".42" stopColor="#f0d894" />
                  <stop offset="1" stopColor="#cba52a" />
                </linearGradient>
                <linearGradient id={`${uid}-shade`} x1="56" y1="4" x2="34" y2="58" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#eacf7e" />
                  <stop offset=".5" stopColor="#bf9525" />
                  <stop offset="1" stopColor="#94701a" />
                </linearGradient>
                <linearGradient id={`${uid}-snout`} x1="32" y1="46" x2="32" y2="60" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#a8811c" />
                  <stop offset="1" stopColor="#7a5b10" />
                </linearGradient>
                <radialGradient id={`${uid}-eye`} cx="50%" cy="50%" r="50%">
                  <stop offset="0" stopColor="#fff6da" />
                  <stop offset="0.45" stopColor="#f0d78c" />
                  <stop offset="1" stopColor="#cba52a" stopOpacity="0" />
                </radialGradient>
                <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="1.4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <motion.path
                fill={`url(#${uid}-lit)`}
                fillRule="evenodd"
                filter={`url(#${uid}-glow)`}
                d="M10 5 23 25 32 21 32 59 19 45 12 31Z M20 32 28 35.5 26 40 19 36.5Z"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12, duration: 0.45 }}
              />
              <motion.path
                fill={`url(#${uid}-shade)`}
                fillRule="evenodd"
                filter={`url(#${uid}-glow)`}
                d="M54 5 41 25 32 21 32 59 45 45 52 31Z M44 32 36 35.5 38 40 45 36.5Z"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18, duration: 0.45 }}
              />
              <motion.path
                fill={`url(#${uid}-snout)`}
                d="M27 47 37 47 32 59Z"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28, duration: 0.35 }}
              />

              {/* Hunter eye glints */}
              <motion.circle
                cx="24.5"
                cy="34"
                r="2.2"
                fill={`url(#${uid}-eye)`}
                animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85] }}
                transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
              />
              <motion.circle
                cx="39.5"
                cy="34"
                r="2.2"
                fill={`url(#${uid}-eye)`}
                animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85] }}
                transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, delay: 0.2 }}
              />
            </svg>

            <span className="hunter-mark__shimmer" />
          </motion.div>
        </motion.div>
      </div>

      {showCaption ? (
        <motion.div
          className="hunter-mark__caption"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          <span className="hunter-mark__caption-line" />
          <span className="hunter-mark__caption-text">Hunter</span>
          <span className="hunter-mark__caption-line" />
        </motion.div>
      ) : null}
    </div>
  );
}
