import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Copy, RefreshCw, Trash2, X } from 'lucide-react';
import {
  adminApproveAllTvAccessRequests,
  adminDeleteTvAccessRequest,
  adminListTvAccessRequests,
  adminReviewTvAccessRequest,
  type AdminTvAccessRequest,
} from '../../services/appInviteAuth';

type TvAccessRequestsTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

async function copyUsername(tvId: string) {
  const text = tvId.startsWith('@') ? tvId : `@${tvId}`;
  await navigator.clipboard.writeText(text);
  return text;
}

/** TradingView usernames — Approve unlocks invite link for the user after you add them on TV. */
export default function TvAccessRequestsTab({
  adminEmail,
  adminPassword,
}: TvAccessRequestsTabProps) {
  const [rows, setRows] = useState<AdminTvAccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === 'pending').length,
    [rows],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListTvAccessRequests('all', adminEmail, adminPassword);
      setRows(data.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load list');
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  };

  const onCopy = async (row: AdminTvAccessRequest) => {
    try {
      await copyUsername(row.tradingViewId);
      setCopiedId(row.id);
      flash(`Copied @${row.tradingViewId.replace(/^@/, '')}`);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setError('Could not copy username');
    }
  };

  const review = async (row: AdminTvAccessRequest, action: 'granted' | 'dismiss') => {
    setBusyId(row.id);
    setError('');
    try {
      if (action === 'granted') {
        try {
          await copyUsername(row.tradingViewId);
        } catch {
          /* clipboard optional */
        }
      }
      await adminReviewTvAccessRequest(row.id, action, {}, adminEmail, adminPassword);
      if (action === 'granted') {
        flash(`Approved — invite unlocked for @${row.tradingViewId.replace(/^@/, '')}`);
      }
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Could not ${action === 'granted' ? 'approve' : 'dismiss'}`,
      );
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = async () => {
    if (!pendingCount) return;
    const ok = window.confirm(
      `Approve all ${pendingCount} pending request(s)?\n\nOnly do this after adding them on TradingView — this unlocks invite links for users.`,
    );
    if (!ok) return;
    setBusyId('all');
    setError('');
    try {
      const result = await adminApproveAllTvAccessRequests(adminEmail, adminPassword);
      flash(`Approved ${result.updated} request(s)`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve all');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: AdminTvAccessRequest) => {
    const ok = window.confirm(
      `Delete TV access request for @${row.tradingViewId}? This cannot be undone.`,
    );
    if (!ok) return;
    setBusyId(row.id);
    setError('');
    try {
      await adminDeleteTvAccessRequest(row.id, adminEmail, adminPassword);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete request');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-400 max-w-xl">
          Fast path: <strong className="text-slate-300">Copy @</strong> → paste in TradingView Manage
          access → <strong className="text-slate-300">Approve</strong> (unlocks invite for the user).
          No WhatsApp needed.
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pendingCount > 0 ? (
            <button
              type="button"
              disabled={busyId === 'all'}
              onClick={() => void approveAll()}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <CheckCheck className="w-3 h-3" />
              Approve all ({pendingCount})
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-[10px] text-slate-400 hover:text-gold flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {toast ? <p className="text-[11px] text-emerald-400">{toast}</p> : null}
      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-8 text-center text-xs text-slate-500 space-y-2">
          <p>{loading ? 'Loading…' : 'No TradingView submissions yet.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#1a1f2e]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b0e17] text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-bold">TradingView ID</th>
                <th className="px-3 py-2 font-bold">Indicator</th>
                <th className="px-3 py-2 font-bold">User</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Submitted</th>
                <th className="px-3 py-2 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="border-t border-[#1a1f2e] bg-[#0d111c]"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-gold">@{row.tradingViewId}</span>
                      <button
                        type="button"
                        onClick={() => void onCopy(row)}
                        className="inline-flex items-center gap-0.5 rounded-md border border-[#1a1f2e] px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-gold hover:border-gold/30"
                        title="Copy @username for TradingView"
                      >
                        {copiedId === row.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copy
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-200">
                    {row.indicatorTitle || row.indicatorId}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    <div>{row.name || '—'}</div>
                    <div className="text-[10px] text-slate-500">{row.email || row.phone || ''}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        row.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : row.status === 'granted'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}
                    >
                      {row.status === 'granted' ? 'approved' : row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void review(row, 'granted')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
                            title="Copies @username, then unlocks invite for user"
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void review(row, 'dismiss')}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-500/10 border border-slate-500/20 px-2.5 py-1.5 text-[10px] font-bold text-slate-400 hover:bg-slate-500/20 disabled:opacity-50"
                          >
                            <X className="w-3 h-3" />
                            Dismiss
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void remove(row)}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 border border-red-500/25 px-2.5 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                        title="Delete request"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
