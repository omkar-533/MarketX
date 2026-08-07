import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookOpen, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import {
  adminDeleteKnowledge,
  adminListKnowledge,
  adminUploadKnowledgePdf,
  adminUploadKnowledgeText,
  readPdfAsDataUrl,
  type KnowledgeDoc,
} from '../../services/masterAiKnowledge';

type KnowledgeTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
};

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200 focus:outline-none focus:border-[#d4af37]/40';
const LABEL = 'block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold';

export default function KnowledgeTab({ adminEmail, adminPassword }: KnowledgeTabProps) {
  const [rows, setRows] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [pdfName, setPdfName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await adminListKnowledge(adminEmail, adminPassword));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load teachings');
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPickPdf = async (file: File | null) => {
    if (!file) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const pdfDataUrl = await readPdfAsDataUrl(file);
      const doc = await adminUploadKnowledgePdf(
        {
          title: title.trim() || file.name.replace(/\.pdf$/i, ''),
          filename: file.name,
          pdfDataUrl,
        },
        adminEmail,
        adminPassword,
      );
      setMsg(`PDF saved: ${doc.title} (${doc.charCount.toLocaleString()} chars)`);
      setTitle('');
      setPdfName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const doc = await adminUploadKnowledgeText(
        { title: title.trim() || 'Teaching notes', text: notes },
        adminEmail,
        adminPassword,
      );
      setMsg(`Notes saved: ${doc.title}`);
      setTitle('');
      setNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this teaching?')) return;
    setError('');
    try {
      await adminDeleteKnowledge(id, adminEmail, adminPassword);
      setMsg('Deleted');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Wolf AI teachings
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            Upload PDFs or notes — Wolf AI answers from this base (house method). Text-based PDFs
            work best; scanned image PDFs cannot be parsed for text.
          </p>
        </div>

        <div>
          <label className={LABEL}>Title (optional)</label>
          <input
            className={FIELD}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. OI writing rules / Risk SOPs"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[#1a1f2e] p-3 space-y-2">
            <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-[#d4af37]" />
              Upload PDF
            </p>
            <label className="flex items-center justify-center gap-2 px-3 py-6 rounded-lg border border-dashed border-[#2a3142] text-xs text-slate-400 cursor-pointer hover:border-[#d4af37]/40 hover:text-slate-200 transition-colors">
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={saving}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setPdfName(f?.name || '');
                  void onPickPdf(f);
                  e.target.value = '';
                }}
              />
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {pdfName || 'Choose PDF (max 8 MB)'}
            </label>
          </div>

          <form onSubmit={saveNotes} className="rounded-xl border border-[#1a1f2e] p-3 space-y-2">
            <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#d4af37]" />
              Paste notes
            </p>
            <textarea
              className={`${FIELD} min-h-[110px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste your trading rules, setups, risk rules here…"
            />
            <button
              type="submit"
              disabled={saving || notes.trim().length < 40}
              className="w-full py-2 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/30 text-[#d4af37] text-xs font-bold hover:bg-[#d4af37]/25 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save notes'}
            </button>
          </form>
        </div>

        {msg ? <p className="text-[11px] text-emerald-400">{msg}</p> : null}
        {error ? <p className="text-[11px] text-rose-400">{error}</p> : null}
      </div>

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a1f2e] flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Saved teachings ({rows.length})
          </h4>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[10px] text-slate-500 hover:text-slate-300"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="p-6 flex items-center justify-center text-slate-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No teachings yet — upload your first PDF or notes.</p>
        ) : (
          <ul className="divide-y divide-[#1a1f2e]">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 font-medium truncate">{row.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {row.sourceType.toUpperCase()}
                    {row.filename ? ` · ${row.filename}` : ''}
                    {` · ${row.charCount.toLocaleString()} chars · ${new Date(row.createdAt).toLocaleString('en-IN')}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(row.id)}
                  className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
