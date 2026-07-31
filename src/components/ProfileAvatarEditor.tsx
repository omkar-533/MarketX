import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { exportEditedAvatar, type AvatarFilterId } from '../services/profileAvatar';

const FILTERS: { id: AvatarFilterId; label: string; css: string }[] = [
  { id: 'none', label: 'Original', css: 'none' },
  { id: 'soft', label: 'Soft', css: 'brightness(1.06) contrast(0.92) saturate(0.9)' },
  { id: 'vivid', label: 'Vivid', css: 'brightness(1.05) contrast(1.15) saturate(1.35)' },
  { id: 'bw', label: 'Mono', css: 'grayscale(1) contrast(1.05)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.28) saturate(1.15) brightness(1.03)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(195deg) saturate(0.85) brightness(1.04)' },
];

/** Circle diameter as fraction of the square stage (matches CSS inset). */
const CROP_INSET = 0.11;

type Props = {
  src: string;
  onCancel: () => void;
  onSave: (dataUrl: string) => Promise<void> | void;
};

/** Instagram / LinkedIn-style circular crop desk for profile photos. */
export default function ProfileAvatarEditor({ src, onCancel, onSave }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const maskId = useId().replace(/:/g, '');
  const [zoom, setZoom] = useState(1.2);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [filter, setFilter] = useState<AvatarFilterId>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setZoom(1.2);
    setOffset({ x: 0, y: 0 });
    setFilter('none');
    setError('');
  }, [src]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
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

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    setZoom((z) => Math.min(3, Math.max(1, Number((z + delta).toFixed(2)))));
  };

  const nudgeZoom = (dir: -1 | 1) => {
    setZoom((z) => Math.min(3, Math.max(1, Number((z + dir * 0.1).toFixed(2)))));
  };

  const reset = () => {
    setZoom(1.2);
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
      const full = Math.round(Math.min(rect.width, rect.height));
      // Export only the circular window (square bounding box of the ring).
      const windowSize = Math.round(full * (1 - CROP_INSET * 2));
      const dataUrl = await exportEditedAvatar({
        src,
        stageSize: windowSize,
        // Image is sized vs full stage; scale zoom/offset into crop-window space.
        zoom: zoom * (full / windowSize),
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

  const imageStyle: React.CSSProperties = {
    width: `${100 * zoom}%`,
    height: 'auto',
    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
    filter: filterCss,
  };

  const insetPct = `${CROP_INSET * 100}%`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/88 backdrop-blur-[2px]" />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0c12] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-white/55 transition hover:bg-white/8 hover:text-white"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-[13px] font-semibold tracking-wide text-white">Crop photo</p>
            <p className="text-[10px] text-white/40">Drag to reposition · scroll to zoom</p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-full p-2 text-white/55 transition hover:bg-white/8 hover:text-white"
            aria-label="Reset"
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div
          className="relative bg-black px-5 py-6 sm:px-8 sm:py-7"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <div
            ref={stageRef}
            className="relative mx-auto aspect-square w-full max-w-[300px] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[#05060a] active:cursor-grabbing"
          >
            {/* Full photo (visible under dim) */}
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none will-change-transform"
              style={imageStyle}
            />

            {/* Dim everything outside the crop circle */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <mask id={maskId}>
                  <rect width="100%" height="100%" fill="white" />
                  <circle cx="50%" cy="50%" r={`${(1 - CROP_INSET * 2) * 50}%`} fill="black" />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask={`url(#${maskId})`} />
            </svg>

            {/* Gold ring + rule-of-thirds */}
            <div
              className="pointer-events-none absolute rounded-full"
              style={{ inset: insetPct }}
            >
              <div className="absolute inset-0 rounded-full ring-[1.5px] ring-[#d4af37] shadow-[0_0_28px_rgba(212,175,55,0.22)]" />
              <div className="absolute inset-0 overflow-hidden rounded-full opacity-[0.35]">
                <div className="absolute left-1/3 top-0 h-full w-px bg-white" />
                <div className="absolute left-2/3 top-0 h-full w-px bg-white" />
                <div className="absolute left-0 top-1/3 h-px w-full bg-white" />
                <div className="absolute left-0 top-2/3 h-px w-full bg-white" />
              </div>
              <div className="absolute left-1/2 top-0 h-2.5 w-px -translate-x-1/2 bg-[#d4af37]" />
              <div className="absolute bottom-0 left-1/2 h-2.5 w-px -translate-x-1/2 bg-[#d4af37]" />
              <div className="absolute left-0 top-1/2 h-px w-2.5 -translate-y-1/2 bg-[#d4af37]" />
              <div className="absolute right-0 top-1/2 h-px w-2.5 -translate-y-1/2 bg-[#d4af37]" />
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-white/[0.07] bg-[#0d1018] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => nudgeZoom(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 text-white/70 hover:bg-white/8"
              aria-label="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1.5 flex-1 appearance-none rounded-full bg-white/12 accent-[#d4af37] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#d4af37]"
              aria-label="Zoom"
            />
            <button
              type="button"
              onClick={() => nudgeZoom(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 text-white/70 hover:bg-white/8"
              aria-label="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="w-9 text-right text-[11px] tabular-nums text-white/45">{zoom.toFixed(1)}×</span>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Look</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className="group flex w-[58px] shrink-0 flex-col items-center gap-1.5"
                  >
                    <span
                      className={`relative h-12 w-12 overflow-hidden rounded-full transition ${
                        active
                          ? 'ring-2 ring-[#d4af37] ring-offset-2 ring-offset-[#0d1018]'
                          : 'ring-1 ring-white/15 group-hover:ring-white/35'
                      }`}
                    >
                      <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ filter: f.css }}
                        draggable={false}
                      />
                    </span>
                    <span className={`text-[10px] font-medium ${active ? 'text-[#d4af37]' : 'text-white/45'}`}>
                      {f.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error ? <p className="text-center text-[11px] text-red-400">{error}</p> : null}

          <div className="flex items-center gap-3 pt-1">
            <div
              className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-[#d4af37]/70 ring-offset-2 ring-offset-[#0d1018]"
              title="Preview"
            >
              <img
                src={src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: `${zoom * (100 / (1 - CROP_INSET * 2)) * 0.42}%`,
                  height: 'auto',
                  transform: `translate(calc(-50% + ${offset.x * 0.14}px), calc(-50% + ${offset.y * 0.14}px))`,
                  filter: filterCss,
                }}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#d4af37] py-3.5 text-sm font-bold text-[#0a0c12] transition hover:bg-[#e0c15a] disabled:opacity-60"
            >
              <Check className="h-4 w-4" />
              {busy ? 'Saving…' : 'Use this photo'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
