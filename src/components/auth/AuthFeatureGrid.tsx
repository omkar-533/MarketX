import { motion } from 'framer-motion';
import {
  Activity,
  Bot,
  LayoutDashboard,
  NotebookPen,
  PieChart,
  ScanLine,
  type LucideIcon,
} from 'lucide-react';
import { PAGE_NAMES } from '../../constants/brandLabels';

type Feature = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const LOGIN_FEATURES: Feature[] = [
  {
    id: 'dashboard',
    title: PAGE_NAMES.dashboard,
    description: 'Live indices, breadth, sector pulse, and market bias in one view.',
    icon: LayoutDashboard,
  },
  {
    id: 'tradingjournal',
    title: PAGE_NAMES.tradingjournal,
    description: 'Log trades, track P&L, and review discipline with a clean journal.',
    icon: NotebookPen,
  },
  {
    id: 'oiintelligence',
    title: PAGE_NAMES.oiintelligence,
    description: 'Open interest, PCR, and smart-money flow for clearer directional bias.',
    icon: Activity,
  },
  {
    id: 'heatmap',
    title: PAGE_NAMES.heatmap,
    description: 'Stock and sector heat maps colored by live performance.',
    icon: PieChart,
  },
  {
    id: 'scanner',
    title: PAGE_NAMES.scanner,
    description: 'Ready-made momentum, breakout, volume, and F&O screeners.',
    icon: ScanLine,
  },
  {
    id: 'trafi',
    title: PAGE_NAMES.trafi,
    description: 'Ask market questions and get context-aware AI trading assistance.',
    icon: Bot,
  },
];

/** Feature cards on login — icons + short descriptions */
export default function AuthFeatureGrid() {
  return (
    <div className="auth-feature-grid">
      <p className="auth-feature-grid__label">Platform modules</p>
      <div className="auth-feature-grid__list">
        {LOGIN_FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.id}
              className="auth-feature-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i, duration: 0.35 }}
            >
              <div className="auth-feature-card__icon" aria-hidden="true">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="auth-feature-card__title">{f.title}</h3>
                <p className="auth-feature-card__desc">{f.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
