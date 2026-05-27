import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderPlus } from 'lucide-react';
import type { SavedScreener } from '../../types/screener';
import ChartinkScansPanel from './ChartinkScansPanel';

interface ChartinkScansDropdownProps {
  savedScans: SavedScreener[];
  activeId: string | null;
  activeName: string;
  syncNote: string;
  hydrating: boolean;
  onNew: () => void;
  onLoad: (id: string) => void;
  onDuplicate: (scan: SavedScreener) => void;
  onDelete: (id: string) => void;
  showLoginHint?: boolean;
}

export default function ChartinkScansDropdown({
  savedScans,
  activeId,
  activeName,
  syncNote,
  hydrating,
  onNew,
  onLoad,
  onDuplicate,
  onDelete,
  showLoginHint,
}: ChartinkScansDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label = activeName.trim() || 'Untitled scan';

  return (
    <div className="ci-scans-dropdown-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ci-scans-trigger ${open ? 'ci-scans-trigger--open' : ''}`}
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="ci-scans-trigger-label">My scans</span>
        <span className="ci-scans-trigger-name" title={label}>
          {label}
        </span>
        <span className="ci-scans-trigger-count">{savedScans.length}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="ci-scans-dropdown-panel" role="listbox">
          <div className="ci-scans-dropdown-head">
            <span className="ci-toolbar-title">Saved screeners</span>
            <button
              type="button"
              className="ci-btn-ghost p-1.5"
              title="New scan"
              onClick={() => {
                onNew();
                setOpen(false);
              }}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          <ChartinkScansPanel
            embedded
            savedScans={savedScans}
            activeId={activeId}
            syncNote={syncNote}
            hydrating={hydrating}
            onNew={() => {
              onNew();
              setOpen(false);
            }}
            onLoad={(id) => {
              onLoad(id);
              setOpen(false);
            }}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            showLoginHint={showLoginHint}
            hideHead
          />
        </div>
      )}
    </div>
  );
}
