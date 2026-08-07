import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent,
} from 'react';
import { Loader2, Play, Save, X } from 'lucide-react';
import {
  adminCreateIndicator,
  adminRunPineDraft,
  adminUpdateIndicator,
  type IndicatorItem,
} from '../../services/indicatorLibrary';
import {
  looksLikePastedScriptDocs,
  sanitizeIndicatorDescription,
} from '../../services/indicatorCopy';
import { parsePineSettings } from '../../services/pineSettings';
import { fetchMarketOhlc } from '../../services/marketApiService';
import {
  apiSymbolFromTv,
  nativeIntervalFor,
  type TvInterval,
} from '../../utils/tradingViewSymbols';
import { wolfStudyIdFor } from '../../services/chart/wolfIndicators';

export type TerminalWolfCreatePanelProps = {
  open: boolean;
  /** When set, editor is in edit mode (admin must have pineSource on the item). */
  editing: IndicatorItem | null;
  /** Chart symbol (TradingView form) for Run OHLC. */
  symbol: string;
  /** Chart interval for Run OHLC. */
  interval: TvInterval;
  onClose: () => void;
  onSaved: () => void;
  /** After Save & Apply — TopBar appends/replaces wolf_cms_* study. */
  onApplied?: (studyId: string) => void;
};

type ConsoleState =
  | { kind: 'idle'; text: string }
  | { kind: 'running'; text: string }
  | { kind: 'ok'; text: string; warnings: string[] }
  | { kind: 'error'; text: string; warnings: string[] };

const PINE_PLACEHOLDER = `//@version=6
indicator("My Wolf Indicator", overlay=true)

len = input.int(14, "Length")
plot(ta.sma(close, len), "SMA")`;

