import type { MouseEvent } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import {
  Bot,
  Link2,
  NotebookPen,
  type LucideIcon,
} from 'lucide-react';
import { PAGE_NAMES } from '../../constants/brandLabels';
import { SHOW_INDICATORS } from '../../constants/featureFlags';

type VizKind = 'bars' | 'line' | 'ladder' | 'tiles' | 'scan' | 'chat';

type Feature = {
  id: string;
  title: string;
  description: string;
  detail: string;
  icon: LucideIcon;
  viz: VizKind;
};

/** Matches the live sidebar — same card UI, only active modules. */
const LOGIN_FEATURES: Feature[] = [
  {
    id: 'wolf-ai',
    title: PAGE_NAMES['wolf-ai'],
    detail: 'AI copilot',
    description: 'Ask market questions and get context-aware answers across your workspace.',
    icon: Bot,
    viz: 'chat',
  },
  ...(SHOW_INDICATORS
    ? [
        {
          id: 'indicators',
          title: PAGE_NAMES.indicators,
          detail: 'Invite links',
          description:
            'Browse published indicators, open invite links, and use them during your demo.',
          icon: Link2,
          viz: 'scan' as const,
        },
      ]
    : []),
  {
    id: 'tradingjournal',
    title: PAGE_NAMES.tradingjournal,
    detail: 'Process & P&L',
    description: 'Log every trade, review discipline, and track performance with a clean journal.',
    icon: NotebookPen,
    viz: 'line',
  },
];

/** Small always-on animation that hints at what each module does. */
function Viz({ kind }: { kind: VizKind }) {
  if (kind === 'line') {
    return (
      <span className="fviz fviz--line">
        <svg viewBox="0 0 120 40" preserveAspectRatio="none" role="presentation">
          <path d="M2,34 L18,28 L32,31 L48,20 L64,23 L80,13 L96,15 L118,4" />
        </svg>
      </span>
    );
  }

  if (kind === 'tiles') {
    return (
      <span className="fviz fviz--tiles">
        {Array.from({ length: 24 }).map((_, i) => (
          <i key={i} />
        ))}
      </span>
    );
  }

  if (kind === 'chat') {
    return (
      <span className="fviz fviz--chat">
        <i className="fviz__bubble is-user" />
        <i className="fviz__bubble is-ai" />
        <span className="fviz__dots">
          <i />
          <i />
          <i />
        </span>
      </span>
    );
  }

  const counts: Record<'bars' | 'ladder' | 'scan', number> = { bars: 9, ladder: 4, scan: 4 };
  const kindKey = kind as 'bars' | 'ladder' | 'scan';

  return (
    <span className={`fviz fviz--${kindKey}`}>
      {Array.from({ length: counts[kindKey] }).map((_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const reduced = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, { stiffness: 240, damping: 20 });
  const rotateY = useSpring(rawY, { stiffness: 240, damping: 20 });
  const Icon = feature.icon;

  const onMove = (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    if (reduced) return;
    rawY.set((px - 0.5) * 13);
    rawX.set(-(py - 0.5) * 13);
  };

  const onLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.div
      className="auth-lux-feature-wrap"
      initial={{ opacity: 0, y: 54, rotateX: 16, filter: 'blur(9px)' }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-8% 0px -8% 0px' }}
      transition={{ delay: 0.08 * index, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.article
        className="auth-lux-feature"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ rotateX, rotateY, transformPerspective: 900 }}
      >
        <span className="auth-lux-feature__ring" aria-hidden="true" />
        <span className="auth-lux-feature__plate" aria-hidden="true" />
        <span className="auth-lux-feature__spot" aria-hidden="true" />

        <div className="auth-lux-feature__icon" aria-hidden="true">
          <Icon className="w-5 h-5" />
        </div>
        <p className="auth-lux-feature__detail">{feature.detail}</p>
        <h3 className="auth-lux-feature__title">{feature.title}</h3>
        <p className="auth-lux-feature__desc">{feature.description}</p>
        <div className="auth-lux-feature__viz" aria-hidden="true">
          <Viz kind={feature.viz} />
        </div>
      </motion.article>
    </motion.div>
  );
}

/** LuxAlgo-style premium module cards */
export default function AuthFeatureGrid() {
  return (
    <div className="auth-lux-features">
      {LOGIN_FEATURES.map((f, i) => (
        <FeatureCard key={f.id} feature={f} index={i} />
      ))}
    </div>
  );
}
