import { motion } from 'framer-motion';
import { Check, Circle, Crosshair, Sparkles, Tags, Zap } from 'lucide-react';
import {
  QUICK_TRADE_TAGS,
  type FormDraftAssist,
} from '../../services/journalAiAssist';

type Props = {
  assist: FormDraftAssist;
  previewPnl: number | null;
  formatPnl: (n: number) => string;
  onApplyTag: (tag: string) => void;
  onApplyStrategy?: (strategy: string) => void;
  onHunterReview?: () => void;
  activeTags: string;
};

/** Sticky AI rail while logging a trade — fills blank space, guides quality. */
export default function JournalTradeAssistPanel({
  assist,
  previewPnl,
  formatPnl,
  onApplyTag,
  onApplyStrategy,
  onHunterReview,
  activeTags,
}: Props) {
  const tagSet = new Set(
    activeTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );

  return (
    <motion.aside
      className="tj-assist"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      <div className="tj-assist__orb" aria-hidden />
      <div className="tj-assist__head">
        <Sparkles className="w-4 h-4 text-[#d4af37]" />
        <div>
          <p className="tj-chart__eyebrow">AI Desk</p>
          <h3 className="tj-assist__title">Live log coach</h3>
        </div>
      </div>

      <div className="tj-assist__score-row">
        <div
          className="tj-assist__ring"
          style={{
            background: `conic-gradient(#d4af37 ${assist.score * 3.6}deg, rgba(255,255,255,0.07) 0deg)`,
          }}
        >
          <div className="tj-assist__ring-inner">
            <span>{assist.score}</span>
            <small>{assist.label}</small>
          </div>
        </div>
        <div className="tj-assist__score-meta">
          <p className="tj-assist__score-label">Draft completeness</p>
          {previewPnl != null ? (
            <p className={`tj-assist__pnl ${previewPnl >= 0 ? 'up' : 'down'}`}>
              {formatPnl(previewPnl)}
              <span>{previewPnl >= 0 ? 'Profit' : 'Loss'}</span>
            </p>
          ) : (
            <p className="text-xs text-slate-500">Enter P&amp;L to preview</p>
          )}
          {assist.suggestedRr != null ? (
            <p className="tj-assist__rr">
              <Crosshair className="w-3 h-3" />
              Planned R:R ≈ <strong>{assist.suggestedRr}x</strong>
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">Add SL + Target for R:R hint</p>
          )}
        </div>
      </div>

      <div className="tj-assist__checklist">
        {assist.checklist.map((item, i) => (
          <motion.div
            key={item.id}
            className={`tj-assist__check ${item.done ? 'is-done' : ''}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 * i }}
          >
            {item.done ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            <span>{item.label}</span>
          </motion.div>
        ))}
      </div>

      <div className="tj-assist__block">
        <div className="tj-assist__block-head">
          <Tags className="w-3.5 h-3.5" />
          Quick tags
        </div>
        <div className="tj-assist__chips">
          {QUICK_TRADE_TAGS.map((tag) => {
            const on = tagSet.has(tag.toLowerCase());
            return (
              <button
                key={tag}
                type="button"
                className={`tj-assist__chip ${on ? 'is-on' : ''}`}
                onClick={() => onApplyTag(tag)}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {onApplyStrategy ? (
        <div className="tj-assist__block">
          <div className="tj-assist__block-head">
            <Sparkles className="w-3.5 h-3.5" />
            Strategy presets
          </div>
          <div className="tj-assist__chips">
            {['ORB', 'VWAP', 'Supply Demand', 'Breakout', 'Scalp'].map((s) => (
              <button key={s} type="button" className="tj-assist__chip" onClick={() => onApplyStrategy(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {assist.gaps.length > 0 ? (
        <p className="tj-assist__hint">Next: fill {assist.gaps.slice(0, 2).join(' · ')}</p>
      ) : (
        <p className="tj-assist__hint tj-assist__hint--ok">Draft looks desk-ready — hit Save Trade.</p>
      )}

      {onHunterReview ? (
        <button type="button" className="tj-btn tj-btn--primary tj-btn--sm w-full justify-center mt-2" onClick={onHunterReview}>
          <Zap className="w-3.5 h-3.5" /> Review journal with Hunter
        </button>
      ) : null}
    </motion.aside>
  );
}
