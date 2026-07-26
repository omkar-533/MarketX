import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Crown,
  Shield,
  BarChart3,
  DollarSign,
  Activity,
  UserPlus,
  Trash2,
  RefreshCw,
  Copy,
  Ban,
  Eye,
  FileImage,
  Settings,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import type { User } from '../hooks/useAuth';
import {
  adminCreateUser,
  adminDeleteUser,
  adminGetSettings,
  adminListUsers,
  adminMarkUsersSeen,
  adminSetUserAccess,
  adminSetUserActive,
  type InviteUserRow,
} from '../services/appInviteAuth';
import AccessRequestsTab from './admin/AccessRequestsTab';
import AccessSettingsTab from './admin/AccessSettingsTab';

const trafficData = Array.from({ length: 14 }, (_, i) => ({
  date: `Day ${i + 1}`,
  users: Math.floor(800 + Math.random() * 400),
  pageViews: Math.floor(3000 + Math.random() * 2000),
}));

const revenueData = Array.from({ length: 6 }, (_, i) => ({
  month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i],
  revenue: Math.floor(50000 + Math.random() * 30000),
  subscriptions: Math.floor(100 + Math.random() * 80),
}));

interface AdminPanelProps {
  user: User | null;
  adminPassword?: string | null;
}

function randomPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
  let out = '';
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type AdminTab = 'users' | 'requests' | 'settings' | 'overview' | 'analytics' | 'payments';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function accessLabel(row: InviteUserRow) {
  const state = row.access;
  if (!state) return { text: row.accessStatus ?? 'trial', tone: 'muted' as const };
  if (state.status === 'blocked') return { text: 'Blocked', tone: 'bad' as const };
  if (!state.unlocked) return { text: 'Locked', tone: 'bad' as const };

  const left =
    state.daysLeft === null
      ? 'lifetime'
      : state.daysLeft <= 1
        ? `${state.hoursLeft ?? 0}h left`
        : `${state.daysLeft}d left`;
  return {
    text: `${state.isTrial ? 'Trial' : 'Active'} · ${left}`,
    tone: state.isTrial ? ('warn' as const) : ('good' as const),
  };
}

