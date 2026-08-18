import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, RefreshCw, Search } from 'lucide-react';
import {
  adminListLogins,
  type AdminLoginEvent,
  type InviteUserRow,
} from '../../services/appInviteAuth';

type Props = {
  rows: InviteUserRow[];
  adminEmail?: string | null;
  adminPassword?: string | null;
};

function formatIstDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatIstTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function startOfIstDay(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  return Date.parse(`${parts}T00:00:00+05:30`);
}

export default function AdminLoginsTab({ rows, adminEmail, adminPassword }: Props) {
  const [events, setEvents] = useState<AdminLoginEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [range, setRange] = useState<'today' | '7d' | 'all'>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setEvents(await adminListLogins(adminEmail, adminPassword, { limit: 500 }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load logins');
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const members = useMemo(
    () => rows.filter((u) => u.role !== 'admin' && u.role !== 'subadmin'),
    [rows],
  );

  const perUser = useMemo(
    () =>
      [...members]
        .filter((u) => (u.loginCount || 0) > 0 || u.lastLoginAt)
        .sort((a, b) => Date.parse(b.lastLoginAt || '0') - Date.parse(a.lastLoginAt || '0')),
    [members],
  );

  const filteredEvents = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    const todayStart = startOfIstDay();
    const weekStart = todayStart - 6 * 86_400_000;
    return events.filter((e) => {
      const t = Date.parse(e.loggedInAt);
      if (range === 'today' && !(t >= todayStart)) return false;
      if (range === '7d' && !(t >= weekStart)) return false;
      if (!needle) return true;
      const phone = String(e.phone || '').toLowerCase();
      return (
        e.name.toLowerCase().includes(needle) ||
        e.email.toLowerCase().includes(needle) ||
        phone.includes(needle) ||
        (digits.length >= 3 && phone.replace(/\D/g, '').includes(digits))
      );
    });
  }, [events, q, range]);

  const todayStart = startOfIstDay();
  const todayEvents = events.filter((e) => Date.parse(e.loggedInAt) >= todayStart);
  const todayUsers = new Set(todayEvents.map((e) => e.userId)).size;
  const totalLogins = members.reduce((n, u) => n + (u.loginCount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: 'Logins today', value: todayEvents.length },
          { label: 'People today', value: todayUsers },
          { label: 'Total login count', value: totalLogins },
          { label: 'Members who logged in', value: perUser.length },
        ].map((card) => (
          <div key={card.label} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl px-3 py-3">
            <p className="text-2xl font-black text-[#d4af37] tabular-nums">{card.value}</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
              {card.label}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#1a1f2e]">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#d4af37]" />
            Login history
          </h3>
          <p className="text-[10px] text-slate-600">
            Each row is one login · date & time IST
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
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <label className="flex items-center gap-2 flex-1 min-w-[14rem] px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e]">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, mobile, email"
              className="bg-transparent outline-none text-sm text-slate-200 w-full"
            />
          </label>
          {(['today', '7d', 'all'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`px-3 py-2 rounded-lg border text-[10px] font-bold ${
                range === id
                  ? 'bg-[#d4af37]/15 border-[#d4af37]/40 text-[#d4af37]'
                  : 'border-[#1a1f2e] text-slate-400 hover:text-gold'
              }`}
            >
              {id === '7d' ? '7 days' : id === 'today' ? 'Today' : 'All'}
            </button>
          ))}
        </div>
        {err ? <p className="px-4 pb-2 text-xs text-red-400">{err}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-3 text-left w-10">#</th>
                <th className="py-3 px-4 text-left">Date</th>
                <th className="py-3 px-4 text-left">Time IST</th>
                <th className="py-3 px-4 text-left">User</th>
                <th className="py-3 px-4 text-left">Mobile</th>
                <th className="py-3 px-4 text-right">Login count</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                    {loading
                      ? 'Loading…'
                      : events.length === 0
                        ? 'New logins will appear here with date and time. Per-user totals are below.'
                        : 'No logins match this filter.'}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((e, idx) => (
                  <motion.tr
                    key={e.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-[#1a1f2e]/40 hover:bg-[#121520]"
                  >
                    <td className="py-2.5 px-3 text-slate-500 text-xs tabular-nums font-bold">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-4 text-slate-200 text-[12px] whitespace-nowrap">
                      {formatIstDate(e.loggedInAt)}
                    </td>
                    <td className="py-2.5 px-4 text-[#d4af37] text-[12px] font-bold whitespace-nowrap tabular-nums">
                      {formatIstTime(e.loggedInAt)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-sm font-bold text-slate-200">{e.name}</div>
                      <div className="text-[10px] text-slate-600">{e.email}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono text-slate-300 whitespace-nowrap">
                      {e.phone || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-sm font-black text-[#d4af37] tabular-nums">
                      {e.loginCount}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a1f2e]">
          <h3 className="text-sm font-bold text-white">Per user · count, first & last</h3>
          <p className="text-[10px] text-slate-600">Totals already stored on each account</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-3 text-left w-10">#</th>
                <th className="py-3 px-4 text-left">User</th>
                <th className="py-3 px-4 text-left">Mobile</th>
                <th className="py-3 px-4 text-right">Logins</th>
                <th className="py-3 px-4 text-left">First login</th>
                <th className="py-3 px-4 text-left">Last login</th>
              </tr>
            </thead>
            <tbody>
              {perUser.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                    Nobody has logged in yet.
                  </td>
                </tr>
              ) : (
                perUser.map((u, idx) => (
                  <tr key={u.id} className="border-b border-[#1a1f2e]/40">
                    <td className="py-2.5 px-3 text-slate-500 text-xs tabular-nums font-bold">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="text-sm font-bold text-slate-200">{u.name}</div>
                      <div className="text-[10px] text-slate-600">{u.email}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono text-slate-300">
                      {u.phone || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-sm font-black text-[#d4af37] tabular-nums">
                      {u.loginCount || 0}
                    </td>
                    <td className="py-2.5 px-4 text-[12px] text-slate-300 whitespace-nowrap">
                      {formatIstDate(u.firstLoginAt)}{' '}
                      <span className="text-slate-500">{formatIstTime(u.firstLoginAt)}</span>
                    </td>
                    <td className="py-2.5 px-4 text-[12px] text-slate-300 whitespace-nowrap">
                      {formatIstDate(u.lastLoginAt)}{' '}
                      <span className="text-[#d4af37] font-bold">{formatIstTime(u.lastLoginAt)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
