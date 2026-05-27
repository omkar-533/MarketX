import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn } from 'lucide-react';

export interface ImageLightboxProps {
  src: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, title, subtitle, onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [src, onClose]);

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={title ?? 'Trade screenshot'}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/85 backdrop-blur-sm cursor-zoom-out"
            onClick={onClose}
            aria-label="Close image"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className="relative z-10 flex flex-col items-center max-w-[min(96vw,1200px)] max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute -top-2 -right-2 sm:top-0 sm:right-0 z-20 p-2 rounded-full bg-[#1a1f2e] border border-[#24324b] text-slate-200 hover:bg-[#24324b] hover:text-white shadow-lg"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {(title || subtitle) && (
              <div className="mb-3 text-center px-4">
                {title && <p className="text-sm font-bold text-white">{title}</p>}
                {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
              </div>
            )}

            <img
              src={src}
              alt={title ?? 'Trade screenshot'}
              className="max-w-full max-h-[min(78vh,800px)] w-auto h-auto rounded-xl border border-[#24324b] shadow-2xl object-contain bg-[#0b0e17]"
            />

            <p className="mt-3 text-[10px] text-slate-500 flex items-center gap-1">
              <ZoomIn className="w-3 h-3" /> Click outside or press Esc to close
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
