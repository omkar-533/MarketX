import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Copy,
  ExternalLink,
  ImageOff,
  Link2,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { listIndicators, type IndicatorItem } from '../services/indicatorLibrary';
import { TRIAL_DAYS } from '../constants/plans';

export default function Indicators() {
  const [items, setItems] = useState<IndicatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<IndicatorItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await listIndicators();
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load indicators');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [active]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [items, query]);

  const copyLink = async () => {
    if (!active?.link) return;
    try {
      await navigator.clipboard.writeText(active.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="w-full pb-10">
      <div className="relative overflow-hidden rounded-2xl border border-[#1a1f2e] bg-[#0b0e17] mb-6">
        <div
          className="absolute inset-0 opacity-70 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 70% 80% at 12% 20%, rgba(212,175,55,0.16), transparent 55%), radial-gradient(ellipse 50% 60% at 88% 10%, rgba(80,120,255,0.08), transparent 50%)',
          }}
        />
        <div className="relative px-5 sm:px-8 py-7 sm:py-9 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#d4af37] mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Indicator library
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Indicators via invite link
            </h1>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Open any card for the share link. New accounts get a {TRIAL_DAYS}-day demo — after that,
              the desk approves longer access.
            </p>
            <p className="text-[11px] text-slate-600 mt-3">
              {items.length} indicator{items.length === 1 ? '' : 's'} in the library
            </p>
          </div>
          <div className="relative w-full lg:w-[280px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200 focus:outline-none focus:border-[#d4af37]/40"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading library…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center text-sm text-red-300">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#0b0e17] p-12 text-center">
          <Link2 className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-300 font-medium">
            {items.length === 0 ? 'No indicators published yet' : 'No matches for that search'}
          </p>
          <p className="text-[12px] text-slate-500 mt-2 max-w-md mx-auto">
            {items.length === 0
              ? 'When the desk adds invite links from Admin → Indicators, they will appear here.'
              : 'Try a different title or keyword.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item, idx) => (
            <motion.button
              key={item.id}
              type="button"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: Math.min(idx * 0.04, 0.28) }}
              onClick={() => {
                setCopied(false);
                setActive(item);
              }}
              className="group text-left rounded-2xl border border-[#1a1f2e] bg-[#0b0e17] overflow-hidden hover:border-[#d4af37]/35 transition-colors flex flex-col"
            >
              <div className="relative aspect-[16/10] bg-[#121520] overflow-hidden">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-600">
                    <ImageOff className="w-7 h-7" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">No preview</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0e17] to-transparent" />
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h2 className="text-sm font-bold text-slate-100 leading-snug group-hover:text-[#d4af37] transition-colors">
                  {item.title}
                </h2>
                <p className="text-[12px] text-slate-500 mt-2 line-clamp-3 leading-relaxed flex-1">
                  {item.description || 'Open to get the invite link.'}
                </p>
                <div className="mt-3 pt-3 border-t border-[#1a1f2e] flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-[#d4af37]/70" />
                    Link
                  </span>
                  <span className="text-[#d4af37]/80 group-hover:text-[#d4af37]">Open</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {active && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              aria-label="Close"
              onClick={() => setActive(null)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="indicator-detail-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="relative w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl border border-[#1a1f2e] bg-[#0b0e17] shadow-2xl flex flex-col"
            >
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#1a1f2e]">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37] mb-1">
                    Indicator
                  </p>
                  <h2
                    id="indicator-detail-title"
                    className="text-lg sm:text-xl font-extrabold text-white truncate"
                  >
                    {active.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-[#121520]"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto p-5 space-y-5">
                {active.imageUrl ? (
                  <div className="rounded-xl overflow-hidden border border-[#1a1f2e] bg-[#121520]">
                    <img
                      src={active.imageUrl}
                      alt=""
                      className="w-full max-h-[280px] object-contain bg-[#0a0e17]"
                    />
                  </div>
                ) : null}

                {active.description ? (
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {active.description}
                  </p>
                ) : null}

                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">
                    Invite link
                  </h3>
                  {active.link ? (
                    <>
                      <div className="rounded-xl border border-[#1a1f2e] bg-[#080a12] px-4 py-3 text-[12px] text-slate-300 break-all font-mono">
                        {active.link}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={active.link}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#d4af37] text-[#0b0e17] text-[11px] font-bold hover:brightness-110"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open link
                        </a>
                        <button
                          type="button"
                          onClick={() => void copyLink()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#d4af37]/30 bg-[#d4af37]/10 text-[11px] font-bold text-[#d4af37] hover:bg-[#d4af37]/15"
                        >
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? 'Copied' : 'Copy link'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                      Link locked — your {TRIAL_DAYS}-day demo ended. Request access so the desk can
                      approve a longer plan.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