function rangeForInterval(interval: TvInterval): string {
  switch (interval) {
    case '1':
    case '3':
    case '5':
      return '5d';
    case '15':
    case '30':
      return '1mo';
    case '60':
    case '120':
    case '240':
      return '3mo';
    case 'D':
      return '1y';
    case 'W':
    case 'M':
      return '5y';
    default:
      return '3mo';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Lightweight TV-feel highlight (comments + keywords). */
function highlightPine(source: string): string {
  if (!source) return '\n';
  return source.split('\n').map((line) => {
    const raw = escapeHtml(line);
    if (/^\s*\/\//.test(line)) {
      return `<span class="wolf-term__pine-tok--cmt">${raw}</span>`;
    }
    let out = raw
      .replace(
        /(\/\/@[a-zA-Z_][\w.]*)/g,
        '<span class="wolf-term__pine-tok--dir">$1</span>',
      )
      .replace(
        /\b(indicator|strategy|library|plot|plotshape|hline|fill|label|line|box|array|table|request|ticker|barstate|timeframe|color|math)\b/g,
        '<span class="wolf-term__pine-tok--kw">$1</span>',
      )
      .replace(
        /\b(input|ta|str|syminfo)\s*\./g,
        '<span class="wolf-term__pine-tok--ns">$1</span>.',
      )
      .replace(
        /\b(if|else|for|while|switch|true|false|and|or|not|var|varip)\b/g,
        '<span class="wolf-term__pine-tok--ctrl">$1</span>',
      )
      .replace(
        /(&quot;[^&]*?&quot;|&#39;[^&#]*?&#39;)/g,
        '<span class="wolf-term__pine-tok--str">$1</span>',
      );
    const cmt = out.indexOf('//');
    if (cmt >= 0 && !/^\s*<span class="wolf-term__pine-tok--cmt">/.test(out)) {
      out =
        out.slice(0, cmt) +
        `<span class="wolf-term__pine-tok--cmt">${out.slice(cmt)}</span>`;
    }
    return out || ' ';
  }).join('\n');
}

/**
 * Near-fullscreen Pine IDE — Terminal → Indicators → Wolf (admin only).
 * Members never see this panel or the source.
 */
export default function TerminalWolfCreatePanel({
  open,
  editing,
  symbol,
  interval,
  onClose,
  onSaved,
  onApplied,
}: TerminalWolfCreatePanelProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pineSource, setPineSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [consoleState, setConsoleState] = useState<ConsoleState>({
    kind: 'idle',
    text: 'Ready — Run against chart bars, or Save to publish.',
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const settingsPreview = useMemo(() => parsePineSettings(pineSource), [pineSource]);
  const lineCount = useMemo(
    () => Math.max(1, pineSource.split('\n').length),
    [pineSource],
  );
  const highlightHtml = useMemo(() => highlightPine(pineSource), [pineSource]);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title || '');
    const desc = editing?.description || '';
    setDescription(looksLikePastedScriptDocs(desc) ? '' : desc);
    setPineSource(editing?.pineSource || '');
    setError('');
    setSaving(false);
    setRunning(false);
    setConsoleState({
      kind: 'idle',
      text: 'Ready — Run against chart bars, or Save to publish.',
    });
  }, [open, editing?.id, editing?.title, editing?.description, editing?.pineSource]);

  const syncScroll = useCallback((scrollTop: number, scrollLeft: number) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  }, []);

  const onEditorScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    syncScroll(el.scrollTop, el.scrollLeft);
  };

  const validatePine = (): string | null => {
    const name = title.trim();
    const pine = pineSource.trim();
    if (!name) return 'Enter an indicator name.';
    if (!pine) return 'Paste your Pine Script source (TradingView //@version=… ).';
    if (!/\/\/\s*@version\s*=\s*\d+/i.test(pine) && !/\bindicator\s*\(/i.test(pine)) {
      return 'Pine should look like TradingView script ( //@version=5 or //@version=6 and indicator(...) ).';
    }
    return null;
  };

  const runDraft = useCallback(async () => {
    const pine = pineSource.trim();
    if (!pine) {
      setConsoleState({ kind: 'error', text: 'Nothing to run — paste Pine first.', warnings: [] });
      return;
    }
    if (running || saving) return;
    setRunning(true);
    setError('');
    setConsoleState({ kind: 'running', text: 'Running… fetching chart bars…' });
    try {
      const apiSym = apiSymbolFromTv(symbol) || symbol;
      const tf = nativeIntervalFor(interval) || interval;
      const ohlc = await fetchMarketOhlc(apiSym, tf, rangeForInterval(interval), 500);
      const bars = ohlc?.bars || [];
      if (!bars.length) {
        setConsoleState({
          kind: 'error',
          text: `No OHLC for ${apiSym} · ${tf}. Check symbol / market feed.`,
          warnings: [],
        });
        return;
      }
      setConsoleState({
        kind: 'running',
        text: `Running… ${bars.length} bars · ${apiSym} ${tf}`,
      });
      const result = await adminRunPineDraft({
        source: pine,
        bars,
        timeLimitMs: pine.length > 40_000 ? 25000 : 8000,
      });
      const warnings = result.warnings || [];
      if (result.error || !result.ok) {
        setConsoleState({
          kind: 'error',
          text: result.error || warnings[0] || 'Run failed',
          warnings,
        });
        return;
      }
      const nPlots = result.plots?.length || 0;
      const nDraw = result.drawings?.length || 0;
      setConsoleState({
        kind: 'ok',
        text: `OK · ${nPlots} plot${nPlots === 1 ? '' : 's'} · ${nDraw} drawing${nDraw === 1 ? '' : 's'} · ${bars.length} bars`,
        warnings,
      });
    } catch (err) {
      setConsoleState({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not run Pine',
        warnings: [],
      });
    } finally {
      setRunning(false);
    }
  }, [pineSource, running, saving, symbol, interval]);

  const saveIndicator = useCallback(
    async (applyAfter: boolean) => {
      const invalid = validatePine();
      if (invalid) {
        setError(invalid);
        return;
      }
      if (saving || running) return;
      const name = title.trim();
      const pine = pineSource.trim();
      const blurb = sanitizeIndicatorDescription(description, '').trim();
      setSaving(true);
      setError('');
      try {
        const cleanDesc = blurb || 'Plots on Terminal chart';
        let saved: IndicatorItem;
        if (editing?.id) {
          saved = await adminUpdateIndicator(editing.id, {
            title: name,
            description: cleanDesc,
            pineSource: pine,
            link: editing.link || '',
            howToVideoUrl: editing.howToVideoUrl || '',
            published: true,
          });
        } else {
          saved = await adminCreateIndicator({
            title: name,
            description: cleanDesc,
            pineSource: pine,
            link: '',
            published: true,
            sortOrder: 0,
          });
        }
        onSaved();
        if (applyAfter && onApplied) {
          const studyId = wolfStudyIdFor({
            id: saved.id,
            title: saved.title || name,
            hasPine: true,
            pineSource: pine,
          });
          onApplied(studyId);
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save indicator');
      } finally {
        setSaving(false);
      }
    },
    // validatePine uses title/pineSource/description from closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      title,
      pineSource,
      description,
      editing,
      saving,
      running,
      onSaved,
      onApplied,
      onClose,
    ],
  );

  const onEditorKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${pineSource.slice(0, start)}  ${pineSource.slice(end)}`;
      setPineSource(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      void runDraft();
      return;
    }
    if (mod && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      void saveIndicator(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !running) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, saving, running, onClose]);

  if (!open) return null;

  const busy = saving || running;

  return (
    <div
      className="wolf-term__pine-ide-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="wolf-term__pine-ide"
        role="dialog"
        aria-label={editing ? 'Edit Pine indicator' : 'Create Pine indicator'}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void saveIndicator(false);
        }}
      >
        <header className="wolf-term__pine-ide-head">
          <div className="wolf-term__pine-ide-titles">
            <b>{editing ? 'Pine IDE · Edit' : 'Pine IDE · Create'}</b>
            <em>
              Near-fullscreen editor — Run on {apiSymbolFromTv(symbol) || symbol} ·{' '}
              {nativeIntervalFor(interval) || interval}. Source stays encrypted; members never see
              it.
            </em>
          </div>
          <div className="wolf-term__pine-ide-meta">
            <label className="wolf-term__pine-ide-field wolf-term__pine-ide-field--title">
              <span>Name</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Wolf Confluence Pro"
                maxLength={120}
                autoFocus
                disabled={busy}
              />
            </label>
            <label className="wolf-term__pine-ide-field wolf-term__pine-ide-field--desc">
              <span>List text</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short blurb under the name in Wolf list"
                maxLength={200}
                disabled={busy}
              />
            </label>
            <button
              type="button"
              className="wolf-term__icon-btn"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="wolf-term__pine-ide-editor" data-lines={lineCount}>
          <div className="wolf-term__pine-ide-gutter" ref={gutterRef} aria-hidden>
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <div className="wolf-term__pine-ide-code">
            <pre
              ref={highlightRef}
              className="wolf-term__pine-ide-highlight"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: highlightHtml }}
            />
            <textarea
              ref={textareaRef}
              className="wolf-term__pine-ide-textarea"
              value={pineSource}
              onChange={(e) => setPineSource(e.target.value)}
              onScroll={onEditorScroll}
              onKeyDown={onEditorKeyDown}
              placeholder={PINE_PLACEHOLDER}
              spellCheck={false}
              disabled={busy}
              wrap="off"
              aria-label="Pine Script source"
            />
          </div>
        </div>

        <div
          className={`wolf-term__pine-ide-console wolf-term__pine-ide-console--${consoleState.kind}`}
          role="status"
        >
          <div className="wolf-term__pine-ide-console-bar">
            <b>Console</b>
            <span>
              {settingsPreview.length
                ? `${settingsPreview.length} input${settingsPreview.length === 1 ? '' : 's'} detected`
                : 'Tip: input.* → member settings'}
            </span>
            <kbd>Ctrl+Enter</kbd>
            <em>Run</em>
            <kbd>Ctrl+S</kbd>
            <em>Save</em>
          </div>
          <p>{consoleState.text}</p>
          {'warnings' in consoleState && consoleState.warnings.length ? (
            <ul>
              {consoleState.warnings.slice(0, 12).map((w, i) => (
                <li key={`${i}-${w.slice(0, 40)}`}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {error ? <p className="wolf-term__pine-ide-error">{error}</p> : null}

        <footer className="wolf-term__pine-ide-foot">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="wolf-term__pine-ide-run"
            onClick={() => void runDraft()}
            disabled={busy}
          >
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run
              </>
            )}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Save
              </>
            )}
          </button>
          <button
            type="button"
            className="primary wolf-term__pine-ide-apply"
            disabled={busy}
            onClick={() => void saveIndicator(true)}
          >
            Save &amp; Apply
          </button>
        </footer>
      </form>
    </div>
  );
}
