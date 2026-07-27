import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import {
  adminListTvAccessRequests,
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

/** Read-only list of TradingView usernames submitted for manual invite. */
export default function TvAccessRequestsTab({
  adminEmail,
  adminPassword,
}: TvAccessRequestsTabProps) {
  const [rows, setRows] = useState<AdminTvAccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-400">
          TradingView IDs submitted from indicator pages — grant access manually on TradingView.
        </p>
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
          {loading ? 'Loading…' : 'No TradingView submissions yet.'}
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
                  <td className="px-3 py-2.5 text-slate-200">
                    {row.indicatorTitle || row.indicatorId}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    <div>{row.name || '—'}</div>
                    <div className="text-[10px] text-slate-500">{row.email || row.phone || ''}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatDate(row.createdAt)}
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
