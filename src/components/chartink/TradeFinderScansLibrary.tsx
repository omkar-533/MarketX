import { useMemo, useState } from 'react';
import {
  TRADEFINDER_CATEGORIES,
  TRADEFINDER_SCAN_PRESETS,
  type TradeFinderScanCategory,
  type TradeFinderScanPreset,
} from '../../services/tradefinderScans';
import type { FilterGroup } from '../../types/screener';

interface TradeFinderScansLibraryProps {
  onApply: (preset: TradeFinderScanPreset) => void;
  compact?: boolean;
}

export default function TradeFinderScansLibrary({ onApply, compact = false }: TradeFinderScansLibraryProps) {
  const [category, setCategory] = useState<TradeFinderScanCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TRADEFINDER_SCAN_PRESETS.filter((p) => {
      const catOk = category === 'all' || p.category === category;
      const searchOk =
        !q ||
        p.label.toLowerCase().includes(q) ||
        p.slug.includes(q) ||
        p.description.toLowerCase().includes(q);
      return catOk && searchOk;
    });
  }, [category, search]);

  const cloneGroups = (groups: FilterGroup[]): FilterGroup[] =>
    groups.map((g) => ({
      ...g,
      rules: g.rules.map((r) => ({ ...r })),
      children: [],
    }));

  return (
    <div className={`ci-tf-library ${compact ? 'ci-tf-library--compact' : ''}`}>
      <div className="ci-tf-library-head">
        <span className="ci-toolbar-title">Master TX · Market Master</span>
        <span className="ci-tf-library-count">{TRADEFINDER_SCAN_PRESETS.length}</span>
      </div>
      <p className="ci-tf-library-hint">
        Market Master presets — tap to run scan in Master TX.
      </p>
      <input
        className="ci-paste-input w-full mb-2"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search scan…"
      />
      <div className="ci-presets mb-2 max-h-16 overflow-y-auto">
        <button
          type="button"
          className={`ci-pill ${category === 'all' ? 'ci-pill--active' : ''}`}
          onClick={() => setCategory('all')}
        >
          All
        </button>
        {TRADEFINDER_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`ci-pill ${category === cat ? 'ci-pill--active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <ul className="ci-tf-scan-list">
        {filtered.map((preset) => (
          <li key={preset.slug}>
            <button
              type="button"
              className="ci-tf-scan-item"
              title={preset.description}
              onClick={() =>
                onApply({
                  ...preset,
                  groups: cloneGroups(preset.groups),
                })
              }
            >
              <span className="ci-tf-scan-name">{preset.label}</span>
              <span className="ci-tf-scan-meta">{preset.category}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-xs text-dark-muted py-3 text-center">No scans match your filter</li>
        )}
      </ul>
    </div>
  );
}
