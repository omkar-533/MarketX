import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Ban,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatSpentDuration, loginTimesUnit, type InviteUserRow } from '../../services/appInviteAuth';

type ApprovedAccessTabProps = {
  rows: InviteUserRow[];
  loading: boolean;
  defaultGrantDays: number;
  onRefresh: () => void;
  onChangeAccess: (
    row: InviteUserRow,
    status: 'granted' | 'locked' | 'blocked',
    days?: number,
  ) => void | Promise<void>;
};

type ViewFilter = 'all' | 'active' | 'expired';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function isGrantedUser(row: InviteUserRow) {
  return row.role !== 'admin' && row.role !== 'subadmin' && (row.accessStatus === 'granted' || row.access?.status === 'granted');
}

function accessSummary(row: InviteUserRow) {
  const state = row.access;
  if (!state) {
    return {
      text: row.accessExpiresAt ? 'Granted' : 'Granted · lifetime',
      tone: 'good' as const,
      active: true,
    };
  }
  if (!state.unlocked) {
    return { text: 'Granted · expired', tone: 'warn' as const, active: false };
  }
  const left =
    state.daysLeft === null
      ? 'lifetime'
      : state.daysLeft <= 1
        ? `${state.hoursLeft ?? 0}h left`
        : `${state.daysLeft}d left`;
  return { text: `Active · ${left}`, tone: 'good' as const, active: true };
}

