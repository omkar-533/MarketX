import { motion } from 'framer-motion';
import { Brain, Crosshair, Sparkles } from 'lucide-react';
import type { TradeRecord } from '../../types/journal';
import { buildPsychologyAnalytics } from '../../services/journalPsychAnalytics';
import JournalWinLossChart from './JournalWinLossChart';
import JournalMonthlyPnlChart from './JournalMonthlyPnlChart';
import JournalPsychGauge from './JournalPsychGauge';
import JournalEmotionSpectrum from './JournalEmotionSpectrum';
import JournalPsychOutcomeChart from './JournalPsychOutcomeChart';
import JournalLuxBars from './JournalLuxBars';
import JournalInstrumentRank from './JournalInstrumentRank';

type MonthPoint = { label: string; pnl: number; trades?: number };
type StrategyPoint = { strategy: string; pnl: number; trades: number };
type RiskPoint = { name: string; value: number };
type InstrumentPoint = { instrument: string; pnl: number };

type Advanced = {
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxDrawdown: number;
  winCount: number;
  lossCount: number;
};

type Props = {
  trades: TradeRecord[];
  monthly: MonthPoint[];
  strategyData: StrategyPoint[];
  riskData: RiskPoint[];
  instrumentData: InstrumentPoint[];
  advanced: Advanced;
  formatCurrency: (n: number) => string;
};

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export default function JournalAnalyticsDesk({
  trades,
  monthly,
  strategyData,
  riskData,
  instrumentData,
  advanced,
  formatCurrency,
}: Props) {
  const psych = buildPsychologyAnalytics(trades);

  const strategyBars = (strategyData.length
    ? strategyData.slice(0, 6)
    : [{ strategy: '—', pnl: 0, trades: 0 }]
  ).map((s) => ({
    label: s.strategy || 'Unset',
    value: s.pnl,
    meta: s.trades ? `${s.trades}t` : undefined,
  }));

  const riskBars = riskData.map((r) => ({
    label: r.name.replace(' Risk', ''),
    value: r.value,
    meta: r.value ? `${r.value}` : undefined,
  }));

  const mindTone =
    psych.mindScore >= 70 ? 'emerald' : psych.mindScore >= 45 ? 'gold' : 'rose';

  return (
    <motion.div
      className="tj-analytics space-y-3.5"
      initial="initial"
      animate="animate"
      variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
    >
      <motion.div className="tj-analytics__hero" variants={fade}>
        <div className="tj-analytics__hero-copy">
          <p className="tj-chart__eyebrow">Desk intelligence</p>
          <h2 className="tj-analytics__title">Advanced Analytics</h2>
          <p className="tj-analytics__sub">
            Filtered book · performance, risk & psychology in one premium view
          </p>
        </div>
        <div className="tj-analytics__kpis">
          <div className="tj-analytics__kpi">
            <span>Profit factor</span>
            <strong>{advanced.profitFactor >= 99 ? '∞' : advanced.profitFactor.toFixed(2)}</strong>
          </div>
          <div className="tj-analytics__kpi">
            <span>Expectancy</span>
            <strong className={advanced.expectancy >= 0 ? 'is-up' : 'is-down'}>
              {formatCurrency(advanced.expectancy)}
            </strong>
          </div>
          <div className="tj-analytics__kpi">
            <span>Mind score</span>
            <strong style={{ color: mindTone === 'emerald' ? '#6ee7b7' : mindTone === 'rose' ? '#fb7185' : '#f0d78c' }}>
              {psych.scoredCount ? psych.mindScore : '—'}
            </strong>
          </div>
          <div className="tj-analytics__kpi">
            <span>Max DD</span>
            <strong className="is-down">{formatCurrency(advanced.maxDrawdown)}</strong>
          </div>
        </div>
      </motion.div>

      <div className="tj-analytics__grid">
        <motion.div className="tj-card tj-card--chart p-3.5" variants={fade}>
          <JournalWinLossChart wins={advanced.winCount} losses={advanced.lossCount} />
        </motion.div>
        <motion.div className="tj-card tj-card--chart p-3.5" variants={fade}>
          <JournalMonthlyPnlChart data={monthly} formatValue={formatCurrency} />
        </motion.div>
      </div>

      <motion.div className="tj-card tj-psych-desk p-3.5" variants={fade}>
        <div className="tj-psych-desk__head">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-[#f0d78c]" />
            <div>
              <p className="tj-chart__eyebrow">Trader mind</p>
              <h3 className="tj-chart__title">Psychology Desk</h3>
            </div>
          </div>
          <div className="tj-psych-desk__badge">
            <Sparkles className="w-3 h-3" />
            {psych.scoredCount
              ? `${psych.scoredCount} psych-tagged trades`
              : 'Start tagging emotions on logs'}
          </div>
        </div>

        <div className="tj-psych-desk__gauges">
          <JournalPsychGauge
            label="Confidence"
            value={psych.confidence}
            hint="Entry belief"
            tone="gold"
            delay={0.05}
          />
          <JournalPsychGauge
            label="Discipline"
            value={psych.discipline}
            hint="Rule follow"
            tone="emerald"
            delay={0.12}
          />
          <JournalPsychGauge
            label="Fear / Greed"
            value={psych.fearGreed}
            hint="Lower = calmer"
            tone="rose"
            delay={0.18}
          />
          <JournalPsychGauge
            label="Mind Score"
            value={psych.mindScore}
            hint="Composite"
            tone={mindTone === 'emerald' ? 'emerald' : mindTone === 'rose' ? 'rose' : 'amber'}
            delay={0.24}
          />
        </div>
      </motion.div>

      <div className="tj-analytics__grid">
        <motion.div className="tj-card tj-card--chart p-3.5" variants={fade}>
          <JournalEmotionSpectrum
            title="Before-trade Emotions"
            eyebrow="State at entry"
            data={psych.beforeEmotions}
          />
        </motion.div>
        <motion.div className="tj-card tj-card--chart p-3.5" variants={fade}>
          <JournalEmotionSpectrum
            title="After-trade Emotions"
            eyebrow="State at exit"
            data={psych.afterEmotions}
          />
        </motion.div>
      </div>

      <motion.div className="tj-card tj-card--chart p-3.5" variants={fade}>
        <JournalPsychOutcomeChart
          buckets={psych.buckets}
          trend={psych.trend}
          formatPnl={formatCurrency}
        />
      </motion.div>

      <div className="tj-analytics__grid">
        <motion.div className="tj-card tj-card--chart p-3.5" variants={fade}>
          <JournalLuxBars
            eyebrow="Edge"
            title="Strategy Performance"
            data={strategyBars}
            formatValue={formatCurrency}
            mode="pnl"
            emptyHint="Tag strategies on trades"
          />
        </motion.div>
        <motion.div className="tj-card tj-card--chart p-3.5" variants={fade}>
          <JournalLuxBars
            eyebrow="Exposure"
            title="Risk Profile"
            data={riskBars}
            mode="count"
            emptyHint="R:R builds this map"
          />
        </motion.div>
      </div>

      <div className="tj-analytics__grid tj-analytics__grid--split">
        <motion.div className="tj-card tj-card--chart p-3.5" variants={fade}>
          <JournalInstrumentRank data={instrumentData} formatValue={formatCurrency} />
        </motion.div>
        <motion.div className="tj-card p-3.5 tj-analytics__snapshot" variants={fade}>
          <div className="tj-chart__head">
            <div>
              <p className="tj-chart__eyebrow">Edge snapshot</p>
              <h3 className="tj-chart__title">Book Pulse</h3>
            </div>
            <Crosshair className="w-3.5 h-3.5 text-[#d4af37]" />
          </div>
          <div className="tj-analytics__snap-grid">
            <div>
              <span>Avg win</span>
              <strong className="text-emerald-400">{formatCurrency(advanced.avgWin)}</strong>
            </div>
            <div>
              <span>Avg loss</span>
              <strong className="text-rose-400">{formatCurrency(advanced.avgLoss)}</strong>
            </div>
            <div>
              <span>Wins</span>
              <strong>{advanced.winCount}</strong>
            </div>
            <div>
              <span>Losses</span>
              <strong>{advanced.lossCount}</strong>
            </div>
            <div>
              <span>Discipline</span>
              <strong className="text-[#f0d78c]">{psych.scoredCount ? `${psych.discipline}` : '—'}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong className="text-[#f0d78c]">{psych.scoredCount ? `${psych.confidence}` : '—'}</strong>
            </div>
          </div>
          <p className="tj-analytics__snap-note">
            Psychology charts unlock as you log Before / After emotion + sliders on each trade.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
