import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ImageOff, RefreshCw, X } from 'lucide-react';
import {
  adminListAccessRequests,
  adminReviewAccessRequest,
  type AdminAccessRequest,
} from '../../services/appInviteAuth';

type AccessRequestsTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
  defaultGrantDays: number;
  onReviewed?: () => void;
};

const FILTERS = ['pending', 'approved', 'rejected', 'all'] as const;
type Filter = (typeof FILTERS)[number];

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Screenshot proofs waiting for approval — approve grants access immediately. */
export default function AccessRequestsTab({
  adminEmail,
  adminPassword,
  defaultGrantDays,
  onReviewed,
}: AccessRequestsTabProps) {
  const [filter, setFilter] = useState<Filter>('pending');
  const [rows, setRows] = useState<AdminAccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [days, setDays] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListAccessRequests(filter, adminEmail, adminPassword);
      setRows(data.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load requests');
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword, filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const review = async (row: AdminAccessRequest, approve: boolean) => {
    setBusyId(row.id);
    setError('');
    try {
      await adminReviewAccessRequest(
        row.id,
        {
          approve,
          days: approve ? Number(days[row.id] ?? defaultGrantDays) : undefined,
          adminNote: notes[row.id],
        },
        adminEmail,
        adminPassword,
      );
      await refresh();
      onReviewed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the request');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-colors ${
              filter === f
                ? 'bg-gold/15 border-gold/30 text-gold'
                : 'border-[#1a1f2e] text-slate-500 hover:text-slate-300'
            }`}
          >
            {f}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto text-[10px] text-slate-400 hover:text-gold flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="lux-panel lux-panel--pad text-center text-xs text-slate-500">
          {loading ? 'Loading…' : `No ${filter === 'all' ? '' : filter} requests.`}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((row, idx) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="lux-panel overflow-hidden lux-panel--interactive"
            >
              <button
                type="button"
                className="block w-full bg-[#080a12]"
                onClick={() => row.screenshotUrl && setLightbox(row.screenshotUrl)}
              >
                {row.screenshotUrl ? (
                  <img
                    src={row.screenshotUrl}
                    alt={`Proof from ${row.name ?? row.email ?? 'user'}`}
                    className="w-full h-40 object-cover"
                  />
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center gap-2 text-slate-600 text-xs">
                    <ImageOff className="w-5 h-5" />
                    Screenshot unavailable
                  </div>
                )}
              </button>

              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-200 truncate">{row.name || '—'}</p>
                    <p className="text-[11px] text-slate-500 truncate">{row.email}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{row.phone || 'no mobile'}</p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                      row.status === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : row.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>

                <p className="text-[10px] text-slate-600">Sent {formatDate(row.createdAt)}</p>
                {row.note ? <p className="text-[11px] text-slate-400">Note: {row.note}</p> : null}
                {row.adminNote ? (
                  <p className="text-[11px] text-slate-500">Admin note: {row.adminNote}</p>
                ) : null}

                {row.status === 'pending' ? (
                  <div className="space-y-2 pt-1">
                    <input
                      value={notes[row.id] ?? ''}
                      onChange={(e) => setNotes((p) => ({ ...p, [row.id]: e.target.value }))}
                      placeholder="Note for the user (optional)"
                      className="w-full px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-xs text-slate-200"
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={days[row.id] ?? String(defaultGrantDays)}
                          onChange={(e) => setDays((p) => ({ ...p, [row.id]: e.target.value }))}
                          className="w-16 px-2 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-xs text-slate-200"
                        />
                        <span className="text-[10px] text-slate-500">days (0 = lifetime)</span>
                      </div>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void review(row, true)}
                        className="ml-auto px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void review(row, false)}
                        className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {lightbox ? (
        <div
          className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
          role="presentation"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Proof screenshot" className="max-h-full max-w-full rounded-xl" />
        </div>
      ) : null}
    </div>
  );
}
