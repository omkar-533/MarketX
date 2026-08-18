import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Lock,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatSpentDuration, type InviteUserRow } from '../../services/appInviteAuth';

type AdminAnalyticsTabProps = {
  rows: InviteUserRow[];
  loading?: boolean;
};

const PIE_COLORS = ['#d4af37', '#34d399', '#60a5fa', '#f87171', '#94a3b8'];

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shortDayLabel(key: string) {
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function memberAccessBucket(u: InviteUserRow): 'trial' | 'granted' | 'locked' | 'blocked' {
  if (u.accessStatus === 'blocked' || u.access?.status === 'blocked' || !u.active) return 'blocked';
  if (u.accessStatus === 'granted') {
    return u.access?.unlocked === false ? 'locked' : 'granted';
  }
  if (u.accessStatus === 'locked' || u.access?.unlocked === false) return 'locked';
  return 'trial';
}

/** Live analytics from invite users — signups, access mix, plans, login activity. */
export default function AdminAnalyticsTab({ rows, loading }: AdminAnalyticsTabProps) {
  const members = useMemo(() => rows.filter((r) => r.role !== 'admin'), [rows]);

  const stats = useMemo(() => {
    let unlocked = 0;
    let trial = 0;
    let granted = 0;
    let locked = 0;
    let blocked = 0;
    let loginSum = 0;
    let timeSpent = 0;
    let everLoggedIn = 0;
    for (const u of members) {
      const bucket = memberAccessBucket(u);
      if (bucket === 'trial') trial += 1;
      else if (bucket === 'granted') granted += 1;
      else if (bucket === 'locked') locked += 1;
      else blocked += 1;
      if (u.access?.unlocked) unlocked += 1;
      loginSum += u.loginCount ?? 0;
      timeSpent += u.timeSpentMs ?? 0;
      if (u.firstLoginAt || (u.loginCount ?? 0) > 0) everLoggedIn += 1;
    }
    return {
      total: members.length,
      unlocked,
      trial,
      granted,
      locked,
      blocked,
      loginSum,
      timeSpent,
      everLoggedIn,
    };
  }, [members]);

  const signupSeries = useMemo(() => {
    const days = 14;
    const today = startOfLocalDay(new Date());
    const keys: string[] = [];
    const counts = new Map<string, number>();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = dayKey(d);
      keys.push(key);
      counts.set(key, 0);
    }
    for (const u of members) {
      const t = Date.parse(u.createdAt || '');
      if (!Number.isFinite(t)) continue;
      const key = dayKey(startOfLocalDay(new Date(t)));
      if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return keys.map((key) => ({
      date: shortDayLabel(key),
      signups: counts.get(key) || 0,
    }));
  }, [members]);

  const accessPie = useMemo(() => {
    const items = [
      { name: 'Trial', value: stats.trial },
      { name: 'Approved', value: stats.granted },
      { name: 'Locked / expired', value: stats.locked },
      { name: 'Blocked', value: stats.blocked },
    ].filter((i) => i.value > 0);
    return items.length ? items : [{ name: 'No members yet', value: 1 }];
  }, [stats]);

  const planBars = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of members) {
      const plan = (u.plan || 'free').toLowerCase();
      map.set(plan, (map.get(plan) || 0) + 1);
    }
    const order = ['free', 'pro', 'premium'];
    const rowsOut = order
      .filter((p) => map.has(p))
      .map((p) => ({ plan: p.toUpperCase(), users: map.get(p) || 0 }));
    for (const [plan, users] of map) {
      if (!order.includes(plan)) rowsOut.push({ plan: plan.toUpperCase(), users });
    }
    return rowsOut.length ? rowsOut : [{ plan: 'NONE', users: 0 }];
  }, [members]);

  const loginSeries = useMemo(() => {
    const days = 14;
    const today = startOfLocalDay(new Date());
    const keys: string[] = [];
    const counts = new Map<string, number>();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = dayKey(d);
      keys.push(key);
      counts.set(key, 0);
    }
    for (const u of members) {
      const t = Date.parse(u.lastLoginAt || '');
      if (!Number.isFinite(t)) continue;
      const key = dayKey(startOfLocalDay(new Date(t)));
      if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return keys.map((key) => ({
      date: shortDayLabel(key),
      logins: counts.get(key) || 0,
    }));
  }, [members]);

  const empty = members.length === 0 && !loading;

  return (
    <div className="space-y-4">
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-1">
        <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Live desk analytics
        </h3>
        <p className="text-[11px] text-slate-500">
          Built from real invite users — signups, access status, plans, and login activity. Not
          placeholder traffic.
        </p>
      </div>

      {empty ? (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-8 text-center text-sm text-slate-500">
          No member data yet. When users sign up, charts will fill in here automatically.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {[
              { label: 'Members', value: stats.total, icon: Users, color: 'text-[#d4af37]' },
              { label: 'Unlocked now', value: stats.unlocked, icon: UserCheck, color: 'text-emerald-400' },
              { label: 'Approved', value: stats.granted, icon: ShieldCheck, color: 'text-emerald-400' },
              { label: 'Trial', value: stats.trial, icon: Activity, color: 'text-amber-400' },
              { label: 'Locked / blocked', value: stats.locked + stats.blocked, icon: Lock, color: 'text-red-400' },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl px-3 py-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <Icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                  <p className="text-2xl font-black text-slate-100 tabular-nums">{card.value}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    {card.label}
                  </p>
                </motion.div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <h3 className="text-sm font-bold text-[#d4af37] mb-1">Signups · last 14 days</h3>
              <p className="text-[10px] text-slate-600 mb-3">
                New members by join date · {stats.everLoggedIn} have logged in at least once ·{' '}
                {stats.loginSum} times logged in · {formatSpentDuration(stats.timeSpent)} spent
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={signupSeries}>
                  <defs>
                    <linearGradient id="analyticsSignups" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d4af37" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b0e17',
                      border: '1px solid #1a1f2e',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="signups"
                    stroke="#d4af37"
                    fill="url(#analyticsSignups)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <h3 className="text-sm font-bold text-[#d4af37] mb-1">Last login · last 14 days</h3>
              <p className="text-[10px] text-slate-600 mb-3">
                Unique members whose last login fell on that day
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={loginSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b0e17',
                      border: '1px solid #1a1f2e',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="logins" fill="#34d399" opacity={0.85} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <h3 className="text-sm font-bold text-[#d4af37] mb-3">Access mix</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={accessPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {accessPie.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b0e17',
                      border: '1px solid #1a1f2e',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-1">
                {accessPie.map((item, i) => (
                  <span key={item.name} className="text-[10px] text-slate-400 flex items-center gap-1.5">
                    <i
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {item.name}: {item.value}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <h3 className="text-sm font-bold text-[#d4af37] mb-3">Plan breakdown</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={planBars} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                  <XAxis type="number" stroke="#475569" fontSize={10} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="plan" stroke="#475569" fontSize={10} tickLine={false} width={70} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b0e17',
                      border: '1px solid #1a1f2e',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="users" fill="#d4af37" opacity={0.85} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