const TONE_CLASS = {
  good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

function exportApprovedExcel(users: InviteUserRow[]) {
  const data = users.map((u) => {
    const summary = accessSummary(u);
    return {
      Name: u.name || '',
      Email: u.email || '',
      Mobile: u.phone || '',
      Plan: u.plan || '',
      Access: summary.text,
      Expires: u.accessExpiresAt
        ? new Date(u.accessExpiresAt).toLocaleString('en-IN')
        : 'Lifetime',
      Joined: u.createdAt ? new Date(u.createdAt).toLocaleString('en-IN') : '',
      'Last login': u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : '',
      'Login count': u.loginCount ?? 0,
      'Time spent': formatSpentDuration(u.timeSpentMs),
    };
  });
  const sheet = XLSX.utils.json_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Approved');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(book, `wolf-trade-approved-access_${stamp}.xlsx`);
}

/** Users who already received website access approval (`accessStatus: granted`). */
export default function ApprovedAccessTab({
  rows,
  loading,
  defaultGrantDays,
  onRefresh,
  onChangeAccess,
}: ApprovedAccessTabProps) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewFilter>('all');
  const [extendDays, setExtendDays] = useState<Record<string, string>>({});

  const granted = useMemo(() => rows.filter(isGrantedUser), [rows]);

  const stats = useMemo(() => {
    let active = 0;
    let expired = 0;
    let lifetime = 0;
    for (const u of granted) {
      const s = accessSummary(u);
      if (s.active) active += 1;
      else expired += 1;
      if (!u.accessExpiresAt) lifetime += 1;
    }
    return { total: granted.length, active, expired, lifetime };
  }, [granted]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return granted
      .filter((u) => {
        const s = accessSummary(u);
        if (view === 'active' && !s.active) return false;
        if (view === 'expired' && s.active) return false;
        if (!q) return true;
        return (
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.phone?.includes(q)
        );
      })
      .sort((a, b) => {
        const aActive = accessSummary(a).active ? 0 : 1;
        const bActive = accessSummary(b).active ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return (b.lastLoginAt || b.createdAt || '').localeCompare(a.lastLoginAt || a.createdAt || '');
      });
  }, [granted, query, view]);

  return (
    <div className="space-y-4">
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Approved website access
        </h3>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Members who already received website access approval. Trial-only users stay under Users —
          not listed here.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: 'Approved', value: stats.total, hint: 'Total granted' },
          { label: 'Active now', value: stats.active, hint: 'Unlocked' },
          { label: 'Expired', value: stats.expired, hint: 'Granted but expired' },
          { label: 'Lifetime', value: stats.lifetime, hint: 'No expiry date' },
        ].map((card) => (
          <div key={card.label} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl px-3 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
              {card.label}
            </p>
            <p className="text-2xl font-black text-[#d4af37] mt-1 tabular-nums">{card.value}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#1a1f2e]">
          <label className="relative flex-1 min-w-[12rem]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, mobile…"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200"
            />
          </label>
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'all' as const, label: 'All' },
                { id: 'active' as const, label: 'Active' },
                { id: 'expired' as const, label: 'Expired' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setView(f.id)}
                className={`px-3 py-2 rounded-lg border text-[10px] font-bold transition-colors ${
                  view === f.id
                    ? 'bg-[#d4af37]/15 border-[#d4af37]/40 text-[#d4af37]'
                    : 'border-[#1a1f2e] text-slate-400 hover:text-gold'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => exportApprovedExcel(visible)}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="text-[10px] text-slate-400 hover:text-gold flex items-center gap-1 ml-auto"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-3 text-left w-10">#</th>
                <th className="py-3 px-4 text-left">User</th>
                <th className="py-3 px-4 text-left">Mobile</th>
                <th className="py-3 px-4 text-left">Access</th>
                <th className="py-3 px-4 text-left">Expires</th>
                <th className="py-3 px-4 text-left">Last login</th>
                <th className="py-3 px-4 text-right">Times logged in</th>
                <th className="py-3 px-4 text-right">Time spent</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                    {loading
                      ? 'Loading…'
                      : granted.length === 0
                        ? 'No approved-access users yet.'
                        : 'No users match this filter.'}
                  </td>
                </tr>
              ) : (
                visible.map((u, idx) => {
                  const summary = accessSummary(u);
                  return (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(idx, 20) * 0.015 }}
                      className="border-b border-[#1a1f2e]/40 hover:bg-[#121520]"
                    >
                      <td className="py-2.5 px-3 text-slate-500 text-xs tabular-nums font-bold">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-emerald-400">
                              {u.name?.[0] || '?'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-200 truncate">{u.name}</div>
                            <div className="text-[10px] text-slate-600 truncate">{u.email}</div>
                            <div className="text-[10px] text-slate-700 capitalize">
                              {u.plan} · {u.active ? 'active' : 'disabled'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-xs font-mono text-slate-300 whitespace-nowrap">
                        {u.phone || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${TONE_CLASS[summary.tone]}`}
                        >
                          {summary.text}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                        {u.accessExpiresAt ? formatDateTime(u.accessExpiresAt) : 'Lifetime'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                        {formatDateTime(u.lastLoginAt)}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="text-sm font-black text-[#d4af37] tabular-nums leading-none">
                          {u.loginCount || 0}
                        </div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                          {loginTimesUnit(u.loginCount)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="text-[12px] font-black text-white tabular-nums">
                          {formatSpentDuration(u.timeSpentMs)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <input
                            type="number"
                            min={0}
                            value={extendDays[u.id] ?? String(defaultGrantDays)}
                            onChange={(e) =>
                              setExtendDays((p) => ({ ...p, [u.id]: e.target.value }))
                            }
                            title="Days to extend (0 = lifetime)"
                            className="w-14 px-2 py-1 rounded-md bg-[#121520] border border-[#1a1f2e] text-[11px] text-slate-200"
                          />
                          <button
                            type="button"
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold"
                            onClick={() =>
                              void onChangeAccess(
                                u,
                                'granted',
                                Number(extendDays[u.id] ?? defaultGrantDays),
                              )
                            }
                          >
                            Extend
                          </button>
                          <button
                            type="button"
                            className="text-[10px] text-amber-400 hover:text-amber-300 font-bold"
                            onClick={() => void onChangeAccess(u, 'locked')}
                          >
                            Lock
                          </button>
                          <button
                            type="button"
                            className="text-[10px] text-red-400 hover:text-red-300 font-bold inline-flex items-center gap-0.5"
                            onClick={() => void onChangeAccess(u, 'blocked')}
                          >
                            <Ban className="w-3 h-3" />
                            Block
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[10px] text-slate-600 border-t border-[#1a1f2e]">
          Showing {visible.length} of {granted.length} approved user
          {granted.length === 1 ? '' : 's'}.
        </p>
      </div>
    </div>
  );
}

export function countApprovedAccessUsers(rows: InviteUserRow[]) {
  return rows.filter(isGrantedUser).length;
}
