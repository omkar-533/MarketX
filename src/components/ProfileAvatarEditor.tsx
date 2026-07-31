import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, RotateCcw, X, ZoomIn } from 'lucide-react';
import { exportEditedAvatar, type AvatarFilterId } from '../services/profileAvatar';

const FILTERS: { id: AvatarFilterId; label: string; css: string }[] = [
  { id: 'none', label: 'Original', css: 'none' },
  { id: 'soft', label: 'Soft', css: 'brightness(1.06) contrast(0.92) saturate(0.9)' },
  { id: 'vivid', label: 'Vivid', css: 'brightness(1.05) contrast(1.15) saturate(1.35)' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.05)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.28) saturate(1.15) brightness(1.03)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(195deg) saturate(0.85) brightness(1.04)' },
];

type Props = {
  src: string;
  onCancel: () => void;
  onSave: (dataUrl: string) => Promise<void> | void;
};

/** Crop / zoom / pan / filter desk for profile photos. */
export default function ProfileAvatarEditor({ src, onCancel, onSave }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [filter, setFilter] = useState<AvatarFilterId>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setFilter('none');
    setError('');
  }, [src]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setFilter('none');
    setError('');
  };

  const save = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;
    setBusy(true);
    setError('');
    try {
      const rect = stage.getBoundingClientRect();
      const dataUrl = await exportEditedAvatar({
        src,
        stageSize: Math.round(Math.min(rect.width, rect.height)),
        zoom,
        offsetX: offset.x,
        offsetY: offset.y,
        filter,
      });
      await onSave(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save photo');
    } finally {
      setBusy(false);
    }
  }, [filter, offset.x, offset.y, onSave, src, zoom]);

  const filterCss = FILTERS.find((f) => f.id === filter)?.css ?? 'none';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-md rounded-2xl border border-[var(--tf-border)] bg-[var(--tf-surface)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--tf-text)]">Edit profile photo</h3>
            <p className="text-[10px] text-[var(--tf-text-muted)]">Drag to move · zoom · pick a filter</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-2 text-[var(--tf-text-muted)] hover:bg-[var(--tf-elevated)]"
            aria-label="Close editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={stageRef}
          className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl border border-gold/30 bg-[#0b0e17] touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
            style={{
              width: `${100 * zoom}%`,
              height: 'auto',
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              filter: filterCss,
            }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-[var(--tf-text-muted)]">
            <ZoomIn className="h-3.5 w-3.5" />
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="ml-auto h-1.5 flex-1 accent-[#d4af37]"
            />
            <span className="w-8 text-right tabular-nums text-[var(--tf-text)]">{zoom.toFixed(1)}x</span>
          </label>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--tf-text-muted)]">Filter</p>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    filter === f.id
                      ? 'bg-gold text-dark-surface'
                      : 'border border-[var(--tf-border)] bg-[var(--tf-elevated)] text-[var(--tf-text)] hover:border-gold/40'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? <p className="mt-2 text-[10px] text-red-400">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--tf-border)] py-2.5 text-xs font-semibold text-[var(--tf-text-secondary)] hover:bg-[var(--tf-elevated)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-gold py-2.5 text-xs font-bold text-dark-surface hover:bg-gold-light disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" />
            {busy ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
