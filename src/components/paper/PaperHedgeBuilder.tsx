import { Layers, Trash2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { JournalSymbolSelection } from '../../services/equitySymbolService';
import {
  buildLegsFromPreset,
  HEDGE_PRESETS,
  marginForLeg,
  type PaperLeg,
  type PaperStrategyGroup,
} from '../../services/paperTradingEngine';
import {
  createManualLeg,
  EXPIRY_DATES,
  getChainPremium,
  getMarketSnapshot,
  getSymbolMeta,
} from '../../services/optionSimulatorEngine';
import JournalSymbolPicker from '../journal/JournalSymbolPicker';

interface PaperHedgeBuilderProps {
  availableBalance: number;
  onExecute: (group: PaperStrategyGroup) => { ok: boolean; message: string };
}

export default function PaperHedgeBuilder({ availableBalance, onExecute }: PaperHedgeBuilderProps) {
  const [underlying, setUnderlying] = useState<JournalSymbolSelection | null>(null);
  const [strategyName, setStrategyName] = useState('Custom Hedge');
  const [lots, setLots] = useState(1);
  const [legs, setLegs] = useState<PaperLeg[]>([]);
  const [notes, setNotes] = useState('');

  const spot = underlying?.price ?? 0;
  const meta = underlying ? getSymbolMeta(underlying.symbol) : null;

  const totalMargin = useMemo(() => legs.reduce((s, l) => s + marginForLeg(l), 0), [legs]);

  const applyPreset = (presetId: string) => {
    if (!underlying) return;
    const built = buildLegsFromPreset(presetId, underlying, lots);
    const preset = HEDGE_PRESETS.find((p) => p.id === presetId);
    if (preset) setStrategyName(preset.label);
    setLegs(built);
  };

  const addManualOptionLeg = (type: 'CE' | 'PE', action: 'BUY' | 'SELL') => {
    if (!underlying || !meta) return;
    const snap = getMarketSnapshot(underlying.symbol);
    const atm = Math.round(spot / meta.interval) * meta.interval;
    const prem = getChainPremium(snap.chain, atm, type) ?? 50;
    const sim = createManualLeg({
      symbol: underlying.symbol,
      type,
      action,
      strike: atm,
      premium: prem,
      quantity: lots,
      expiry: EXPIRY_DATES[0],
    });
    setLegs((prev) => [
      ...prev,
      {
        id: sim.id,
        instrumentType: type,
        symbol: underlying.symbol,
        displayName: `${underlying.symbol} ${atm}${type}`,
        action,
        strike: atm,
        expiry: sim.expiry,
        quantity: lots,
        lotSize: meta.lotSize,
        avgPrice: prem,
        exchange: underlying.exchange,
      },
    ]);
  };

  const addEquityLeg = (action: 'BUY' | 'SELL') => {
    if (!underlying) return;
    const qty = underlying.isFno ? lots * underlying.lotSize : Math.max(1, Math.floor(10000 / Math.max(spot, 1)));
    setLegs((prev) => [
      ...prev,
      {
        id: `eq-${Date.now()}`,
        instrumentType: 'EQUITY',
        symbol: underlying.symbol,
        displayName: underlying.name,
        action,
        quantity: qty,
        lotSize: 1,
        avgPrice: spot,
        exchange: underlying.exchange,
      },
    ]);
  };

  const updateLeg = (id: string, patch: Partial<PaperLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLeg = (id: string) => {
    setLegs((prev) => prev.filter((l) => l.id !== id));
  };

  const handleExecute = () => {
    if (!underlying || legs.length < 2) return;
    const group: PaperStrategyGroup = {
      id: `grp-${Date.now()}`,
      name: strategyName.trim() || 'Hedge Strategy',
      underlying: underlying.symbol,
      legs,
      openedAt: new Date().toISOString(),
      status: 'OPEN',
      notes: notes.trim() || undefined,
    };
    const res = onExecute(group);
    if (res.ok) {
      setLegs([]);
      setNotes('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#d4af37]" />
            Hedging — Multi-Leg Paper Trade
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            All indices · NSE/BSE stocks · F&O options — place basket as one strategy
          </p>
        </div>
        <div className="w-full sm:w-auto min-w-[240px]">
          <JournalSymbolPicker
            selectedSymbol={underlying?.symbol ?? ''}
            onSelect={(sel) => {
              setUnderlying(sel);
              setLegs([]);
            }}
          />
        </div>
      </div>

      {underlying && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Quick presets</span>
            {HEDGE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className="px-2 py-1 text-[10px] font-bold rounded-lg border border-[#1a1f2e] text-slate-300 hover:border-[#d4af37]/40 hover:text-[#d4af37]"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold">Strategy name</label>
              <input
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                className="mt-1 w-full bg-[#121520] border border-[#1a1f2e] rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold">Lots (F&O)</label>
              <input
                type="number"
                min={1}
                value={lots}
                onChange={(e) => setLots(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full bg-[#121520] border border-[#1a1f2e] rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-slate-500 uppercase font-bold">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Hedge rationale, risk, exit plan..."
                className="mt-1 w-full bg-[#121520] border border-[#1a1f2e] rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addEquityLeg('BUY')} className="px-2 py-1 text-[10px] font-bold rounded border border-emerald-500/30 text-emerald-400">
              + Buy Stock
            </button>
            <button type="button" onClick={() => addEquityLeg('SELL')} className="px-2 py-1 text-[10px] font-bold rounded border border-red-500/30 text-red-400">
              + Sell Stock
            </button>
            <button type="button" onClick={() => addManualOptionLeg('CE', 'BUY')} className="px-2 py-1 text-[10px] font-bold rounded border border-[#1a1f2e] text-slate-300">
              + Buy CE
            </button>
            <button type="button" onClick={() => addManualOptionLeg('CE', 'SELL')} className="px-2 py-1 text-[10px] font-bold rounded border border-[#1a1f2e] text-slate-300">
              + Sell CE
            </button>
            <button type="button" onClick={() => addManualOptionLeg('PE', 'BUY')} className="px-2 py-1 text-[10px] font-bold rounded border border-[#1a1f2e] text-slate-300">
              + Buy PE
            </button>
            <button type="button" onClick={() => addManualOptionLeg('PE', 'SELL')} className="px-2 py-1 text-[10px] font-bold rounded border border-[#1a1f2e] text-slate-300">
              + Sell PE
            </button>
          </div>

          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#121520] text-slate-500 text-[10px] uppercase">
                  <th className="py-2 px-3 text-left">Leg</th>
                  <th className="py-2 px-3 text-left">Type</th>
                  <th className="py-2 px-3 text-left">Side</th>
                  <th className="py-2 px-3 text-right">Qty</th>
                  <th className="py-2 px-3 text-right">Price</th>
                  <th className="py-2 px-3 text-center">Del</th>
                </tr>
              </thead>
              <tbody>
                {legs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-600 text-xs">
                      Pick a preset or add legs manually (min 2 for hedge)
                    </td>
                  </tr>
                ) : (
                  legs.map((leg) => (
                    <tr key={leg.id} className="border-t border-[#1a1f2e]/50">
                      <td className="py-2 px-3 font-bold text-white text-xs">{leg.displayName}</td>
                      <td className="py-2 px-3 text-slate-400 text-xs">{leg.instrumentType}</td>
                      <td className="py-2 px-3">
                        <select
                          value={leg.action}
                          onChange={(e) => updateLeg(leg.id, { action: e.target.value as 'BUY' | 'SELL' })}
                          className="bg-[#121520] border border-[#1a1f2e] text-xs rounded px-1 py-0.5 text-white"
                        >
                          <option value="BUY">BUY</option>
                          <option value="SELL">SELL</option>
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min={1}
                          value={leg.quantity}
                          onChange={(e) => updateLeg(leg.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-16 bg-[#121520] border border-[#1a1f2e] text-xs rounded px-1 py-0.5 text-white font-mono text-right"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min={0.05}
                          step={0.05}
                          value={leg.avgPrice}
                          onChange={(e) => updateLeg(leg.id, { avgPrice: Math.max(0.05, Number(e.target.value) || 0) })}
                          className="w-20 bg-[#121520] border border-[#1a1f2e] text-xs rounded px-1 py-0.5 text-white font-mono text-right"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button type="button" onClick={() => removeLeg(leg.id)} className="text-slate-500 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#121520] rounded-xl p-4 border border-[#1a1f2e]">
            <div className="text-sm">
              <span className="text-slate-500">Required margin </span>
              <span className="font-bold text-white font-mono">₹{totalMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              <span className="text-slate-500 ml-3">Available </span>
              <span className={`font-bold font-mono ${totalMargin <= availableBalance ? 'text-emerald-400' : 'text-red-400'}`}>
                ₹{availableBalance.toLocaleString()}
              </span>
            </div>
            <button
              type="button"
              disabled={legs.length < 2 || totalMargin > availableBalance}
              onClick={handleExecute}
              className="px-5 py-2.5 rounded-lg bg-[#d4af37] text-[#0a0f1a] font-bold text-sm flex items-center gap-2 disabled:opacity-40 hover:opacity-90"
            >
              <Zap className="w-4 h-4" />
              Execute {legs.length} Legs
            </button>
          </div>
        </>
      )}

      {!underlying && (
        <div className="py-12 text-center text-slate-500 text-sm border border-dashed border-[#1a1f2e] rounded-xl">
          Select underlying from NSE / BSE / Indices / F&O above
        </div>
      )}
    </div>
  );
}
