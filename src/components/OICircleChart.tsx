import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getIndices, getOptionChain } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function OICircleChart() {
  const [data, setData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [totalOI, setTotalOI] = useState(0);

  const update = () => {
    const spot = getIndices().find((i) => i.symbol === 'NIFTY')?.price ?? 24580;
    const chain = getOptionChain('NIFTY', spot);
    const ceTotal = chain.reduce((sum, s) => sum + s.ceOi, 0);
    const peTotal = chain.reduce((sum, s) => sum + s.peOi, 0);
    const atmData = chain.slice(8, 13);
    const atmCE = atmData.reduce((sum, s) => sum + s.ceOi, 0);
    const atmPE = atmData.reduce((sum, s) => sum + s.peOi, 0);
    const otmCE = ceTotal - atmCE;
    const otmPE = peTotal - atmPE;

    setTotalOI(ceTotal + peTotal);
    setData([
      { name: 'ATM Calls', value: atmCE, color: '#ef4444' },
      { name: 'OTM Calls', value: otmCE, color: '#f87171' },
      { name: 'ATM Puts', value: atmPE, color: '#10b981' },
      { name: 'OTM Puts', value: otmPE, color: '#34d399' },
    ]);
  };

  useEffect(() => {
    update();
  }, []);

  useAutoRefresh(update);

  const pcr = data.length >= 4 ? (data[2].value + data[3].value) / (data[0].value + data[1].value) : 1;

  return (
    <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
      <h3 className="text-sm font-bold text-[#d4af37] mb-3">OI Distribution</h3>
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
              {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} formatter={(value) => [`${((value as number) / 100000).toFixed(2)}L`, 'OI']} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-[10px] text-slate-600">Total OI</div>
          <div className="text-lg font-bold text-[#d4af37]">{(totalOI / 10000000).toFixed(1)}Cr</div>
          <div className={`text-[10px] font-bold ${pcr > 1 ? 'text-emerald-400' : 'text-red-400'}`}>PCR {pcr.toFixed(2)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {data.map(item => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <div className="flex-1">
              <div className="text-[10px] text-slate-600">{item.name}</div>
              <div className="text-xs font-bold text-slate-300">{(item.value / 100000).toFixed(1)}L</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
