import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, X } from 'lucide-react';
import {
  evidenceConfidenceLabel,
  evidenceIcon,
  type WolfEvidenceItem,
} from '../../utils/wolfEvidence';
import {
  renderAllEvidence,
  renderFullAnnotatedChart,
  type RenderedEvidence,
} from '../../utils/chartEvidenceEngine';

type Props = {
  originalUrl: string;
  evidence: WolfEvidenceItem[];
  activeId?: string | null;
  onShowOnChart?: (item: WolfEvidenceItem) => void;
  hindi?: boolean;
};

function CompareSlider({
  originalUrl,
  annotatedUrl,
}: {
  originalUrl: string;
  annotatedUrl: string;
}) {
  const [pct, setPct] = useState(62);
  return (
    <div className="wolf-ev-compare">
      <div className="wolf-ev-compare__head">
        <span>ORIGINAL</span>
        <span>WOLF VISION</span>
      </div>
      <div className="wolf-ev-compare__frame">
        <img src={originalUrl} alt="" className="wolf-ev-compare__img" />
        <div className="wolf-ev-compare__clip" style={{ width: `${pct}%` }}>
          <img src={annotatedUrl} alt="" className="wolf-ev-compare__img" />
        </div>
        <div className="wolf-ev-compare__handle" style={{ left: `${pct}%` }} aria-hidden />
      </div>
      <input
        className="wolf-ev-compare__range"
        type="range"
        min={5}
        max={95}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        aria-label="Original versus Wolf Vision"
      />
    </div>
  );
}

function EvidenceLightbox({
  items,
  index,
  onClose,
  onIndex,
  onShowOnChart,
}: {
  items: RenderedEvidence[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  onShowOnChart?: (item: WolfEvidenceItem) => void;
}) {
  const item = items[index];
  if (!item) return null;
  return (
    <div className="wolf-ev-light" role="dialog" aria-modal>
      <button type="button" className="wolf-ev-light__x" onClick={onClose} aria-label="Close">
        <X className="h-4 w-4" />
      </button>
      <img src={item.imageUrl} alt="" className="wolf-ev-light__img" />
      <div className="wolf-ev-light__meta">
        <div className="wolf-ev-light__title">
          {evidenceIcon(item.type)} {item.title}
        </div>
        <p>{item.description}</p>
        <div className="wolf-ev-light__actions">
          <button type="button" disabled={index <= 0} onClick={() => onIndex(index - 1)}>
            ← Prev
          </button>
          <button
            type="button"
            className="wolf-ev-light__show"
            onClick={() => {
              onShowOnChart?.(item);
              onClose();
            }}
          >
            <Crosshair className="h-3.5 w-3.5" />
            SHOW ON CHART
          </button>
          <button type="button" disabled={index >= items.length - 1} onClick={() => onIndex(index + 1)}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

/** Wolf Evidence — crops from the user's chart + interactive cards. */
export default function WolfEvidenceGallery({
  originalUrl,
  evidence,
  activeId,
  onShowOnChart,
  hindi,
}: Props) {
  const [rendered, setRendered] = useState<RenderedEvidence[]>([]);
  const [annotatedFull, setAnnotatedFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightIndex, setLightIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!originalUrl || evidence.length === 0) {
      setRendered([]);
      setAnnotatedFull(null);
      return;
    }
    setLoading(true);
    void (async () => {
      const crops = await renderAllEvidence(originalUrl, evidence);
      const full = await renderFullAnnotatedChart(originalUrl, evidence);
      if (cancelled) return;
      setRendered(crops);
      setAnnotatedFull(full);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [originalUrl, evidence]);

  const active = useMemo(
    () => rendered.find((r) => r.id === activeId) || null,
    [rendered, activeId],
  );

  if (!evidence.length) return null;

  return (
    <div className="wolf-ev">
      <div className="wolf-ev__kicker">🐺 WOLF EVIDENCE</div>
      <p className="wolf-ev__sub">
        {hindi
          ? 'Har claim aapke original chart se prove hota hai.'
          : 'Every claim is proven from your original chart.'}
      </p>

      {annotatedFull ? (
        <CompareSlider originalUrl={originalUrl} annotatedUrl={annotatedFull} />
      ) : (
        <div className="wolf-ev-compare wolf-ev-compare--solo">
          <img src={originalUrl} alt="" />
        </div>
      )}

      {active ? (
        <div className="wolf-ev__focus">
          <img src={active.imageUrl} alt="" />
          <div>
            <strong>
              {evidenceIcon(active.type)} {active.title}
            </strong>
            <span>{evidenceConfidenceLabel(active.confidence)}</span>
          </div>
        </div>
      ) : null}

      <div className="wolf-ev__head">WHY THIS SETUP?</div>
      {loading ? <p className="wolf-ev__loading">Cropping evidence from your chart…</p> : null}

      <div className="wolf-ev__track">
        {rendered.map((item, i) => (
          <article
            key={item.id}
            className={`wolf-ev__card ${activeId === item.id ? 'is-active' : ''}`}
          >
            <button type="button" className="wolf-ev__thumb" onClick={() => setLightIndex(i)}>
              <img src={item.imageUrl} alt="" />
            </button>
            <div className="wolf-ev__card-body">
              <div className="wolf-ev__title">
                {evidenceIcon(item.type)} {item.title}
              </div>
              <p>{item.description || evidenceConfidenceLabel(item.confidence)}</p>
              <button
                type="button"
                className="wolf-ev__show"
                onClick={() => onShowOnChart?.(item)}
              >
                <Crosshair className="h-3.5 w-3.5" />
                SHOW ON CHART
              </button>
            </div>
          </article>
        ))}
      </div>

      <AnimatePresence>
        {lightIndex != null ? (
          <motion.div
            className="wolf-ev-light-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <EvidenceLightbox
              items={rendered}
              index={lightIndex}
              onClose={() => setLightIndex(null)}
              onIndex={setLightIndex}
              onShowOnChart={onShowOnChart}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
