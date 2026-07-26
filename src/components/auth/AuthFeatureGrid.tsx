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
  detail: string;
  icon: LucideIcon;
};

const LOGIN_FEATURES: Feature[] = [
  {
    id: 'dashboard',
    title: PAGE_NAMES.dashboard,
    detail: 'Market pulse',
    description: 'Live indices, breadth, sector pulse, and directional bias in one command view.',
    icon: LayoutDashboard,
  },
  {
    id: 'tradingjournal',
    title: PAGE_NAMES.tradingjournal,
    detail: 'Process & P&L',
    description: 'Log every trade, review discipline, and track performance with a clean journal.',
    icon: NotebookPen,
  },
  {
    id: 'oiintelligence',
    title: PAGE_NAMES.oiintelligence,
    detail: 'Smart money',
    description: 'Open interest, PCR, and flow signals to read institutional positioning.',
    icon: Activity,
  },
  {
    id: 'heatmap',
    title: PAGE_NAMES.heatmap,
    detail: 'Performance map',
    description: 'Stock and sector heatmaps colored by live performance — spot strength instantly.',
    icon: PieChart,
  },
  {
    id: 'scanner',
    title: PAGE_NAMES.scanner,
    detail: 'Ready-made scans',
    description: 'Momentum, breakout, volume, and F&O screeners that refresh with the live tape.',
    icon: ScanLine,
  },
  {
    id: 'trafi',
    title: PAGE_NAMES.trafi,
    detail: 'AI copilot',
    description: 'Ask market questions and get context-aware answers across your workspace.',
    icon: Bot,
  },
];

/** LuxAlgo-style premium module cards */
export default function AuthFeatureGrid() {
  return (
    <div className="auth-lux-features">
      {LOGIN_FEATURES.map((f, i) => {
        const Icon = f.icon;
        return (
          <motion.article
            key={f.id}
            className="auth-lux-feature"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-24px' }}
            transition={{ delay: 0.04 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="auth-lux-feature__icon" aria-hidden="true">
              <Icon className="w-5 h-5" />
            </div>
            <p className="auth-lux-feature__detail">{f.detail}</p>
            <h3 className="auth-lux-feature__title">{f.title}</h3>
            <p className="auth-lux-feature__desc">{f.description}</p>
          </motion.article>
        );
      })}
    </div>
  );
}
