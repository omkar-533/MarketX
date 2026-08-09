import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, Sparkles } from 'lucide-react';
import HunterMark from '../HunterMark';
import {
  WOLF_ANALYSIS_MODES,
  type WolfAnalysisMode,
  saveWolfAnalysisMode,
} from '../../constants/wolfAnalysisModes';

type Props = {
  analysisMode: WolfAnalysisMode;
  onModeChange: (mode: WolfAnalysisMode) => void;
  onPickFile: (file: File) => void;
  onAnalyze: () => void;
  hasImage: boolean;
  previewUrl?: string | null;
  disabled?: boolean;
  hindi?: boolean;
};

/** Chart-first empty desk: drop zone + setup chips + ANALYZE CTA. */
export default function WolfVisionHome({
  analysisMode,
  onModeChange,
  onPickFile,
  onAnalyze,
  hasImage,
  previewUrl,
  disabled,
  hindi,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const takeFile = useCallback(
    (file?: File | null) => {
      if (!file || disabled) return;
      if (!file.type.startsWith('image/')) return;
      onPickFile(file);
    },
    [disabled, onPickFile],
  );

  return (
    <div className="wolf-vision-home">
      <HunterMark />
      <motion.h2
        className="wolf-vision-home__title"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        WOLF AI
      </motion.h2>
      <motion.p
        className="wolf-vision-home__tag"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
      >
        {hindi ? 'AI that sees the trade with you.' : 'AI That Sees The Trade With You.'}
      </motion.p>

      <motion.button
        type="button"
        className={`wolf-vision-home__drop ${dragOver ? 'is-over' : ''} ${hasImage ? 'has-image' : ''}`}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          takeFile(e.dataTransfer.files?.[0]);
        }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="wolf-vision-home__preview" />
        ) : (
          <>
            <span className="wolf-vision-home__drop-icon" aria-hidden>
              <ImagePlus className="h-7 w-7" />
            </span>
            <span className="wolf-vision-home__drop-label">
              {hindi ? 'Chart yahan drop / upload karo' : 'DROP CHART HERE'}
            </span>
            <span className="wolf-vision-home__drop-hint">
              {hindi ? 'Drag · click · paste' : 'Drag · click · paste screenshot'}
            </span>
          </>
        )}
      </motion.button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          takeFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="wolf-vision-home__setups">
        <span className="wolf-vision-home__setups-label">
          {hindi ? 'Analysis choose karo' : 'Choose your analysis'}
        </span>
        <div className="wolf-vision-home__chips" role="list">
          {WOLF_ANALYSIS_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="listitem"
              className={`wolf-vision-home__chip ${analysisMode === m.id ? 'is-on' : ''}`}
              title={m.hint}
              disabled={disabled}
              onClick={() => {
                onModeChange(m.id);
                saveWolfAnalysisMode(m.id);
              }}
            >
              {m.label}
              {analysisMode === m.id ? <span className="wolf-vision-home__check">✓</span> : null}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="wolf-vision-home__cta"
        disabled={disabled || !hasImage}
        onClick={onAnalyze}
      >
        <Sparkles className="h-4 w-4" />
        {hindi ? 'ANALYZE CHART' : 'ANALYZE CHART'}
      </button>
    </div>
  );
}
