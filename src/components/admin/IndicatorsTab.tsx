import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { prepareAccessProof, ACCESS_PROOF_ACCEPT } from '../../services/accessProofImage';
import {
  adminCreateIndicator,
  adminDeleteIndicator,
  adminListIndicators,
  adminReorderIndicators,
  adminSetIndicatorHowToVideo,
  adminUpdateIndicator,
  type IndicatorItem,
} from '../../services/indicatorLibrary';
import { parsePineSettings } from '../../services/pineSettings';
import { TRIAL_DAYS } from '../../constants/plans';

type IndicatorsTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
};

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200 focus:outline-none focus:border-[#d4af37]/40';
const LABEL = 'block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold';
const PINE_FIELD =
  'w-full px-3 py-2 rounded-lg bg-[#0a0c12] border border-[#1a1f2e] text-[12px] font-mono text-emerald-200/90 focus:outline-none focus:border-[#d4af37]/40 min-h-[280px] resize-y leading-relaxed';

type FormState = {
  title: string;
  description: string;
  link: string;
  howToVideoUrl: string;
  pineSource: string;
  sortOrder: string;
  published: boolean;
  image: string | null;
  clearImage: boolean;
};

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  link: '',
  howToVideoUrl: '',
  pineSource: '',
  sortOrder: '0',
  published: true,
  image: null,
  clearImage: false,
});