const TONE_CLASS = {
  good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  bad: 'bg-red-500/10 text-red-400 border-red-500/20',
  muted: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function AdminPanel({ user, adminPassword }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [rows, setRows] = useState<InviteUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState(() => randomPassword());
  const [plan, setPlan] = useState<'free' | 'pro' | 'premium'>('pro');
  const [creating, setCreating] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);
  const [grantDays, setGrantDays] = useState<Record<string, string>>({});
  const [defaultGrantDays, setDefaultGrantDays] = useState(30);

  const adminEmail = user?.email ?? null;
  const newUserCount = rows.filter((r) => !r.adminSeenAt && r.role !== 'admin').length;

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const list = await adminListUsers(adminEmail, adminPassword);
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword]);

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'overview') void refresh();
  }, [activeTab, refresh]);

  useEffect(() => {
    adminGetSettings(adminEmail, adminPassword)
      .then((data) => setDefaultGrantDays(data.popup.defaultGrantDays))
      .catch(() => undefined);
  }, [adminEmail, adminPassword]);

  const handleCreate = async () => {
    setMsg('');
    setErr('');
    setCreating(true);
    try {
      await adminCreateUser(
        { name, email, password, plan, phone: mobile || undefined },
        adminEmail,
        adminPassword,
      );
      setLastCreated({ email: email.trim().toLowerCase(), password });
      setMsg('Login created. Share email & password with the user privately.');
      setName('');
      setEmail('');
      setMobile('');
      setPassword(randomPassword());
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const changeAccess = async (row: InviteUserRow, status: 'granted' | 'locked' | 'blocked') => {
    setErr('');
    try {
      await adminSetUserAccess(
        row.id,
        {
          status,
          days: status === 'granted' ? Number(grantDays[row.id] ?? defaultGrantDays) : null,
        },
        adminEmail,
        adminPassword,
      );
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update access');
    }
  };

  const markAllSeen = async () => {
    await adminMarkUsersSeen(null, adminEmail, adminPassword);
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
          <Crown className="w-5 h-5" />
          Admin Panel
        </h2>
        <p className="text-sm text-slate-400">
          Trial signups, access approvals and invite logins — all in one place
        </p>
      </div>

      <div className="flex overflow-x-auto bg-dark-elevated rounded-lg border border-dark-border">
        {(
          [
            { id: 'users' as const, label: 'Users', icon: Users, badge: newUserCount },
            { id: 'requests' as const, label: 'Access requests', icon: FileImage, badge: 0 },
            { id: 'settings' as const, label: 'Settings', icon: Settings, badge: 0 },
            { id: 'overview' as const, label: 'Overview', icon: BarChart3, badge: 0 },
            { id: 'analytics' as const, label: 'Analytics', icon: Activity, badge: 0 },
            { id: 'payments' as const, label: 'Payments', icon: DollarSign, badge: 0 },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all shrink-0 ${
                activeTab === t.id ? 'bg-gold/10 text-gold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.badge ? (
                <span className="px-1.5 py-0.5 rounded-full bg-[#d4af37] text-[9px] text-[#0b0e16]">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === 'requests' && (
        <AccessRequestsTab
          adminEmail={adminEmail}
          adminPassword={adminPassword}
          defaultGrantDays={defaultGrantDays}
          onReviewed={() => void refresh()}
        />
      )}

      {activeTab === 'settings' && (
        <AccessSettingsTab
          adminEmail={adminEmail}
          adminPassword={adminPassword}
          onSaved={(popup) => setDefaultGrantDays(popup.defaultGrantDays)}
        />
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Create login
              </h3>
              <button
                type="button"
                onClick={() => setPassword(randomPassword())}
                className="text-[10px] text-slate-400 hover:text-gold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                New password
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
                className="px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200"
              />
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Mobile (optional)"
                inputMode="numeric"
                className="px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200 font-mono"
              />
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as 'free' | 'pro' | 'premium')}
                className="px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <button
              type="button"
              disabled={creating || !email || !password}
              onClick={() => void handleCreate()}
              className="px-4 py-2 rounded-lg bg-gold/15 border border-gold/30 text-gold text-xs font-bold hover:bg-gold/25 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create & save login'}
            </button>
            {msg ? <p className="text-[11px] text-emerald-400">{msg}</p> : null}
            {err ? <p className="text-[11px] text-red-400">{err}</p> : null}
            {lastCreated ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-slate-300 space-y-1">
                <p className="font-bold text-emerald-400">Share privately:</p>
                <p>
                  Email: <span className="font-mono text-slate-100">{lastCreated.email}</span>
                </p>
                <p className="flex items-center gap-2">
                  Password: <span className="font-mono text-slate-100">{lastCreated.password}</span>
                  <button
                    type="button"
                    className="text-gold inline-flex items-center gap-1"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        `Email: ${lastCreated.email}\nPassword: ${lastCreated.password}`,
                      )
                    }
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </p>
              </div>
            ) : null}
          </div>

          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#1a1f2e]">
              <h3 className="text-sm font-bold text-white">
                Users ({rows.length})
                {newUserCount ? (
                  <span className="ml-2 text-[10px] font-bold text-[#d4af37]">
                    {newUserCount} new
                  </span>
                ) : null}
              </h3>
              <div className="flex items-center gap-3">
                {newUserCount ? (
                  <button
                    type="button"
                    onClick={() => void markAllSeen()}
                    className="text-[10px] text-slate-400 hover:text-gold flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    Mark all seen
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-4 text-left">User</th>
                    <th className="py-3 px-4 text-left">Mobile</th>
                    <th className="py-3 px-4 text-left">Access</th>
                    <th className="py-3 px-4 text-left">First login</th>
                    <th className="py-3 px-4 text-left">Last login</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                        {loading ? 'Loading…' : 'No users yet.'}
                      </td>
                    </tr>
                  ) : (
                    rows.map((u, idx) => {
                      const badge = accessLabel(u);
                      const isNew = !u.adminSeenAt && u.role !== 'admin';
                      return (
                        <motion.tr
                          key={u.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.02 }}
                          className="border-b border-[#1a1f2e]/40 hover:bg-[#121520]"
                        >
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-[#d4af37]/10 rounded-full flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-[#d4af37]">
                                  {u.name?.[0] || '?'}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                                  <span className="truncate">{u.name}</span>
                                  {isNew ? (
                                    <span className="px-1.5 py-0.5 rounded-full bg-[#d4af37] text-[9px] font-bold text-[#0b0e16]">
                                      NEW
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[10px] text-slate-600 truncate">{u.email}</div>
                                <div className="text-[10px] text-slate-700 capitalize">
                                  {u.plan} · {u.active ? 'active' : 'disabled'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-xs font-mono text-slate-300 whitespace-nowrap">
                            {u.phone || <span className="text-slate-600">—</span>}
                            {u.phone && !u.phoneVerified ? (
                              <span className="ml-1 text-[9px] text-amber-400">unverified</span>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${TONE_CLASS[badge.tone]}`}
                            >
                              {badge.text}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                            {formatDateTime(u.firstLoginAt)}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                            {formatDateTime(u.lastLoginAt)}
                            {u.loginCount ? (
                              <span className="block text-[9px] text-slate-700">
                                {u.loginCount} logins
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <input
                                type="number"
                                min={0}
                                value={grantDays[u.id] ?? String(defaultGrantDays)}
                                onChange={(e) =>
                                  setGrantDays((p) => ({ ...p, [u.id]: e.target.value }))
                                }
                                title="Days to grant (0 = lifetime)"
                                className="w-14 px-2 py-1 rounded-md bg-[#121520] border border-[#1a1f2e] text-[11px] text-slate-200"
                              />
                              <button
                                type="button"
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold"
                                onClick={() => void changeAccess(u, 'granted')}
                              >
                                Grant
                              </button>
                              <button
                                type="button"
                                className="text-[10px] text-amber-400 hover:text-amber-300 font-bold"
                                onClick={() => void changeAccess(u, 'locked')}
                              >
                                Lock
                              </button>
                              <button
                                type="button"
                                className="text-[10px] text-red-400 hover:text-red-300 font-bold inline-flex items-center gap-0.5"
                                onClick={() => void changeAccess(u, 'blocked')}
                              >
                                <Ban className="w-3 h-3" />
                                Block
                              </button>
                              <button
                                type="button"
                                className="text-[10px] text-slate-400 hover:text-gold font-bold"
                                onClick={() =>
                                  void adminSetUserActive(
                                    u.id,
                                    !u.active,
                                    adminEmail,
                                    adminPassword,
                                  ).then(refresh)
                                }
                              >
                                {u.active ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                type="button"
                                className="text-[10px] text-red-400 hover:text-red-300 font-bold inline-flex items-center gap-0.5"
                                onClick={() => {
                                  if (!window.confirm(`Delete login for ${u.email}?`)) return;
                                  void adminDeleteUser(u.id, adminEmail, adminPassword).then(refresh);
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete
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
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Invite Users', value: String(rows.length), change: 'Live', icon: Users, color: 'text-[#d4af37]' },
              { label: 'Active', value: String(rows.filter((r) => r.active).length), change: '', icon: Activity, color: 'text-emerald-400' },
              { label: 'Pro+', value: String(rows.filter((r) => r.plan !== 'free').length), change: '', icon: Shield, color: 'text-blue-400' },
              { label: 'Admin', value: user?.name || '—', change: '', icon: Crown, color: 'text-purple-400' },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                    {stat.change ? <span className="text-[10px] text-emerald-400 font-bold">{stat.change}</span> : null}
                  </div>
                  <div className="text-2xl font-bold text-slate-200 truncate">{stat.value}</div>
                  <div className="text-[10px] text-slate-600">{stat.label}</div>
                </motion.div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <h3 className="text-sm font-bold text-[#d4af37] mb-3">Traffic Overview</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={trafficData}>
                  <defs>
                    <linearGradient id="ad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d4af37" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="users" stroke="#d4af37" fill="url(#ad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <h3 className="text-sm font-bold text-[#d4af37] mb-3">Revenue</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                  <XAxis dataKey="month" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="revenue" fill="#d4af37" opacity={0.7} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {activeTab === 'analytics' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 text-sm text-slate-500">
          Analytics charts are illustrative. Invite user counts above are live.
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 text-sm text-slate-500">
          Payments integration coming later. Plans on invite users are set when you create the login.
        </div>
      )}
    </div>
  );
}
