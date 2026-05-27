import { FolderPlus, Trash2 } from 'lucide-react';
import type { SavedScreener } from '../../types/screener';

interface ChartinkScansPanelProps {
  savedScans: SavedScreener[];
  activeId: string | null;
  syncNote: string;
  hydrating: boolean;
  onNew: () => void;
  onLoad: (id: string) => void;
  onDuplicate: (scan: SavedScreener) => void;
  onDelete: (id: string) => void;
  showLoginHint?: boolean;
  /** Inside toolbar dropdown — no outer card chrome */
  embedded?: boolean;
  hideHead?: boolean;
}

export default function ChartinkScansPanel({
  savedScans,
  activeId,
  syncNote,
  hydrating,
  onNew,
  onLoad,
  onDuplicate,
  onDelete,
  showLoginHint,
  embedded = false,
  hideHead = false,
}: ChartinkScansPanelProps) {
  return (
    <div className={embedded ? 'ci-scans-embedded' : 'ci-scans-panel'}>
      {!hideHead && (
        <div className="ci-scans-panel-head">
          <span className="ci-toolbar-title">Browse scans</span>
          <button type="button" onClick={onNew} className="ci-btn-ghost p-1.5" title="New scan">
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>
      )}
      {syncNote ? <p className="ci-scans-sync">{syncNote}</p> : null}

      {hydrating ? (
        <p className="ci-scans-empty">Loading…</p>
      ) : savedScans.length === 0 ? (
        <div className="ci-scans-empty-box">
          <p>No saved scans</p>
          <button type="button" onClick={onNew} className="ci-link">
            + Create scan
          </button>
        </div>
      ) : (
        <ul className="ci-scans-list">
          {savedScans.map((scan) => (
            <li key={scan.id}>
              <button
                type="button"
                className={`ci-saved-item ${activeId === scan.id ? 'ci-saved-item--active' : ''}`}
                onClick={() => onLoad(scan.id)}
              >
                <span className="ci-saved-name">{scan.name}</span>
                <span className="ci-saved-meta">
                  {scan.mode} · {new Date(scan.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </button>
              <div className="ci-saved-actions">
                <button type="button" className="ci-link" onClick={() => onDuplicate(scan)}>
                  Clone
                </button>
                <button type="button" onClick={() => onDelete(scan.id)} className="ci-link text-rose-400" aria-label="Delete">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showLoginHint && (
        <p className="ci-scans-login-hint">Login to sync scans to your account.</p>
      )}
    </div>
  );
}