export default function IndicatorsTab({ adminEmail, adminPassword }: IndicatorsTabProps) {
  const [rows, setRows] = useState<IndicatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const pinePreviewSettings = useMemo(() => parsePineSettings(form.pineSource), [form.pineSource]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await adminListIndicators(adminEmail, adminPassword));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load indicators');
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setPreviewUrl(null);
    setShowForm(true);
    setMsg('');
    setError('');
  };

  const openEdit = (row: IndicatorItem) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      description: row.description,
      link: row.link,
      howToVideoUrl: row.howToVideoUrl || '',
      pineSource: row.pineSource || '',
      sortOrder: String(row.sortOrder ?? 0),
      published: row.published,
      image: null,
      clearImage: false,
    });
    setPreviewUrl(row.imageUrl);
    setShowForm(true);
    setMsg('');
    setError('');
  };

  const onPickImage = async (file: File | null) => {
    if (!file) return;
    setError('');
    try {
      const dataUrl = await prepareAccessProof(file);
      setForm((prev) => ({ ...prev, image: dataUrl, clearImage: false }));
      setPreviewUrl(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read image');
    }
  };

  const normalizeUrl = (raw: string) => {
    const v = String(raw || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    // Paste without protocol (youtu.be/…, www.youtube.com/…)
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(v) || /^www\./i.test(v) || /^youtu\.be\//i.test(v)) {
      return `https://${v.replace(/^\/+/, '')}`;
    }
    return v;
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const howToVideoUrl = normalizeUrl(form.howToVideoUrl);
      const link = normalizeUrl(form.link);
      const pineSource = form.pineSource.trim();
      if (howToVideoUrl) {
        let validVideo = true;
        try {
          void new URL(howToVideoUrl);
        } catch {
          validVideo = false;
        }
        if (!validVideo) {
          throw new Error(
            'How-to video URL is invalid. Paste the full link (https://… YouTube / Vimeo / .mp4).',
          );
        }
      }
      if (!link && !pineSource) {
        throw new Error('Pine Script code or a TradingView invite link is required.');
      }

      const payload = {
        title: form.title.trim(),
        description: form.description,
        link,
        howToVideoUrl,
        pineSource,
        sortOrder: Number(form.sortOrder) || 0,
        published: form.published,
        ...(form.clearImage
          ? { image: null as string | null }
          : form.image
            ? { image: form.image }
            : {}),
      };

      let saved = editingId
        ? await adminUpdateIndicator(editingId, payload, adminEmail, adminPassword)
        : await adminCreateIndicator(payload, adminEmail, adminPassword);

      // Second write: video-only endpoint (survives link-column / partial PATCH issues).
      if (howToVideoUrl && saved?.id) {
        saved = await adminSetIndicatorHowToVideo(
          saved.id,
          howToVideoUrl,
          adminEmail,
          adminPassword,
        );
        if (!String(saved?.howToVideoUrl || '').trim()) {
          throw new Error('Video URL failed to save. Paste the link again and click Save.');
        }
      }

      const settingCount = Array.isArray(saved?.settings)
        ? saved.settings.length
        : parsePineSettings(pineSource).length;
      setMsg(
        editingId
          ? `Updated. Members see ${settingCount} setting(s) — never Pine source.`
          : `Created. Members see ${settingCount} setting(s) — never Pine source.`,
      );
      // Keep form open so admin can see the persisted video URL.
      setEditingId(saved.id);
      setForm((prev) => ({
        ...prev,
        howToVideoUrl: saved.howToVideoUrl || howToVideoUrl || '',
        link: saved.link || link,
        pineSource: saved.pineSource ?? pineSource,
        image: null,
        clearImage: false,
      }));
      await load();
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(
        name === 'AbortError'
          ? 'Server timeout — wait for Render to wake up, then click Save again in 10 seconds.'
          : /failed to fetch/i.test(msg)
            ? 'Cannot reach server (CORS/network). Hard refresh (Ctrl+Shift+R), wait 10 seconds, then try Save again.'
            : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (row: IndicatorItem) => {
    setError('');
    setMsg('');
    try {
      await adminUpdateIndicator(
        row.id,
        { published: !row.published },
        adminEmail,
        adminPassword,
      );
      setMsg(row.published ? `Hidden “${row.title}” from members.` : `Published “${row.title}”.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update visibility');
    }
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    setError('');
    try {
      await adminDeleteIndicator(id, adminEmail, adminPassword);
      setMsg('Deleted.');
      if (editingId === id) {
        setShowForm(false);
        setEditingId(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const persistOrder = async (next: IndicatorItem[], focusId?: string) => {
    const prev = rows;
    setRows(next);
    setReorderingId(focusId || next[0]?.id || 'all');
    setError('');
    setMsg('');
    try {
      const saved = await adminReorderIndicators(
        next.map((row) => row.id),
        adminEmail,
        adminPassword,
      );
      setRows(saved);
      setMsg('Order updated — members see this sequence on Indicators.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder');
      setRows(prev);
      await load();
    } finally {
      setReorderingId(null);
    }
  };

  const moveRow = async (id: string, direction: -1 | 1) => {
    const index = rows.findIndex((row) => row.id === id);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= rows.length) return;
    const next = [...rows];
    const a = next[index];
    next[index] = next[swapWith];
    next[swapWith] = a;
    await persistOrder(next, id);
  };

  const onDragStart = (e: DragEvent, id: string) => {
    if (reorderingId) {
      e.preventDefault();
      return;
    }
    dragIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const onDragOverRow = (e: DragEvent, overId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdRef.current && dragIdRef.current !== overId) setDragOverId(overId);
  };

  const onDropRow = async (e: DragEvent, overId: string) => {
    e.preventDefault();
    const fromId = dragIdRef.current || e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setDragOverId(null);
    dragIdRef.current = null;
    if (!fromId || fromId === overId) return;

    const from = rows.findIndex((row) => row.id === fromId);
    const to = rows.findIndex((row) => row.id === overId);
    if (from < 0 || to < 0) return;

    const next = [...rows];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    await persistOrder(next, fromId);
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
    dragIdRef.current = null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#d4af37]">Indicators</h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Add / edit / hide indicators. Paste Pine Script here (admin only). Members never see
            source — only settings parsed from <code className="text-slate-400">input.*</code>. Optional
            TradingView invite link + how-to video. Drag to reorder ({TRIAL_DAYS}-day demo, then desk
            approval for invite unlock).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#d4af37] text-[#0b0e17] text-xs font-bold hover:brightness-110"
        >
          <Plus className="w-3.5 h-3.5" />
          Add indicator
        </button>
      </div>

      {msg ? (
        <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {msg}
        </div>
      ) : null}
      {error ? (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form
          noValidate
          onSubmit={(e) => void save(e)}
          className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">
              {editingId ? 'Edit indicator' : 'New indicator'}
            </h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-[#121520]"
              aria-label="Close form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error ? (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Title</label>
                <input
                  className={FIELD}
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  required
                  placeholder="e.g. Session VWAP Pro"
                />
              </div>
              <div>
                <label className={LABEL}>Description</label>
                <textarea
                  className={`${FIELD} min-h-[100px] resize-y`}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="What this indicator does and how to use it"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Sort order</label>
                  <input
                    type="number"
                    className={FIELD}
                    value={form.sortOrder}
                    onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    Lower = higher on the grid. Prefer drag-and-drop in the list below.
                  </p>
                </div>
                <label className="flex items-end gap-2 pb-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm((p) => ({ ...p, published: e.target.checked }))}
                    className="rounded border-[#1a1f2e]"
                  />
                  Visible to members
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className={LABEL}>Cover image</label>
                <div className="rounded-xl border border-dashed border-[#1a1f2e] bg-[#121520] p-3">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt=""
                      className="w-full h-40 object-cover rounded-lg mb-3"
                    />
                  ) : (
                    <div className="h-40 flex flex-col items-center justify-center text-slate-600 gap-2 mb-3">
                      <ImagePlus className="w-7 h-7" />
                      <span className="text-[11px]">PNG / JPG / WebP</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1a1f2e] text-[11px] font-bold text-slate-300 cursor-pointer hover:border-[#d4af37]/40">
                      Choose image
                      <input
                        type="file"
                        accept={ACCESS_PROOF_ACCEPT}
                        className="hidden"
                        onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {previewUrl ? (
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg border border-red-500/20 text-[11px] font-bold text-red-400"
                        onClick={() => {
                          setPreviewUrl(null);
                          setForm((p) => ({ ...p, image: null, clearImage: true }));
                        }}
                      >
                        Remove image
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className={LABEL}>Pine Script source (admin only)</label>
              <span className="text-[10px] text-slate-500">
                {pinePreviewSettings.length
                  ? `${pinePreviewSettings.length} setting(s) members will see`
                  : 'No input.* detected yet'}
              </span>
            </div>
            <textarea
              className={PINE_FIELD}
              value={form.pineSource}
              onChange={(e) => setForm((p) => ({ ...p, pineSource: e.target.value }))}
              placeholder={'//@version=6\nindicator("My Wolf Pack", overlay=true)\nlookback = input.int(200, "Lookback")\n…'}
              spellCheck={false}
              autoComplete="off"
            />
            <p className="text-[10px] text-slate-600 mt-1.5">
              Stored server-side. Member APIs never return this field — only parsed settings.
            </p>
            {pinePreviewSettings.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pinePreviewSettings.slice(0, 12).map((s) => (
                  <span
                    key={s.key}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-[#1a1f2e] text-slate-400"
                  >
                    {s.label}
                  </span>
                ))}
                {pinePreviewSettings.length > 12 ? (
                  <span className="text-[10px] text-slate-600">+{pinePreviewSettings.length - 12}</span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <label className={LABEL}>How to use video URL (optional)</label>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              className={FIELD}
              value={form.howToVideoUrl}
              onChange={(e) => setForm((p) => ({ ...p, howToVideoUrl: e.target.value }))}
              placeholder="https://… YouTube / Vimeo / direct .mp4 link"
              spellCheck={false}
            />
            <p className="text-[10px] text-slate-600 mt-1.5">
              Shown as watch-only guidance on the indicator page. Prefer unlisted YouTube / Vimeo or
              a private .mp4 host.
            </p>
          </div>

          <div>
            <label className={LABEL}>TradingView invite link (optional if Pine is set)</label>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              className={FIELD}
              value={form.link}
              onChange={(e) => setForm((p) => ({ ...p, link: e.target.value }))}
              placeholder="https://… invite / share link"
              spellCheck={false}
            />
            <p className="text-[10px] text-slate-600 mt-1.5">
              Members with access can open this invite. They still never see Pine source.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-2 rounded-lg border border-[#1a1f2e] text-xs font-bold text-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0b0e17] text-xs font-bold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {editingId ? 'Save changes' : 'Create indicator'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-400">
              No indicators yet. Fill the form above (title, link, image) and click Create.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0b0e17] text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              Show add form
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1f2e]">
            <p className="px-3 py-2 text-[10px] text-slate-500 border-b border-[#1a1f2e]">
              Drag the grip handle to reorder. Drop on another row to place it there.
            </p>
            {rows.map((row, index) => {
              const isDragging = draggingId === row.id;
              const isOver = dragOverId === row.id && draggingId !== row.id;
              return (
                <div
                  key={row.id}
                  onDragOver={(e) => onDragOverRow(e, row.id)}
                  onDrop={(e) => void onDropRow(e, row.id)}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 transition-colors ${
                    isDragging
                      ? 'opacity-50 bg-[#d4af37]/5'
                      : isOver
                        ? 'bg-[#d4af37]/12 ring-1 ring-inset ring-[#d4af37]/40'
                        : 'hover:bg-[#121520]/50'
                  }`}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      draggable={!reorderingId}
                      onDragStart={(e) => onDragStart(e, row.id)}
                      onDragEnd={onDragEnd}
                      aria-label="Drag to reorder"
                      title="Drag to reorder"
                      disabled={Boolean(reorderingId)}
                      className="p-1.5 rounded-lg border border-[#1a1f2e] text-slate-500 hover:text-[#d4af37] hover:border-[#d4af37]/40 cursor-grab active:cursor-grabbing disabled:opacity-30 touch-none"
                    >
                      {reorderingId === row.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <GripVertical className="w-4 h-4" />
                      )}
                    </button>
                    <span className="w-7 text-center text-[11px] font-bold text-[#d4af37]/80">
                      #{index + 1}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={index === 0 || reorderingId !== null}
                        onClick={() => void moveRow(row.id, -1)}
                        className="p-1 rounded border border-[#1a1f2e] text-slate-400 hover:text-[#d4af37] hover:border-[#d4af37]/40 disabled:opacity-30"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={index === rows.length - 1 || reorderingId !== null}
                        onClick={() => void moveRow(row.id, 1)}
                        className="p-1 rounded border border-[#1a1f2e] text-slate-400 hover:text-[#d4af37] hover:border-[#d4af37]/40 disabled:opacity-30"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="w-20 sm:w-24 h-16 rounded-lg overflow-hidden bg-[#121520] border border-[#1a1f2e] pointer-events-none">
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600">
                          No img
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100 truncate">{row.title}</h3>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          row.published
                            ? 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10'
                            : 'border-amber-500/25 text-amber-400 bg-amber-500/10'
                        }`}
                      >
                        {row.published ? 'Visible' : 'Hidden'}
                      </span>
                      {row.pineSource ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-sky-500/25 text-sky-400 bg-sky-500/10">
                          Pine · {row.settings?.length ?? 0} inputs
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {row.link || row.description || 'Pine / settings only'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void toggleVisibility(row)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1a1f2e] text-[11px] font-bold text-slate-300 hover:border-[#d4af37]/40 hover:text-[#d4af37]"
                      title={row.published ? 'Hide from members' : 'Show to members'}
                    >
                      {row.published ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {row.published ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1a1f2e] text-[11px] font-bold text-slate-300 hover:border-[#d4af37]/40 hover:text-[#d4af37]"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(row.id, row.title)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/20 text-[11px] font-bold text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
