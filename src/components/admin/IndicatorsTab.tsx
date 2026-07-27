import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
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
  adminUpdateIndicator,
  type IndicatorItem,
} from '../../services/indicatorLibrary';

type IndicatorsTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
};

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200 focus:outline-none focus:border-[#d4af37]/40';
const LABEL = 'block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold';

type FormState = {
  title: string;
  description: string;
  code: string;
  sortOrder: string;
  published: boolean;
  image: string | null;
  clearImage: boolean;
};

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  code: '',
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
  const [showForm, setShowForm] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      code: row.code,
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

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const payload = {
        title: form.title,
        description: form.description,
        code: form.code,
        sortOrder: Number(form.sortOrder) || 0,
        published: form.published,
        ...(form.clearImage
          ? { image: null as string | null }
          : form.image
            ? { image: form.image }
            : {}),
      };

      if (editingId) {
        await adminUpdateIndicator(editingId, payload, adminEmail, adminPassword);
        setMsg('Indicator updated.');
      } else {
        await adminCreateIndicator(payload, adminEmail, adminPassword);
        setMsg('Indicator created.');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      setPreviewUrl(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#d4af37]">Indicators</h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Add title, description, script and cover image. Published items show in the member library.
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
                </div>
                <label className="flex items-end gap-2 pb-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm((p) => ({ ...p, published: e.target.checked }))}
                    className="rounded border-[#1a1f2e]"
                  />
                  Published
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
            <label className={LABEL}>Indicator code</label>
            <textarea
              className={`${FIELD} min-h-[220px] font-mono text-[12px] resize-y`}
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="// Paste Pine Script or any indicator source here"
              spellCheck={false}
            />
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
          <div className="p-10 text-center text-sm text-slate-500">
            No indicators yet. Click “Add indicator” to publish the first script.
          </div>
        ) : (
          <div className="divide-y divide-[#1a1f2e]">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 hover:bg-[#121520]/50"
              >
                <div className="w-full sm:w-24 h-16 rounded-lg overflow-hidden bg-[#121520] border border-[#1a1f2e] shrink-0">
                  {row.imageUrl ? (
                    <img src={row.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600">
                      No img
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-100 truncate">{row.title}</h3>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        row.published
                          ? 'border-emerald-500/25 text-emerald-400 bg-emerald-500/10'
                          : 'border-slate-600 text-slate-500'
                      }`}
                    >
                      {row.published ? 'Live' : 'Draft'}
                    </span>
                    <span className="text-[10px] text-slate-600">sort {row.sortOrder}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {row.description || 'No description'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
