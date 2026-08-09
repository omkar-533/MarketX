import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus } from 'lucide-react';
import HunterMark from '../HunterMark';
import type { WolfAnalysisMode } from '../../constants/wolfAnalysisModes';
import WolfAnalyzeSelect from './WolfAnalyzeSelect';

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

/** Compact empty workspace — upload first; analysis mode is secondary (AUTO default). */
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
    <div className="wolf-vision-home wolf-vision-home--compact">
      <HunterMark compact showCaption={false} />
      <motion.h2
        className="wolf-vision-home__title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        WOLF AI
      </motion.h2>
      <p className="wolf-vision-home__tag">
        {hindi ? 'Chart drop karo — Wolf dekhega.' : 'Drop your chart — Wolf sees it with you.'}
      </p>

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
        transition={{ delay: 0.06 }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="wolf-vision-home__preview" />
        ) : (
          <>
            <span className="wolf-vision-home__drop-icon" aria-hidden>
              <ImagePlus className="h-6 w-6" />
            </span>
            <span className="wolf-vision-home__drop-label">
              {hindi ? 'CHART YAHAN DROP KARO' : 'DROP YOUR CHART HERE'}
            </span>
            <span className="wolf-vision-home__drop-hint">
              {hindi ? 'Drag · click · paste' : 'Drag · click · paste screenshot'}
            </span>
            <span className="wolf-vision-home__upload-pill">
              {hindi ? '+ UPLOAD CHART' : '+ UPLOAD CHART'}
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

      <div className="wolf-vision-home__tools">
        <WolfAnalyzeSelect
          value={analysisMode}
          onChange={onModeChange}
          disabled={disabled}
          hindi={hindi}
        />
        <p className="wolf-vision-home__auto-note">
          {hindi ? 'Default: Auto analysis' : 'Auto analysis by default'}
        </p>
      </div>

      {hasImage ? (
        <button
          type="button"
          className="wolf-vision-home__cta"
          disabled={disabled}
          onClick={onAnalyze}
        >
          {hindi ? 'ANALYZE CHART' : 'ANALYZE CHART'}
        </button>
      ) : null}
    </div>
  );
}
