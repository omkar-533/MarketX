import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import type { VisualStoryStep } from '../../utils/wolfVisualStory';
import ScreenshotAnnotOverlay from './ScreenshotAnnotOverlay';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';

type Props = {
  steps: VisualStoryStep[];
  imageUrl?: string | null;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  /** Controlled index — parent syncs highlight */
  index?: number;
  onIndexChange?: (i: number) => void;
  /** Autoplay “Trade Movie” */
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  hindi?: boolean;
};

export default function VisualStoryEngine({
  steps,
  imageUrl,
  levels = [],
  shapes = [],
  index: controlled,
  onIndexChange,
  playing: playingCtrl,
  onPlayingChange,
  hindi,
}: Props) {
  const [localIndex, setLocalIndex] = useState(0);
  const [localPlaying, setLocalPlaying] = useState(false);
  const index = controlled ?? localIndex;
  const playing = playingCtrl ?? localPlaying;

  const setIndex = (i: number) => {
    const next = Math.max(0, Math.min(steps.length - 1, i));
    if (controlled == null) setLocalIndex(next);
    onIndexChange?.(next);
  };

  const setPlaying = (v: boolean) => {
    if (playingCtrl == null) setLocalPlaying(v);
    onPlayingChange?.(v);
  };

  useEffect(() => {
    if (!playing || steps.length === 0) return;
    const t = window.setInterval(() => {
      setIndex(index >= steps.length - 1 ? 0 : index + 1);
    }, 2800);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, steps.length]);

  if (!steps.length) return null;
  const step = steps[Math.min(index, steps.length - 1)];

  return (
    <div className="wolf-story">
      <div className="wolf-story__top">
        <span className="wolf-story__kicker">{hindi ? 'VISUAL STORY' : 'VISUAL STORY'}</span>
        <span className="wolf-story__count">
          {index + 1} / {steps.length}
        </span>
      </div>

      <div className="wolf-story__stage">
        {imageUrl ? (
          <ScreenshotAnnotOverlay
            imageUrl={imageUrl}
            levels={levels}
            shapes={shapes}
            highlightLabel={step.highlight}
          />
        ) : (
          <div className="wolf-story__placeholder">{step.caption}</div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            className="wolf-story__caption"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <div className="wolf-story__caption-title">{step.title}</div>
            <p className="wolf-story__caption-sub">{step.subtitle}</p>
            <span className="wolf-story__badge">{step.caption}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="wolf-story__progress" role="tablist">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`wolf-story__tick ${i === index ? 'is-on' : ''} ${i < index ? 'is-done' : ''}`}
            onClick={() => {
              setPlaying(false);
              setIndex(i);
            }}
          />
        ))}
      </div>

      <div className="wolf-story__controls">
        <button type="button" aria-label="Previous" onClick={() => setIndex(index - 1)} disabled={index <= 0}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="wolf-story__play"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause' : 'Play trade movie'}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          <span>{playing ? 'PAUSE' : 'TRADE MOVIE'}</span>
        </button>
        <button
          type="button"
          aria-label="Replay"
          onClick={() => {
            setIndex(0);
            setPlaying(true);
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => setIndex(index + 1)}
          disabled={index >= steps.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
