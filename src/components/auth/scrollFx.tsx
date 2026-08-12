import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

export const EASE = [0.22, 1, 0.36, 1] as const;

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  blur?: boolean;
  once?: boolean;
};

/** Fade + rise + de-blur as the block enters the viewport. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 46,
  blur = true,
  once = true,
}: RevealProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: blur ? 'blur(8px)' : 'blur(0px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once, margin: '-10% 0px -12% 0px' }}
      transition={{ duration: 0.85, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

type WordsProps = {
  text: string;
  /** Animate on mount (above the fold) or when scrolled into view. */
  mode?: 'mount' | 'view';
  delay?: number;
  stagger?: number;
};

/** Slides each word up from behind a mask — the classic premium headline reveal. */
export function Words({ text, mode = 'view', delay = 0, stagger = 0.055 }: WordsProps) {
  const reduced = useReducedMotion();
  if (reduced) return <>{text}</>;

  const words = text.split(' ');
  const inner = { y: '0%', opacity: 1 };
  const outer = { y: '112%', opacity: 0 };

  return (
    <>
      {words.map((word, i) => (
        <span className="fx-word" key={`${word}-${i}`}>
          <motion.span
            className="fx-word__in"
            initial={outer}
            {...(mode === 'mount'
              ? { animate: inner }
              : { whileInView: inner, viewport: { once: true, margin: '-8% 0px -8% 0px' } })}
            transition={{ duration: 0.8, delay: delay + i * stagger, ease: EASE }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

/**
 * Reveal for gradient-clipped <em> lines. These cannot use word masking: an
 * inline-block child breaks `background-clip: text` on the parent and the text
 * renders fully transparent.
 */
export function GradientLine({
  text,
  mode = 'view',
  delay = 0,
}: {
  text: string;
  mode?: 'mount' | 'view';
  delay?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <em>{text}</em>;

  const shown = { opacity: 1, y: 0, filter: 'blur(0px)' };

  return (
    <motion.em
      initial={{ opacity: 0, y: 34, filter: 'blur(9px)' }}
      {...(mode === 'mount'
        ? { animate: shown }
        : { whileInView: shown, viewport: { once: true, margin: '-8% 0px -8% 0px' } })}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {text}
    </motion.em>
  );
}

type CounterProps = {
  to: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
};

/** Counts up from zero the first time it scrolls into view. */
export function Counter({ to, suffix = '', decimals = 0, duration = 1.7 }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? to : 0);

  useEffect(() => {
    if (reduced) {
      setValue(to);
      return;
    }
    if (!inView) return;

    let raf = 0;
    const started = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / (duration * 1000));
      setValue(from + (to - from) * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, to, duration]);

  return (
    <span ref={ref}>
      {Math.round(value).toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/** Seamless infinite horizontal scroller — children are rendered twice. */
export function Marquee({
  children,
  reverse = false,
  duration = 46,
  className = '',
}: {
  children: ReactNode;
  reverse?: boolean;
  duration?: number;
  className?: string;
}) {
  return (
    <div className={`fx-marquee ${reverse ? 'fx-marquee--rev' : ''} ${className}`}>
      <div className="fx-marquee__track" style={{ animationDuration: `${duration}s` }}>
        <div className="fx-marquee__set">{children}</div>
        <div className="fx-marquee__set" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
