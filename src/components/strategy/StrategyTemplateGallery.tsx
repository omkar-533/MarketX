import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, Sparkles, Zap } from 'lucide-react';
import { OUTLOOK_COLORS, STRATEGY_VISUALS, type StrategyOutlook } from './strategyVisuals';
import StrategyTemplateCard from './StrategyTemplateCard';

const OUTLOOK_FILTERS: { id: 'all' | StrategyOutlook; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'volatile', label: 'High Vol' },
];

interface StrategyTemplateGalleryProps {
  selectedName: string;
  onSelect: (name: string) => void;
  defaultExpanded?: boolean;
}

export default function StrategyTemplateGallery({
  selectedName,
  onSelect,
  defaultExpanded = true,
}: StrategyTemplateGalleryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [outlook, setOutlook] = useState<'all' | StrategyOutlook>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STRATEGY_VISUALS.filter((v) => {
      if (outlook !== 'all' && v.outlook !== outlook) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.outlookLabel.toLowerCase().includes(q)
      );
    });
  }, [outlook, query]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: STRATEGY_VISUALS.length };
    STRATEGY_VISUALS.forEach((v) => {
      map[v.outlook] = (map[v.outlook] ?? 0) + 1;
    });
    return map;
  }, []);

  return (
    <section className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-dark-border bg-dark-elevated/50">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-gold" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gold flex items-center gap-2">
              Strategy Templates
              <span className="text-[10px] font-semibold text-dark-muted px-1.5 py-0.5 rounded-md bg-dark-bg border border-dark-border">
                {STRATEGY_VISUALS.length} presets
              </span>
            </h3>
            <p className="text-[11px] text-dark-muted mt-0.5">
              Click a card — payoff diagram and legs load automatically with live chain LTP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-muted pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search strategy…"
              className="tf-field w-44 pl-8 pr-2 py-1.5 text-xs rounded-lg border"
            />
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-dark-muted hover:text-gold rounded-lg border border-dark-border hover:border-gold/40 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-dark-border/60">
            {OUTLOOK_FILTERS.map((f) => {
              const active = outlook === f.id;
              const count = f.id === 'all' ? counts.all : counts[f.id] ?? 0;
              const colors = f.id !== 'all' ? OUTLOOK_COLORS[f.id as StrategyOutlook] : null;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOutlook(f.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    active
                      ? 'bg-gold/15 border-gold/40 text-gold shadow-sm'
                      : colors
                        ? `${colors.bg} ${colors.border} ${colors.text} opacity-80 hover:opacity-100`
                        : 'bg-dark-elevated border-dark-border text-dark-muted hover:text-slate-200'
                  }`}
                >
                  {f.label}
                  <span className={`text-[9px] px-1 rounded ${active ? 'bg-gold/20' : 'bg-dark-bg/80'}`}>{count}</span>
                </button>
              );
            })}
            <div className="sm:hidden flex-1 min-w-[140px] relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="tf-field w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border"
              />
            </div>
          </div>

          {selectedName && (
            <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-gold/10 border border-gold/25 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-gold shrink-0" />
              <span className="text-slate-300">
                Active: <span className="font-bold text-gold">{selectedName}</span>
                <span className="text-dark-muted"> — adjust legs below or pick another template</span>
              </span>
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-dark-muted">No strategies match your filter.</p>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {filtered.map((visual, index) => (
                <StrategyTemplateCard
                  key={visual.id}
                  visual={visual}
                  selected={selectedName === visual.name}
                  onSelect={() => onSelect(visual.name)}
                  index={index}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
