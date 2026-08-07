import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  adminCreateIndicator,
  adminUpdateIndicator,
  type IndicatorItem,
} from '../../services/indicatorLibrary';
import {
  looksLikePastedScriptDocs,
  sanitizeIndicatorDescription,
} from '../../services/indicatorCopy';
import { parsePineSettings } from '../../services/pineSettings';

export type TerminalWolfCreatePanelProps = {
  open: boolean;
  /** When set, editor is in edit mode (admin must have pineSource on the item). */
  editing: IndicatorItem | null;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * TradingView-style Pine create/edit — Terminal → Indicators → Wolf (admin only).
 * Members never see this panel or the source.
 */
export default function TerminalWolfCreatePanel({
  open,
  editing,
  onClose,
  onSaved,
}: TerminalWolfCreatePanelProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pineSource, setPineSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const settingsPreview = useMemo(() => parsePineSettings(pineSource), [pineSource]);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title || '');
    const desc = editing?.description || '';
    // Auto-clear junk markdown docs that were wrongly saved into description
    setDescription(looksLikePastedScriptDocs(desc) ? '' : desc);
    setPineSource(editing?.pineSource || '');
    setError('');
    setSaving(false);
  }, [open, editing?.id, editing?.title, editing?.description, editing?.pineSource]);

  if (!open) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = title.trim();
    const pine = pineSource.trim();
    const blurb = sanitizeIndicatorDescription(description, '').trim();
    if (!name) {
      setError('Enter an indicator name.');
      return;
    }
    if (!pine) {
      setError('Paste your Pine Script source (TradingView //@version=… ).');
      return;
    }
    if (!/\/\/\s*@version\s*=\s*\d+/i.test(pine) && !/\bindicator\s*\(/i.test(pine)) {
      setError('Pine should look like TradingView script ( //@version=5 or //@version=6 and indicator(...) ).');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const cleanDesc = blurb || 'Plots on Terminal chart';
      if (editing?.id) {
        await adminUpdateIndicator(editing.id, {
          title: name,
          description: cleanDesc,
          pineSource: pine,
          link: editing.link || '',
          howToVideoUrl: editing.howToVideoUrl || '',
          published: true,
        });
      } else {
        await adminCreateIndicator({
          title: name,
          description: cleanDesc,
          pineSource: pine,
          link: '',
          published: true,
          sortOrder: 0,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save indicator');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="wolf-term__pine-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <form
        className="wolf-term__pine-sheet"
        role="dialog"
        aria-label={editing ? 'Edit indicator' : 'Create indicator'}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <header className="wolf-term__pine-head">
          <div>
            <b>{editing ? 'Edit Indicator' : 'Create Indicator'}</b>
            <em>Name, short list text, and full Pine Script — everything editable</em>
          </div>
          <button type="button" className="wolf-term__icon-btn" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <label className="wolf-term__pine-field">
          <span>1 · Indicator name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Wolf Confluence Pro"
            maxLength={120}
            autoFocus
            disabled={saving}
          />
        </label>

        <label className="wolf-term__pine-field">
          <span className="wolf-term__pine-field-row">
            <span>2 · List description (short)</span>
            <button
              type="button"
              className="wolf-term__pine-clear"
              disabled={saving || !description}
              onClick={() => setDescription('')}
            >
              Clear
            </button>
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown under the name in Indicators → Wolf (optional)"
            maxLength={200}
            disabled={saving}
          />
        </label>

        <label className="wolf-term__pine-field wolf-term__pine-field--code">
          <span className="wolf-term__pine-field-row">
            <span>3 · Pine Script (TradingView)</span>
            <button
              type="button"
              className="wolf-term__pine-clear"
              disabled={saving || !pineSource}
              onClick={() => {
                if (window.confirm('Clear the entire Pine Script?')) setPineSource('');
              }}
            >
              Clear script
            </button>
          </span>
          <textarea
            value={pineSource}
            onChange={(e) => setPineSource(e.target.value)}
            placeholder={`//@version=6\nindicator("My Wolf Indicator", overlay=true)\n\nlen = input.int(14, "Length")\nplot(ta.sma(close, len), "SMA")`}
            spellCheck={false}
            disabled={saving}
            readOnly={false}
          />
        </label>

        {settingsPreview.length ? (
          <p className="wolf-term__pine-hint">
            Detected {settingsPreview.length} input
            {settingsPreview.length === 1 ? '' : 's'} for member settings (source stays encrypted —
            members never see this code).
          </p>
        ) : (
          <p className="wolf-term__pine-hint">
            Tip: use <code>input.*</code> so members get a settings panel without seeing your source.
            Long Markdown docs belong in comments inside Pine — keep the list description short.
          </p>
        )}

        {error ? <p className="wolf-term__pine-error">{error}</p> : null}

        <footer className="wolf-term__pine-foot">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : editing ? (
              'Save & publish'
            ) : (
              'Publish to Wolf'
            )}
          </button>
        </footer>
      </form>
    </div>
  );
}
