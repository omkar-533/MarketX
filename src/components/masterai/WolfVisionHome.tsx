import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, Radar } from 'lucide-react';
import HunterMark from '../HunterMark';
import { requestOpenRadar } from '../../services/radar/radarBridge';

type Props = {
  onPickFile: (file: File) => void;
  disabled?: boolean;
  hindi?: boolean;
};

/** Empty state — upload only. No analysis controls before a chart exists. */
export default function WolfVisionHome({ onPickFile, disabled, hindi }: Props) {
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
        {hindi
          ? 'Chart upload karo. Main saath padhunga.'
          : "Upload a chart. I'll read it with you."}
      </p>

      <motion.button
        type="button"
        className={`wolf-vision-home__drop ${dragOver ? 'is-over' : ''}`}
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
        <span className="wolf-vision-home__drop-icon" aria-hidden>
          <ImagePlus className="h-6 w-6" />
        </span>
        <span className="wolf-vision-home__drop-label">
          {hindi ? 'UPLOAD CHART' : 'UPLOAD CHART'}
        </span>
        <span className="wolf-vision-home__drop-hint">
          {hindi ? 'Drag & drop · Paste · Ctrl+V' : 'Drag & drop · Paste screenshot · Ctrl+V'}
        </span>
      </motion.button>

      <ul className="wolf-vision-home__bullets" aria-label="What Wolf analyzes">
        {(hindi
          ? ['Market structure', 'Key levels', 'Liquidity', 'Entry opportunities', 'Invalidation', 'Targets']
          : ['Market structure', 'Key levels', 'Liquidity', 'Entry opportunities', 'Invalidation', 'Targets']
        ).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <div className="wolf-vision-home__radar-cta">
        <p className="wolf-vision-home__radar-copy">
          {hindi
            ? 'Kya dekhna hai clear nahi? WOLF dhoondh ke lata hai.'
            : "Don't know what to look for? Let WOLF find it."}
        </p>
        <button
          type="button"
          className="wolf-vision-home__radar-btn"
          disabled={disabled}
          onClick={() => requestOpenRadar()}
        >
          <Radar className="h-4 w-4" />
          SCAN THE MARKET
        </button>
      </div>

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
    </div>
  );
}
