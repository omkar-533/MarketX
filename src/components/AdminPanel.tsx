import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Crown, Shield, BarChart3, DollarSign, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const users = [
  { id: '1', name: 'Rahul Sharma', email: 'rahul@email.com', plan: 'Premium', status: 'Active', joined: '15 Jan 2025', lastActive: '2 mins ago' },
  { id: '2', name: 'Priya Patel', email: 'priya@email.com', plan: 'Pro', status: 'Active', joined: '20 Jan 2025', lastActive: '5 mins ago' },
  { id: '3', name: 'Amit Kumar', email: 'amit@email.com', plan: 'Free', status: 'Active', joined: '1 Feb 2025', lastActive: '1 hour ago' },
  { id: '4', name: 'Sneha Gupta', email: 'sneha@email.com', plan: 'Pro', status: 'Inactive', joined: '10 Feb 2025', lastActive: '3 days ago' },
  { id: '5', name: 'Vikram Rao', email: 'vikram@email.com', plan: 'Premium', status: 'Active', joined: '5 Mar 2025', lastActive: 'Just now' },
];

const trafficData = Array.from({ length: 14 }, (_, i) => ({
  date: `Day ${i + 1}`, users: Math.floor(800 + Math.random() * 400), pageViews: Math.floor(3000 + Math.random() * 2000),
}));

const revenueData = Array.from({ length: 6 }, (_, i) => ({
  month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i], revenue: Math.floor(50000 + Math.random() * 30000), subscriptions: Math.floor(100 + Math.random() * 80),
}));

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'analytics' | 'payments'>('overview');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2"><Crown className="w-5 h-5" />Admin Panel</h2>
        <p className="text-sm text-slate-400">Manage users, analytics & subscriptions</p>
      </div>

      <div className="flex overflow-x-auto bg-dark-elevated rounded-lg border border-dark-border">
        {[{ id: 'overview' as const, label: 'Overview', icon: BarChart3 }, { id: 'users' as const, label: 'Users', icon: Users }, { id: 'analytics' as const, label: 'Analytics', icon: Activity }, { id: 'payments' as const, label: 'Payments', icon: DollarSign }].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all shrink-0 ${activeTab === t.id ? 'bg-gold/10 text-gold' : 'text-slate-500 hover:text-slate-300'}`}>
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[{ label: 'Total Users', value: '2,458', change: '+12%', icon: Users, color: 'text-[#d4af37]' }, { label: 'Active Now', value: '342', change: '+5%', icon: Activity, color: 'text-emerald-400' }, { label: 'Revenue', value: '₹4.2L', change: '+18%', icon: DollarSign, color: 'text-blue-400' }, { label: 'Premium Users', value: '856', change: '+8%', icon: Shield, color: 'text-purple-400' }].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                    <span className="text-[10px] text-emerald-400 font-bold">{stat.change}</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-200">{stat.value}</div>
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
                  <defs><linearGradient id="ad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#d4af37" stopOpacity={0.3}/><stop offset="95%" stopColor="#d4af37" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="users" stroke="#d4af37" fill="url(#ad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="pageViews" stroke="#10b981" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
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

      {activeTab === 'users' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-4 text-left">User</th>
                <th className="py-3 px-4 text-left">Plan</th>
                <th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4 text-left">Joined</th>
                <th className="py-3 px-4 text-left">Last Active</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                  className="border-b border-[#1a1f2e]/40 hover:bg-[#121520] transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-[#d4af37]/10 rounded-full flex items-center justify-center"><span className="text-xs font-bold text-[#d4af37]">{u.name[0]}</span></div>
                      <div><div className="text-sm font-bold text-slate-200">{u.name}</div><div className="text-[10px] text-slate-600">{u.email}</div></div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4"><span className={`text-xs px-2 py-0.5 rounded-full font-bold ${u.plan === 'Premium' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : u.plan === 'Pro' ? 'bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>{u.plan}</span></td>
                  <td className="py-2.5 px-4"><span className={`text-xs px-2 py-0.5 rounded-full font-bold ${u.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>{u.status}</span></td>
                  <td className="py-2.5 px-4 text-slate-500 text-xs">{u.joined}</td>
                  <td className="py-2.5 px-4 text-slate-500 text-xs">{u.lastActive}</td>
                  <td className="py-2.5 px-4 text-right"><button className="text-xs text-[#d4af37] hover:text-[#f0d878] font-medium">Manage</button></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
          <h3 className="text-sm font-bold text-[#d4af37] mb-4">Platform Analytics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[{ label: 'Page Views', value: '125K', color: 'text-[#d4af37]' }, { label: 'Avg Session', value: '8.5 min', color: 'text-emerald-400' }, { label: 'Bounce Rate', value: '32%', color: 'text-red-400' }, { label: 'New Signups', value: '+245', color: 'text-blue-400' }, { label: 'Data Requests', value: '2.1M', color: 'text-purple-400' }, { label: 'Alerts Sent', value: '15.2K', color: 'text-orange-400' }, { label: 'Charts Loaded', value: '89K', value2: 'text-[#d4af37]' }, { label: 'Scans Run', value: '45K', color: 'text-pink-400' }].map(s => (
              <div key={s.label} className="p-3 bg-[#121520] rounded-lg text-center">
                <div className="text-lg font-bold text-slate-200">{s.value}</div>
                <div className="text-[10px] text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
          <h3 className="text-sm font-bold text-[#d4af37] mb-4">Payment Overview</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 bg-[#121520] rounded-lg text-center"><div className="text-lg font-bold text-[#d4af37]">₹4.2L</div><div className="text-[10px] text-slate-600">Monthly Revenue</div></div>
            <div className="p-3 bg-[#121520] rounded-lg text-center"><div className="text-lg font-bold text-emerald-400">856</div><div className="text-[10px] text-slate-600">Paid Users</div></div>
            <div className="p-3 bg-[#121520] rounded-lg text-center"><div className="text-lg font-bold text-blue-400">₹489</div><div className="text-[10px] text-slate-600">Avg Order Value</div></div>
          </div>
          <div className="space-y-2">
            {[{ user: 'Rahul Sharma', amount: '₹1,499', plan: 'Premium', date: 'Today', status: 'Success' }, { user: 'Priya Patel', amount: '₹499', plan: 'Pro', date: 'Today', status: 'Success' }, { user: 'Amit Kumar', amount: '₹499', plan: 'Pro', date: 'Yesterday', status: 'Success' }, { user: 'Sneha Gupta', amount: '₹1,499', plan: 'Premium', date: '2 days ago', status: 'Failed' }].map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-[#121520] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#d4af37]/10 rounded-full flex items-center justify-center"><span className="text-xs font-bold text-[#d4af37]">{p.user[0]}</span></div>
                  <div><div className="text-sm font-bold text-slate-200">{p.user}</div><div className="text-[10px] text-slate-600">{p.plan} • {p.date}</div></div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-200">{p.amount}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.status === 'Success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
