import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, Plus, X, Crown, TrendingUp, Volume2, Target } from 'lucide-react';
import { getAlerts, type AlertItem } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newAlert, setNewAlert] = useState({ symbol: '', type: 'Price', condition: '' });

  const load = () => setAlerts(getAlerts());

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const addAlert = () => {
    if (newAlert.symbol && newAlert.condition) {
      setAlerts([{ id: Date.now().toString(), symbol: newAlert.symbol, type: newAlert.type, condition: newAlert.condition, triggered: false, time: 'Just now' }, ...alerts]);
      setNewAlert({ symbol: '', type: 'Price', condition: '' });
      setShowAdd(false);
    }
  };

  const removeAlert = (id: string) => setAlerts(alerts.filter(a => a.id !== id));

  const getIcon = (type: string) => {
    if (type.includes('Price')) return <Target className="w-4 h-4" />;
    if (type.includes('Volume')) return <Volume2 className="w-4 h-4" />;
    if (type.includes('OI')) return <TrendingUp className="w-4 h-4" />;
    return <Bell className="w-4 h-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2"><Crown className="w-5 h-5" />Alerts</h2>
          <p className="text-sm text-slate-600">Price, volume & breakout alerts</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-[#d4af37]/10 text-[#d4af37] rounded-lg border border-[#d4af37]/30 hover:bg-[#d4af37]/20 transition-colors text-sm font-medium"><Plus className="w-4 h-4" />New Alert</button>
      </div>

      {showAdd && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-3">
          <div className="flex gap-3">
            <input type="text" placeholder="Symbol" value={newAlert.symbol} onChange={e => setNewAlert({ ...newAlert, symbol: e.target.value })} className="flex-1 bg-[#121520] border border-[#1a1f2e] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#d4af37]" />
            <select value={newAlert.type} onChange={e => setNewAlert({ ...newAlert, type: e.target.value })} className="bg-[#121520] border border-[#1a1f2e] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#d4af37]">
              <option>Price</option><option>Volume</option><option>OI</option><option>Breakout</option>
            </select>
          </div>
          <input type="text" placeholder="Condition (e.g. Above 2500)" value={newAlert.condition} onChange={e => setNewAlert({ ...newAlert, condition: e.target.value })} className="w-full bg-[#121520] border border-[#1a1f2e] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#d4af37]" />
          <div className="flex gap-2">
            <button onClick={addAlert} className="px-4 py-2 bg-[#d4af37] text-[#0b0e17] font-bold rounded-lg text-sm hover:bg-[#b8941f] transition-colors">Create Alert</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-[#121520] text-slate-400 rounded-lg text-sm hover:text-slate-200 transition-colors">Cancel</button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {alerts.map((alert, idx) => (
          <motion.div key={alert.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
            className={`bg-[#0b0e17] border rounded-xl p-4 transition-all ${alert.triggered ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[#1a1f2e]'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${alert.triggered ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#121520] text-[#d4af37]'}`}>
                  {getIcon(alert.type)}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-200">{alert.symbol}</div>
                  <div className="text-xs text-slate-500">{alert.type} Alert</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {alert.triggered && <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-bold border border-emerald-500/20">Triggered</span>}
                <button onClick={() => removeAlert(alert.id)} className="p-1 text-slate-700 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="mt-3 p-2 bg-[#121520] rounded-lg">
              <div className="text-xs text-slate-500">Condition</div>
              <div className="text-sm font-medium text-slate-300">{alert.condition}</div>
            </div>
            <div className="mt-2 text-[10px] text-slate-600">{alert.time}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
