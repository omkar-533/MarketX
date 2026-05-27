import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import {
  canTradeFno,
  defaultOrderDraft,
  effectiveOrderPrice,
  instrumentFromDraft,
  orderFillsImmediately,
  orderTypeLabel,
  segmentLabel,
  totalEntryCostForOrder,
  type MarketItem,
  type PaperOrderDraft,
  type PaperSegment,
  type Product,
  type OrderType,
  type Side,
} from '../../services/paperTradingEngine';
import { getMarketSnapshot, getSymbolMeta } from '../../services/optionSimulatorEngine';
import PaperOptionChainPanel from './PaperOptionChainPanel';

interface PaperOrderModalProps {
  open: boolean;
  symbol: MarketItem;
  side: Side;
  spot: number;
  available: number;
  draft: PaperOrderDraft;
  onDraftChange: (draft: PaperOrderDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function createInitialDraft(item: MarketItem, side: Side): PaperOrderDraft {
  return defaultOrderDraft(item, side);
}

export default function PaperOrderModal({
  open,
  symbol,
  side,
  spot,
  available,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
}: PaperOrderModalProps) {
  const fnoEnabled = canTradeFno(symbol);
  const snap = useMemo(() => getMarketSnapshot(symbol.symbol), [symbol.symbol, spot]);
  const meta = useMemo(() => getSymbolMeta(symbol.symbol), [symbol.symbol]);

  const effectivePrice = effectiveOrderPrice(draft, symbol, spot);
  const { margin: marginRequired, charges, total: totalEntryCost } = totalEntryCostForOrder(
    draft,
    symbol,
    effectivePrice,
  );
  const fillsNow = orderFillsImmediately(draft.orderType);
  const instrument = instrumentFromDraft(draft);
  const isOptions = draft.segment === 'OPTIONS';
  const isSl = draft.orderType === 'SL' || draft.orderType === 'SL-M';
  const isTarget = draft.orderType === 'TARGET';
  const isLimit = draft.orderType === 'LIMIT';

  const priceFieldLabel =
    draft.orderType === 'MARKET'
      ? 'Ref. price'
      : isTarget
        ? 'Target price'
        : isSl
          ? 'Limit price (after trigger)'
          : 'Limit price';

  const orderHint =
    draft.orderType === 'MARKET'
      ? 'Executes immediately at live price.'
      : isLimit
        ? draft.side === 'BUY'
          ? 'Buys when LTP ≤ your limit.'
          : 'Sells when LTP ≥ your limit.'
        : isTarget
          ? draft.side === 'SELL'
            ? 'Take profit: sells when LTP ≥ target.'
            : 'Covers short when LTP ≤ target.'
          : draft.orderType === 'SL-M'
            ? draft.side === 'BUY'
              ? 'Stop: market buy when LTP ≥ trigger.'
              : 'Stop: market sell when LTP ≤ trigger.'
            : draft.side === 'BUY'
              ? 'Stop-limit: after LTP ≥ trigger, buys at limit.'
              : 'Stop-limit: after LTP ≤ trigger, sells at limit.';

  if (!open) return null;

  const setSegment = (segment: PaperSegment) => {
    const next = { ...draft, segment };
    if (segment === 'OPTIONS') {
      const prem =
        snap.chain.find((r) => r.strike === draft.strike)?.ceLtp ??
        snap.chain.find((r) => r.strike === snap.atmStrike)?.ceLtp ??
        100;
      const row = snap.chain.find((r) => r.strike === (draft.strike || snap.atmStrike));
      const p = draft.optionType === 'PE' ? row?.peLtp : row?.ceLtp;
      onDraftChange({ ...next, price: p ?? prem, product: 'MIS', strike: draft.strike || snap.atmStrike });
    } else if (segment === 'FUTURES') {
      onDraftChange({ ...next, price: spot, product: 'MIS' });
    } else {
      onDraftChange({ ...next, price: spot });
    }
  };

  const qtyLabel =
    draft.segment === 'EQUITY' ? 'Quantity (shares)' : `Lots (lot size ${symbol.lotSize || meta.lotSize})`;

  const slDisabled = draft.segment === 'OPTIONS';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div
        className={`bg-[#0b0e17] border border-[#1a1f2e] rounded-2xl w-full shadow-2xl overflow-hidden max-h-[94vh] overflow-y-auto ${
          isOptions ? 'max-w-4xl' : 'max-w-lg'
        }`}
      >
        <div
          className={`px-6 py-4 border-b border-[#1a1f2e] flex items-center justify-between sticky top-0 z-20 bg-[#0b0e17] ${side === 'BUY' ? 'border-emerald-500/20' : 'border-red-500/20'}`}
        >
          <div>
            <h3 className={`text-lg font-bold ${side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
              {side} {symbol.symbol} · {segmentLabel(draft.segment)}
            </h3>
            <p className="text-xs text-slate-500">
              Spot ₹{spot.toLocaleString('en-IN')} · {instrument}
              {fnoEnabled ? ` · F&O lot ${symbol.lotSize || meta.lotSize}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {fnoEnabled && (
            <div>
              <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Segment</label>
              <div className="flex gap-1 p-0.5 rounded-lg bg-[#121520] border border-[#1a1f2e]">
                {(['EQUITY', 'FUTURES', 'OPTIONS'] as PaperSegment[]).map((seg) => (
                  <button
                    key={seg}
                    type="button"
                    onClick={() => setSegment(seg)}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-md ${
                      draft.segment === seg ? 'bg-[#d4af37] text-[#0a0f1a]' : 'text-slate-500'
                    }`}
                  >
                    {seg === 'EQUITY' ? 'Cash' : seg === 'FUTURES' ? 'Futures' : 'Options'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isOptions && (
            <PaperOptionChainPanel
              symbol={symbol.symbol}
              spot={spot}
              expiry={draft.expiry}
              orderSide={side}
              selectedStrike={draft.strike}
              selectedType={draft.optionType}
              onExpiryChange={(expiry) => onDraftChange({ ...draft, expiry })}
              onSelectLeg={(strike, type, premium) =>
                onDraftChange({
                  ...draft,
                  strike,
                  optionType: type,
                  price: premium,
                  orderType: draft.orderType === 'MARKET' ? 'MARKET' : draft.orderType,
                })
              }
            />
          )}

          {isOptions && (
            <div className="flex flex-wrap items-center gap-2 text-xs bg-[#121520] rounded-lg px-3 py-2 border border-[#1a1f2e]">
              <span className="text-slate-500">Selected:</span>
              <span className="font-bold text-white">
                {draft.strike}
                {draft.optionType}
              </span>
              <span className="text-slate-500">@</span>
              <span className="font-mono text-[#d4af37]">₹{draft.price.toFixed(2)}</span>
              <span className={`font-bold ${side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>{side}</span>
            </div>
          )}

          <div className={`grid gap-4 ${isOptions ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>
            {draft.segment === 'EQUITY' && (
              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Product</label>
                <div className="flex bg-[#121520] rounded-lg p-1 border border-[#1a1f2e]">
                  {(['MIS', 'CNC'] as Product[]).map((product) => (
                    <button
                      key={product}
                      type="button"
                      onClick={() => onDraftChange({ ...draft, product })}
                      className={`flex-1 py-1.5 text-xs font-bold rounded ${draft.product === product ? 'bg-[#1a1f2e] text-white' : 'text-slate-500'}`}
                    >
                      {product}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={draft.segment === 'EQUITY' && !isOptions ? '' : isOptions ? '' : 'col-span-2'}>
              <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Order Type</label>
              <select
                value={draft.orderType}
                onChange={(e) => onDraftChange({ ...draft, orderType: e.target.value as OrderType })}
                className="w-full bg-[#121520] border border-[#1a1f2e] text-white text-xs rounded-lg px-3 py-2"
              >
                <option value="MARKET">Market — instant</option>
                <option value="LIMIT">Limit</option>
                <option value="TARGET">Target (take profit)</option>
                <option value="SL" disabled={slDisabled}>
                  SL (stop-limit) {slDisabled ? '(cash/F&O fut only)' : ''}
                </option>
                <option value="SL-M" disabled={slDisabled}>
                  SL-M (stop market) {slDisabled ? '(cash/F&O fut only)' : ''}
                </option>
              </select>
              <p className="mt-1 text-[10px] text-slate-500">{orderHint}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">{qtyLabel}</label>
              <input
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(e) => onDraftChange({ ...draft, quantity: Math.max(1, Number(e.target.value) || 1) })}
                className="w-full bg-[#121520] border border-[#1a1f2e] text-white text-sm rounded-lg px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">
                {isOptions ? 'Premium (₹)' : priceFieldLabel}
              </label>
              <input
                type="number"
                min={0.05}
                step={0.05}
                disabled={draft.orderType === 'MARKET'}
                value={draft.orderType === 'MARKET' ? effectivePrice : draft.price}
                onChange={(e) => onDraftChange({ ...draft, price: Number(e.target.value) || 0 })}
                className="w-full bg-[#121520] border border-[#1a1f2e] text-white text-sm rounded-lg px-3 py-2 font-mono disabled:opacity-60"
              />
            </div>
          </div>

          {isSl && !slDisabled && (
            <div>
              <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Trigger price</label>
              <input
                type="number"
                value={draft.triggerPrice}
                onChange={(e) => onDraftChange({ ...draft, triggerPrice: Number(e.target.value) || 0 })}
                className="w-full bg-[#121520] border border-[#1a1f2e] text-white text-sm rounded-lg px-3 py-2 font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Notes</label>
            <input
              type="text"
              value={draft.notes}
              onChange={(e) => onDraftChange({ ...draft, notes: e.target.value })}
              placeholder="Setup, hedge, exit plan..."
              className="w-full bg-[#121520] border border-[#1a1f2e] text-white text-sm rounded-lg px-3 py-2"
            />
          </div>

          <div className="bg-[#121520] rounded-lg p-3 border border-[#1a1f2e] space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Turnover</span>
              <span className="font-mono text-white">₹{charges.turnover.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Est. fill</span>
              <span className="font-mono text-white">₹{effectivePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Brokerage</span>
              <span className="font-mono text-slate-300">₹{charges.brokerage.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">STT + exchange + GST</span>
              <span className="font-mono text-slate-300">
                ₹{(charges.stt + charges.exchangeCharges + charges.sebiFees + charges.gst).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[#1a1f2e] pt-1">
              <span className="text-slate-500">Total charges {fillsNow ? '(on fill)' : '(if filled)'}</span>
              <span className="font-mono font-bold text-orange-300">₹{charges.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Required margin</span>
              <span className="font-mono text-white">
                ₹{marginRequired.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
            {fillsNow ? (
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Total debit</span>
                <span className={`font-mono font-bold ${totalEntryCost <= available ? 'text-white' : 'text-red-400'}`}>
                  ₹{totalEntryCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-slate-500">Margin blocked (pending)</span>
                <span className={`font-mono font-bold ${marginRequired <= available ? 'text-amber-300' : 'text-red-400'}`}>
                  ₹{marginRequired.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Available</span>
              <span className="font-mono text-emerald-400">₹{available.toLocaleString()}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={fillsNow ? totalEntryCost > available : marginRequired > available}
            title={fillsNow ? 'Place market order' : `Place ${orderTypeLabel(draft.orderType)} order`}
            className={`w-full py-3 rounded-lg font-bold text-white transition-opacity disabled:opacity-40 sticky bottom-0 ${
              side === 'BUY' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            Place {side} · {draft.segment === 'OPTIONS' ? `${draft.strike}${draft.optionType}` : segmentLabel(draft.segment)}
          </button>
        </div>
      </div>
    </div>
  );
}
