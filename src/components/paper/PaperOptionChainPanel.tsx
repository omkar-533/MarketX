import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { buildOptionChain, buildOptionExpiries, type EnhancedOptionRow } from '../../services/optionChainEngine';
import { getSymbolMeta } from '../../services/optionSimulatorEngine';

type ChainFilter = 'ALL' | 'ITM' | 'ATM' | 'OTM';
type StrikeWindow = 11 | 21 | 31;

function fmtK(n: number) {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(0)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function moneynessTag(
  strike: number,
  spot: number,
  atm: number,
  leg: 'CE' | 'PE',
): 'ATM' | 'ITM' | 'OTM' | null {
  if (strike === atm) return 'ATM';
  if (leg === 'CE') return strike < spot ? 'ITM' : 'OTM';
  return strike > spot ? 'ITM' : 'OTM';
}

interface PaperOptionChainPanelProps {
  symbol: string;
  spot: number;
  expiry: string;
  orderSide: 'BUY' | 'SELL';
  selectedStrike: number;
  selectedType: 'CE' | 'PE';
  onExpiryChange: (expiry: string) => void;
  onSelectLeg: (strike: number, type: 'CE' | 'PE', premium: number) => void;
}

export default function PaperOptionChainPanel({
  symbol,
  spot,
  expiry,
  orderSide,
  selectedStrike,
  selectedType,
  onExpiryChange,
  onSelectLeg,
}: PaperOptionChainPanelProps) {
  const [chainFilter, setChainFilter] = useState<ChainFilter>('ALL');
  const [windowSize, setWindowSize] = useState<StrikeWindow>(21);
  const atmRowRef = useRef<HTMLTableRowElement>(null);

  const meta = useMemo(() => getSymbolMeta(symbol), [symbol]);
  const expiries = useMemo(() => buildOptionExpiries(8), []);

  const chain = useMemo(
    () => buildOptionChain(symbol, spot, expiry, windowSize),
    [symbol, spot, expiry, windowSize],
  );

  const atmStrike = useMemo(() => {
    const interval = meta.interval;
    return Math.round(spot / interval) * interval;
  }, [spot, meta.interval]);

  const filtered = useMemo(() => {
    if (chainFilter === 'ATM') return chain.filter((r) => r.strike === atmStrike);
    if (chainFilter === 'ITM') {
      return chain.filter((r) => r.strike < spot || r.strike === atmStrike);
    }
    if (chainFilter === 'OTM') {
      return chain.filter((r) => r.strike > spot || r.strike === atmStrike);
    }
    return chain;
  }, [chain, chainFilter, spot, atmStrike]);

  const maxCeOi = useMemo(() => Math.max(...chain.map((r) => r.ceOi), 1), [chain]);
  const maxPeOi = useMemo(() => Math.max(...chain.map((r) => r.peOi), 1), [chain]);

  useEffect(() => {
    if (chainFilter === 'ALL' && atmRowRef.current) {
      atmRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [chainFilter, atmStrike, filtered.length]);

  const pickLeg = (row: EnhancedOptionRow, type: 'CE' | 'PE') => {
    const prem = type === 'CE' ? row.ceLtp : row.peLtp;
    onSelectLeg(row.strike, type, prem);
  };

  return (
    <div className="rounded-xl border border-indigo-500/25 bg-[#0a0f1a]/80 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#1a1f2e] bg-[#121520]">
        <span className="text-[10px] font-bold text-indigo-300 uppercase">Option chain</span>
        <select
          value={expiry}
          onChange={(e) => onExpiryChange(e.target.value)}
          className="bg-[#0b0e17] border border-[#1a1f2e] text-white text-[10px] rounded px-2 py-1"
        >
          {expiries.map((ex) => (
            <option key={ex} value={ex}>
              {ex}
            </option>
          ))}
        </select>
        <div className="flex gap-0.5">
          {([11, 21, 31] as StrikeWindow[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowSize(w)}
              className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                windowSize === w ? 'bg-indigo-500/30 text-indigo-200' : 'text-slate-500'
              }`}
            >
              ±{Math.floor(w / 2)}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 ml-auto">
          {(['ALL', 'ITM', 'ATM', 'OTM'] as ChainFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setChainFilter(f)}
              className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                chainFilter === f ? 'bg-[#d4af37] text-[#0a0f1a]' : 'bg-[#1a1f2e] text-slate-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-1.5 flex flex-wrap gap-3 text-[10px] border-b border-[#1a1f2e]/80 bg-[#0b0e17]/50">
        <span>
          Spot <b className="text-white">{spot.toLocaleString('en-IN')}</b>
        </span>
        <span>
          ATM <b className="text-[#d4af37]">{atmStrike}</b>
        </span>
        <span className="text-slate-500">Click CE/PE LTP to select · Order: {orderSide}</span>
      </div>

      <div className="max-h-[min(42vh,360px)] overflow-auto">
        <table className="w-full text-[11px] border-collapse min-w-[640px]">
          <thead className="sticky top-0 z-10 bg-[#121520]">
            <tr className="text-[9px] uppercase text-slate-500">
              <th colSpan={4} className="py-1.5 text-right text-red-300/90 border-b border-[#1a1f2e]">
                CALLS
              </th>
              <th className="py-1.5 text-center text-[#d4af37] border-b border-x border-[#1a1f2e]">Strike</th>
              <th colSpan={4} className="py-1.5 text-left text-emerald-300/90 border-b border-[#1a1f2e]">
                PUTS
              </th>
            </tr>
            <tr className="text-[9px] uppercase text-slate-600">
              <th className="py-1 pr-1 text-right">OI</th>
              <th className="py-1 text-right">Bid</th>
              <th className="py-1 text-right">Ask</th>
              <th className="py-1 text-right text-red-300">LTP</th>
              <th className="py-1 text-center border-x border-[#1a1f2e]/80">Tag</th>
              <th className="py-1 pl-1 text-left text-emerald-300">LTP</th>
              <th className="py-1 text-left">Bid</th>
              <th className="py-1 text-left">Ask</th>
              <th className="py-1 text-left">OI</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isAtm = row.strike === atmStrike;
              const ceSel = selectedStrike === row.strike && selectedType === 'CE';
              const peSel = selectedStrike === row.strike && selectedType === 'PE';
              const ceTag = moneynessTag(row.strike, spot, atmStrike, 'CE');
              const showSpotBand = spot > row.strike && (filtered[filtered.indexOf(row) + 1]?.strike ?? Infinity) > spot;

              return (
                <Fragment key={row.strike}>
                  <tr
                    ref={isAtm ? atmRowRef : undefined}
                    className={`border-b border-[#1a1f2e]/40 ${isAtm ? 'bg-[#d4af37]/8' : 'hover:bg-[#121520]/80'}`}
                  >
                    <td
                      className="py-1 pr-1 text-right text-slate-500 relative"
                      style={{ backgroundColor: `rgba(239,68,68,${(row.ceOi / maxCeOi) * 0.12})` }}
                    >
                      {fmtK(row.ceOi)}
                    </td>
                    <td className="py-1 text-right text-slate-500 tabular-nums">{row.ceBid.toFixed(1)}</td>
                    <td className="py-1 text-right text-slate-500 tabular-nums">{row.ceAsk.toFixed(1)}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => pickLeg(row, 'CE')}
                        className={`tabular-nums font-bold px-1.5 py-0.5 rounded ${
                          ceSel
                            ? 'bg-red-500/30 text-red-200 ring-1 ring-red-400'
                            : 'text-red-300 hover:bg-red-500/15'
                        }`}
                      >
                        {row.ceLtp.toFixed(2)}
                      </button>
                    </td>
                    <td
                      className={`py-1 text-center font-black border-x border-[#1a1f2e]/60 ${
                        isAtm ? 'text-[#d4af37] bg-[#d4af37]/10' : 'text-slate-100'
                      }`}
                    >
                      <div>{row.strike}</div>
                      {isAtm && <div className="text-[8px] text-[#d4af37]">ATM</div>}
                      {!isAtm && ceTag && (
                        <div className={`text-[7px] ${ceTag === 'ITM' ? 'text-blue-400' : 'text-orange-400'}`}>
                          {ceTag}
                        </div>
                      )}
                    </td>
                    <td className="py-1 pl-1 text-left">
                      <button
                        type="button"
                        onClick={() => pickLeg(row, 'PE')}
                        className={`tabular-nums font-bold px-1.5 py-0.5 rounded ${
                          peSel
                            ? 'bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400'
                            : 'text-emerald-300 hover:bg-emerald-500/15'
                        }`}
                      >
                        {row.peLtp.toFixed(2)}
                      </button>
                    </td>
                    <td className="py-1 text-left text-slate-500 tabular-nums">{row.peBid.toFixed(1)}</td>
                    <td className="py-1 text-left text-slate-500 tabular-nums">{row.peAsk.toFixed(1)}</td>
                    <td
                      className="py-1 pl-1 text-left text-slate-500 relative"
                      style={{ backgroundColor: `rgba(16,185,129,${(row.peOi / maxPeOi) * 0.12})` }}
                    >
                      {fmtK(row.peOi)}
                    </td>
                  </tr>
                  {showSpotBand && (
                    <tr key={`spot-${row.strike}`} className="bg-blue-500/10">
                      <td colSpan={9} className="py-0.5 text-center text-[9px] text-blue-300 font-bold">
                        ▲ Spot {spot.toLocaleString('en-IN')} ▲
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 text-[10px] text-slate-400 border-t border-[#1a1f2e] flex flex-wrap gap-2">
        <span className="text-red-300">CE ITM</span> = strike &lt; spot
        <span className="text-emerald-300">PE ITM</span> = strike &gt; spot
        <span className="text-[#d4af37]">ATM</span> = nearest strike
      </div>
    </div>
  );
}
