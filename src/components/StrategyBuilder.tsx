import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Crown, Info, Plus, RefreshCw, Target, Trash2, Wallet } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { calculateGreeks } from '../data/nseData';
import { STRATEGY_TEMPLATES } from '../data/marketData';
import StrategyTemplateGallery from './strategy/StrategyTemplateGallery';
import { getFuturesPrediction } from '../services/futuresPredictionService';
import { getChainPremium, getMarketSnapshot, getSymbolMeta } from '../services/optionSimulatorEngine';
import {
  analyzeLegStrategy,
  buildPayoffCurveFromLegs,
  buildSensibullScenarioTable,
  legTodayPnl,
  type PayoffLeg,
} from '../services/strategyPayoffCalc';
import { getFnoLiveQuotes, getLiveQuote, type LiveSymbolQuote } from '../services/symbolLiveService';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import StrategyPayoffTable from './strategy/StrategyPayoffTable';
import StrikePricePicker from './strategy/StrikePricePicker';
import SymbolMarketPicker from './strategy/SymbolMarketPicker';
import { queueStrategyForPaperTrading } from '../services/paperTradingBridge';

interface Leg {
  id: number;
  type: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  strike: number;
  premium: number;
  qty: number;
}

function fmtK(n: number) {
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

interface StrategyBuilderProps {
  onNavigate?: (tab: string) => void;
}

export default function StrategyBuilder({ onNavigate }: StrategyBuilderProps) {
  const [symbol, setSymbol] = useState('NIFTY');
  const [spotPrice, setSpotPrice] = useState(24580);
  const [simulatedSpot, setSimulatedSpot] = useState(24580);
  const [daysToExpiry, setDaysToExpiry] = useState(7);
  const [ivChange, setIvChange] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [tick, setTick] = useState(0);
  const [legs, setLegs] = useState<Leg[]>([]);

  const meta = useMemo(() => getSymbolMeta(symbol), [symbol, tick]);
  const liveQuote = useMemo(() => getLiveQuote(symbol), [symbol, tick]);

  const marketSnap = useMemo(() => getMarketSnapshot(symbol), [symbol, tick]);
  const chain = marketSnap.chain;
  const atmStrike = marketSnap.atmStrike;
  const strikeOptions = useMemo(() => chain.map((r) => r.strike).sort((a, b) => a - b), [chain]);
  const maxPain = marketSnap.maxPain.maxPainStrike;

  const futuresPred = useMemo(
    () => getFuturesPrediction(symbol, liveQuote, maxPain),
    [symbol, liveQuote, maxPain, tick],
  );

  const refreshLive = useCallback(() => {
    getFnoLiveQuotes();
    const quote = getLiveQuote(symbol);
    const snap = getMarketSnapshot(symbol);
    const nextSpot = quote?.price ?? snap.spot;
    setSpotPrice(nextSpot);
    setSimulatedSpot((prev) => (Math.abs(prev - nextSpot) < (quote?.strikeInterval ?? 50) * 0.5 ? nextSpot : prev));
    setTick((t) => t + 1);
  }, [symbol]);

  useAutoRefresh(refreshLive);

  useEffect(() => {
    if (spotPrice <= 0) return;
    const snap = getMarketSnapshot(symbol);
    const interval = getSymbolMeta(symbol).interval;
    const atm = Math.round(spotPrice / interval) * interval;
    const cePrem = getChainPremium(snap.chain, atm, 'CE') ?? 120;
    const pePrem = getChainPremium(snap.chain, atm - interval, 'PE') ?? 110;
    const lot = getSymbolMeta(symbol).lotSize;
    setLegs([
      { id: 1, type: 'CE', action: 'SELL', strike: atm, premium: cePrem, qty: lot },
      { id: 2, type: 'PE', action: 'SELL', strike: atm - interval, premium: pePrem, qty: lot },
    ]);
    setSelectedTemplate('');
  }, [symbol]);

  const handleSymbolSelect = (quote: LiveSymbolQuote) => {
    if (!quote?.symbol || quote.symbol === symbol) return;
    if (legs.length > 0) {
      const ok = window.confirm(
        `Switch from ${symbol} to ${quote.symbol}? ${legs.length} leg(s) will be cleared.`,
      );
      if (!ok) return;
    }
    setLegs([]);
    setSelectedTemplate('');
    setSymbol(quote.symbol);
    setSpotPrice(quote.price);
    setSimulatedSpot(quote.price);
  };

  const syncPremiumsFromChain = () => {
    setLegs((prev) =>
      prev.map((leg) => {
        const mkt = getChainPremium(chain, leg.strike, leg.type);
        return mkt != null ? { ...leg, premium: mkt } : leg;
      }),
    );
  };

  const addLeg = () => {
    const interval = meta.interval;
    const atm = Math.round(spotPrice / interval) * interval;
    const prem = getChainPremium(chain, atm, 'CE') ?? 100;
    setLegs((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: 'CE',
        action: 'BUY',
        strike: atm,
        premium: prem,
        qty: meta.lotSize,
      },
    ]);
  };

  const removeLeg = (id: number) => setLegs((prev) => prev.filter((leg) => leg.id !== id));

  const updateLeg = (id: number, field: keyof Leg, value: string | number) => {
    setLegs((prev) => prev.map((leg) => (leg.id === id ? { ...leg, [field]: value } : leg)));
  };

  const applyTemplate = (templateName: string) => {
    const template = STRATEGY_TEMPLATES.find((item) => item.name === templateName);
    if (!template) return;
    const interval = meta.interval;
    const atmStrike = Math.round(spotPrice / interval) * interval;
    setLegs(
      template.legs.map((leg, index) => {
        const strike = atmStrike + (leg.strikeOffset || 0) * interval;
        const prem = getChainPremium(chain, strike, leg.type) ?? 0;
        const legQty = (leg as { qty?: number }).qty ?? 1;
        return {
          id: Date.now() + index,
          type: leg.type,
          action: leg.action,
          strike,
          premium: prem,
          qty: legQty * meta.lotSize,
        };
      }),
    );
    setSelectedTemplate(templateName);
  };

  const payoffLegs: PayoffLeg[] = useMemo(
    () => legs.map((l) => ({ action: l.action, type: l.type, strike: l.strike, premium: l.premium, qty: l.qty })),
    [legs],
  );

  const baseIv = liveQuote?.iv ?? meta.ivBase;

  const payoffSummary = useMemo(
    () => analyzeLegStrategy(payoffLegs, spotPrice, meta.interval, daysToExpiry, baseIv, ivChange, futuresPred),
    [payoffLegs, spotPrice, meta.interval, daysToExpiry, baseIv, ivChange, futuresPred],
  );

  const scenarioRows = useMemo(
    () =>
      buildSensibullScenarioTable(
        payoffLegs,
        spotPrice,
        meta.interval,
        daysToExpiry,
        baseIv,
        ivChange,
        futuresPred,
        maxPain,
      ),
    [payoffLegs, spotPrice, meta.interval, daysToExpiry, baseIv, ivChange, futuresPred, maxPain],
  );

  const payoffData = useMemo(() => {
    const expiry = buildPayoffCurveFromLegs(payoffLegs, spotPrice, meta.interval, 20, 'expiry');
    const today = buildPayoffCurveFromLegs(payoffLegs, spotPrice, meta.interval, 20, 'today', daysToExpiry, baseIv, ivChange);
    return expiry.map((e, i) => ({
      price: e.spot,
      pnl: e.pnl,
      todayPnl: today[i]?.pnl ?? e.pnl,
    }));
  }, [payoffLegs, spotPrice, meta.interval, daysToExpiry, baseIv, ivChange]);

  const currentPnl = useMemo(
    () =>
      payoffLegs.reduce(
        (s, l) => s + legTodayPnl(l, simulatedSpot, daysToExpiry, baseIv * (1 + ivChange / 100)),
        0,
      ),
    [payoffLegs, simulatedSpot, daysToExpiry, baseIv, ivChange],
  );

  const { maxProfit, maxLoss, breakevens, netPremium, probabilityOfProfit } = payoffSummary;
  const estimatedMargin = Math.round(legs.reduce((sum, leg) => sum + leg.strike * leg.qty * (leg.action === 'SELL' ? 0.12 : 0.02), 0));

  const sendToPaperTrading = () => {
    if (legs.length < 1) {
      window.alert('Add at least one leg before paper trading.');
      return;
    }
    const strategyName = selectedTemplate || `${symbol} ${legs.length}-leg`;
    queueStrategyForPaperTrading({
      symbol,
      strategyName,
      spotPrice,
      createdAt: new Date().toISOString(),
      legs: legs.map((l) => ({
        action: l.action,
        type: l.type,
        strike: l.strike,
        premium: l.premium,
        qty: l.qty,
      })),
    });
    if (onNavigate) {
      onNavigate('papertrading');
    } else {
      window.alert('Strategy sent to Paper Trading. Open Paper Trading from the sidebar.');
    }
  };

  const strategyGreeks = useMemo(() => {
    const effectiveIv = baseIv * (1 + ivChange / 100);
    return legs.reduce(
      (acc, leg) => {
        const g = calculateGreeks(spotPrice, leg.strike, daysToExpiry, effectiveIv, leg.type, 0.065);
        const sign = leg.action === 'BUY' ? 1 : -1;
        const mult = sign * leg.qty;
        return {
          delta: acc.delta + g.delta * mult,
          gamma: acc.gamma + g.gamma * mult,
          theta: acc.theta + g.theta * mult,
          vega: acc.vega + g.vega * mult,
        };
      },
      { delta: 0, gamma: 0, theta: 0, vega: 0 },
    );
  }, [legs, spotPrice, daysToExpiry, baseIv, ivChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Strategy Builder
          </h2>
          <p className="text-sm text-slate-600">
            Sensibull-style — live data, futures prediction, profit/loss at every price
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SymbolMarketPicker selectedSymbol={symbol} onSelect={handleSymbolSelect} />
          <button
            type="button"
            onClick={syncPremiumsFromChain}
            className="flex items-center gap-1 px-3 py-2 bg-[#121520] border border-[#1a1f2e] rounded-lg text-xs text-[#d4af37] hover:border-[#d4af37]/50"
            title="Sync premiums from live option chain"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Live LTP
          </button>
          <div className="px-3 py-2 bg-[#121520] border border-[#1a1f2e] rounded-lg">
            <span className="text-[10px] text-slate-600 block">POP</span>
            <span className="text-sm font-bold text-emerald-400">{probabilityOfProfit.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <StrategyTemplateGallery
        selectedName={selectedTemplate}
        onSelect={(name) => applyTemplate(name)}
      />

      {liveQuote && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 bg-dark-surface border border-dark-border rounded-xl px-4 py-3">
          <span className="font-bold text-slate-200">{liveQuote.name}</span>
          <span className="font-bold text-white">{liveQuote.price.toLocaleString('en-IN')}</span>
          <span className={liveQuote.changePercent >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
            {liveQuote.changePercent >= 0 ? '+' : ''}
            {liveQuote.changePercent.toFixed(2)}%
          </span>
          <span>O {liveQuote.open.toLocaleString('en-IN')}</span>
          <span>H {liveQuote.high.toLocaleString('en-IN')}</span>
          <span>L {liveQuote.low.toLocaleString('en-IN')}</span>
          <span>Vol {fmtK(liveQuote.volume)}</span>
          <span>PCR {marketSnap.pcr.toFixed(2)}</span>
          <span>Max Pain {maxPain.toLocaleString('en-IN')}</span>
          <span>IV {liveQuote.iv}%</span>
          {futuresPred && (
            <>
              <span className="text-blue-300 font-bold">Fut {futuresPred.futuresPrice.toLocaleString('en-IN')}</span>
              <span className="text-violet-300">Predict → {futuresPred.predictedExpiryPrice.toLocaleString('en-IN')}</span>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-3 xl:sticky xl:top-18">
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[#d4af37]">Strategy Legs</h3>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={sendToPaperTrading}
                  disabled={legs.length < 1}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/15 text-emerald-400 text-xs rounded-lg border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors font-bold disabled:opacity-40"
                  title="Execute this strategy in Paper Trading"
                >
                  <Wallet className="w-3.5 h-3.5" /> Paper Trade
                </button>
                <button
                  type="button"
                  onClick={addLeg}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#d4af37]/10 text-[#d4af37] text-sm rounded-lg border border-[#d4af37]/30 hover:bg-[#d4af37]/20 transition-colors font-medium"
                >
                  <Plus className="w-4 h-4" /> Add Leg
                </button>
              </div>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
              {legs.map((leg, index) => (
                <div
                  key={leg.id}
                  className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e]/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#d4af37]/70">Leg {index + 1}</span>
                    <button onClick={() => removeLeg(leg.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={leg.action}
                      onChange={(event) => updateLeg(leg.id, 'action', event.target.value as Leg['action'])}
                      className={`text-sm rounded px-2 py-1 border font-medium ${leg.action === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                    <select
                      value={leg.type}
                      onChange={(event) => updateLeg(leg.id, 'type', event.target.value as Leg['type'])}
                      className={`text-sm rounded px-2 py-1 border font-medium ${leg.type === 'CE' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}
                    >
                      <option value="CE">CE</option>
                      <option value="PE">PE</option>
                    </select>
                    <StrikePricePicker
                      value={leg.strike}
                      strikes={strikeOptions}
                      atmStrike={atmStrike}
                      interval={meta.interval}
                      placeholder="Strike"
                      onChange={(strike) => {
                        updateLeg(leg.id, 'strike', strike);
                        const mkt = getChainPremium(chain, strike, leg.type);
                        if (mkt != null) updateLeg(leg.id, 'premium', mkt);
                      }}
                    />
                    <input
                      type="number"
                      value={leg.premium}
                      onChange={(event) => updateLeg(leg.id, 'premium', Number(event.target.value))}
                      className="bg-[#0b0e17] border border-[#1a1f2e] text-slate-200 text-sm rounded px-2 py-1"
                      placeholder="Premium (LTP)"
                    />
                    <input
                      type="number"
                      value={leg.qty}
                      onChange={(event) => updateLeg(leg.id, 'qty', Number(event.target.value))}
                      className="bg-[#0b0e17] border border-[#1a1f2e] text-slate-200 text-sm rounded px-2 py-1 col-span-2"
                      placeholder={`Qty (lot=${meta.lotSize})`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-bold text-[#d4af37]">Scenario Analysis</h3>
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-slate-500">Days to Expiry</span>
                <span className="text-[#d4af37] font-bold">{daysToExpiry} Days</span>
              </div>
              <input type="range" min="0" max="30" value={daysToExpiry} onChange={(event) => setDaysToExpiry(Number(event.target.value))} className="w-full accent-[#d4af37] h-1" />
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-slate-500">IV Change</span>
                <span className={ivChange >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{ivChange}%</span>
              </div>
              <input type="range" min="-50" max="50" value={ivChange} onChange={(event) => setIvChange(Number(event.target.value))} className="w-full accent-blue-500 h-1" />
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-slate-500">Simulated Spot</span>
                <span className="text-blue-400 font-bold">{simulatedSpot}</span>
              </div>
              <input
                type="range"
                min={spotPrice - meta.interval * 12}
                max={spotPrice + meta.interval * 12}
                value={simulatedSpot}
                onChange={(event) => setSimulatedSpot(Number(event.target.value))}
                className="w-full accent-blue-500 h-1"
              />
            </div>
          </div>

          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h3 className="text-sm font-bold text-[#d4af37] mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Net Premium</span>
                <span className={netPremium >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                  {netPremium >= 0 ? '+' : '-'}₹{Math.abs(netPremium).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Max Profit</span>
                <span className="text-emerald-400 font-bold">{maxProfit > 1e6 ? 'Unlimited' : `₹${maxProfit.toLocaleString()}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Max Loss</span>
                <span className="text-red-400 font-bold">{maxLoss < -1e6 ? 'Unlimited' : `₹${maxLoss.toLocaleString()}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Breakevens</span>
                <span className="text-slate-200 font-bold">{breakevens.map((v) => v.toLocaleString()).join(', ') || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Current P&L</span>
                <span className={`${currentPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold`}>
                  {currentPnl >= 0 ? '+' : ''}₹{currentPnl.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-3">
              <span className="text-[9px] text-slate-500 uppercase font-bold">Delta</span>
              <div className="text-lg font-bold text-slate-200">{strategyGreeks.delta.toFixed(2)}</div>
            </div>
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-3">
              <span className="text-[9px] text-slate-500 uppercase font-bold">Theta</span>
              <div className="text-lg font-bold text-red-400">{strategyGreeks.theta.toFixed(2)}</div>
            </div>
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-3">
              <span className="text-[9px] text-slate-500 uppercase font-bold">Vega</span>
              <div className="text-lg font-bold text-blue-400">{strategyGreeks.vega.toFixed(2)}</div>
            </div>
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-3">
              <span className="text-[9px] text-slate-500 uppercase font-bold">Gamma</span>
              <div className="text-lg font-bold text-purple-400">{strategyGreeks.gamma.toFixed(4)}</div>
            </div>
          </div>

          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#d4af37]">Payoff Diagram</h3>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-[#d4af37] rounded-full" />
                  <span className="text-slate-400">@ Expiry</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-violet-400 rounded-full" />
                  <span className="text-slate-400">Today</span>
                </div>
                {futuresPred && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full" />
                    <span className="text-slate-400">Futures {futuresPred.futuresPrice}</span>
                  </div>
                )}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={payoffData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                <XAxis dataKey="price" stroke="#475569" fontSize={11} tickLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value, name) => [`₹${(value as number).toLocaleString()}`, name === 'pnl' ? 'Expiry' : 'Today']}
                />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                <ReferenceLine x={spotPrice} stroke="#d4af37" strokeDasharray="5 5" label={{ value: 'Spot', fill: '#d4af37', fontSize: 10 }} />
                {futuresPred && (
                  <ReferenceLine
                    x={futuresPred.predictedExpiryPrice}
                    stroke="#818cf8"
                    strokeDasharray="4 4"
                    label={{ value: 'Fut Predict', fill: '#818cf8', fontSize: 9 }}
                  />
                )}
                <ReferenceLine x={maxPain} stroke="#fb923c" strokeDasharray="4 4" label={{ value: 'MaxPain', fill: '#fb923c', fontSize: 9 }} />
                <Area type="monotone" dataKey="pnl" fill="#d4af37" fillOpacity={0.06} stroke="none" />
                <Line type="monotone" dataKey="pnl" stroke="#d4af37" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="todayPnl" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Strategy Insights
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">POP @ Expiry</span>
                  <span className="text-emerald-400 font-bold">{probabilityOfProfit.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Futures Bias</span>
                  <span className="text-slate-200 font-bold">{futuresPred?.bias ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">OI Signal</span>
                  <span className="text-violet-300 font-bold text-xs">{futuresPred?.signal ?? '—'}</span>
                </div>
              </div>
            </div>
            <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-2">
                <Target className="w-3.5 h-3.5" />
                Margin
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Est. Margin</span>
                  <span className="text-[#d4af37] font-bold">₹{estimatedMargin.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Net Setup</span>
                  <span className={`font-bold ${netPremium >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {netPremium >= 0 ? 'Credit' : 'Debit'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Leg-wise @ Simulated Spot
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {legs.map((leg, index) => {
                const legPnl = legTodayPnl(
                  { action: leg.action, type: leg.type, strike: leg.strike, premium: leg.premium, qty: leg.qty },
                  simulatedSpot,
                  daysToExpiry,
                  baseIv * (1 + ivChange / 100),
                );
                return (
                  <div key={leg.id} className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-slate-500 font-bold">LEG {index + 1}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${leg.action === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {leg.action}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-200">
                      {leg.strike} {leg.type}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      LTP ₹{leg.premium} × {leg.qty}
                    </div>
                    <div className={`text-sm font-bold mt-2 ${legPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {legPnl >= 0 ? '+' : ''}₹{legPnl.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sensibull-style BOTTOM full-width payoff list */}
      <StrategyPayoffTable
        rows={scenarioRows}
        summary={payoffSummary}
        spot={spotPrice}
        daysToExpiry={daysToExpiry}
        symbol={symbol}
        lastUpdated={liveQuote?.lastUpdated}
      />
    </div>
  );
}
