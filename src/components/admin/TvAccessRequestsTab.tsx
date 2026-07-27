import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, RefreshCw, X } from 'lucide-react';
import {
  adminListTvAccessRequests,
  adminReviewTvAccessRequest,
  type AdminTvAccessRequest,
} from '../../services/appInviteAuth';

type TvAccessRequestsTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
  onReviewed?: () => void;
};

const FILTERS = ['pending', 'granted', 'dismissed', 'all'] as const;
type Filter = (typeof FILTERS)[number];

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/** TradingView usernames waiting for manual invite grant. */
export default function TvAccessRequestsTab({
  adminEmail,
  adminPassword,
  onReviewed,
}: TvAccessRequestsTabProps) {
  const [filter, setFilter] = useState<Filter>('pending');
  const [rows, setRows] = useState<AdminTvAccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListTvAccessRequests(filter, adminEmail, adminPassword);
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

  const review = async (row: AdminTvAccessRequest, action: 'granted' | 'dismiss') => {
    setBusyId(row.id);
    setError('');
    try {
      await adminReviewTvAccessRequest(row.id, action, {}, adminEmail, adminPassword);
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
      <p className="text-xs text-slate-400">
        Users submit their TradingView ID on indicator pages. Grant the invite on TradingView,
        then mark it here.
      </p>

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
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-8 text-center text-xs text-slate-500">
          {loading ? 'Loading…' : `No ${filter === 'all' ? '' : filter} TradingView requests.`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#1a1f2e]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b0e17] text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-bold">TradingView ID</th>
                <th className="px-3 py-2 font-bold">Indicator</th>
                <th className="px-3 py-2 font-bold">User</th>
                <th className="px-3 py-2 font-bold">Submitted</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Actions</th>
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
                  <td className="px-3 py-2.5 font-mono text-gold">@{row.tradingViewId}</td>
                  <td className="px-3 py-2.5 text-slate-200">{row.indicatorTitle || row.indicatorId}</td>
                  <td className="px-3 py-2.5 text-slate-300">
                    <div>{row.name || '—'}</div>
                    <div className="text-[10px] text-slate-500">{row.email || row.phone || ''}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatDate(row.createdAt)}
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
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.status === 'pending' ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void review(row, 'granted')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                          Granted
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void review(row, 'dismiss')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                        >
                          <X className="w-3 h-3" />
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500">
                        {row.reviewedBy ? `by ${row.reviewedBy}` : '—'}
                      </span>
                    )}
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
