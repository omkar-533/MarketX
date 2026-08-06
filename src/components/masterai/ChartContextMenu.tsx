import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  ChevronRight,
  ClipboardPaste,
  Copy,
  ListTree,
  PlusSquare,
  RotateCcw,
  Settings,
  Table2,
  Trash2,
} from 'lucide-react';

export type ChartCtxPayload = {
  clientX: number;
  clientY: number;
  price: number;
  symbolLabel: string;
  shortSymbol: string;
  drawingCount: number;
  indicatorCount: number;
  cursorLocked: boolean;
};

export type ChartContextMenuProps = {
  open: ChartCtxPayload | null;
  onClose: () => void;
  decimals?: number;
  onResetView: () => void;
  onCopyPrice: (price: number) => void;
  onPaste: () => void;
  onAddAlert: (price: number) => void;
  onSellLimit: (price: number) => void;
  onBuyStop: (price: number) => void;
  onAddOrder: (price: number) => void;
  onToggleLockCursor: () => void;
  onTableView: () => void;
  onObjectTree: () => void;
  onRemoveDrawings: () => void;
  onRemoveIndicators: () => void;
  onSettings: () => void;
  templates: { id: string; name: string }[];
  onSaveTemplate: () => void;
  onApplyTemplate: (id: string) => void;
  onClearTemplateLayout: () => void;
};

function fmtPrice(n: number, decimals: number) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
  });
}

type RowProps = {
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  submenu?: boolean;
  onClick?: () => void;
  onHover?: () => void;
};

function Row({ icon, label, shortcut, disabled, danger, submenu, onClick, onHover }: RowProps) {
  return (
    <button
      type="button"
      className={`mai-ctx__row ${danger ? 'mai-ctx__row--danger' : ''} ${disabled ? 'mai-ctx__row--off' : ''}`}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onHover}
      role="menuitem"
    >
      <span className="mai-ctx__ico" aria-hidden>
        {icon}
      </span>
      <span className="mai-ctx__lab">{label}</span>
      {shortcut ? <span className="mai-ctx__kbd">{shortcut}</span> : null}
      {submenu ? <ChevronRight className="mai-ctx__chev" strokeWidth={2} aria-hidden /> : null}
    </button>
  );
}

function Sep() {
  return <div className="mai-ctx__sep" role="separator" />;
}

/**
 * TradingView-style chart right-click menu (portaled, fixed).
 */
export default function ChartContextMenu({
  open,
  onClose,
  decimals = 2,
  onResetView,
  onCopyPrice,
  onPaste,
  onAddAlert,
  onSellLimit,
  onBuyStop,
  onAddOrder,
  onToggleLockCursor,
  onTableView,
  onObjectTree,
  onRemoveDrawings,
  onRemoveIndicators,
  onSettings,
  templates,
  onSaveTemplate,
  onApplyTemplate,
  onClearTemplateLayout,
}: ChartContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [tplOpen, setTplOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    setTplOpen(false);
    const pad = 8;
    const w = 300;
    const h = 420;
    let left = open.clientX;
    let top = open.clientY;
    if (left + w > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - w - pad);
    if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad);
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && rootRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const priceTxt = fmtPrice(open.price, decimals);
  const sym = open.shortSymbol;
  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  return createPortal(
    <div
      ref={rootRef}
      className="mai-ctx"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label="Chart context menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Row
        icon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Reset chart view"
        shortcut="Alt + R"
        onClick={() => run(onResetView)}
        onHover={() => setTplOpen(false)}
      />
      <Sep />
      <Row
        icon={<Copy className="h-3.5 w-3.5" strokeWidth={2} />}
        label={`Copy price ${priceTxt}`}
        onClick={() => run(() => onCopyPrice(open.price))}
        onHover={() => setTplOpen(false)}
      />
      <Row
        icon={<ClipboardPaste className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Paste"
        shortcut="Ctrl + V"
        onClick={() => run(onPaste)}
        onHover={() => setTplOpen(false)}
      />
      <Sep />
      <Row
        icon={<Bell className="h-3.5 w-3.5" strokeWidth={2} />}
        label={`Add alert on ${sym} at ${priceTxt}…`}
        shortcut="Alt + A"
        onClick={() => run(() => onAddAlert(open.price))}
        onHover={() => setTplOpen(false)}
      />
      <Row
        icon={<ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={2} />}
        label={`Sell 1 ${sym} @ ${priceTxt} limit`}
        shortcut="Alt + Shift + S"
        onClick={() => run(() => onSellLimit(open.price))}
        onHover={() => setTplOpen(false)}
      />
      <Row
        icon={<ArrowUpFromLine className="h-3.5 w-3.5" strokeWidth={2} />}
        label={`Buy 1 ${sym} @ ${priceTxt} stop`}
        onClick={() => run(() => onBuyStop(open.price))}
        onHover={() => setTplOpen(false)}
      />
      <Row
        icon={<PlusSquare className="h-3.5 w-3.5" strokeWidth={2} />}
        label={`Add order on ${sym} at ${priceTxt}…`}
        shortcut="Shift + T"
        onClick={() => run(() => onAddOrder(open.price))}
        onHover={() => setTplOpen(false)}
      />
      <Sep />
      <Row
        label={
          open.cursorLocked
            ? 'Unlock vertical cursor line'
            : 'Lock vertical cursor line by time'
        }
        onClick={() => run(onToggleLockCursor)}
        onHover={() => setTplOpen(false)}
      />
      <Sep />
      <Row
        icon={<Table2 className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Table view"
        onClick={() => run(onTableView)}
        onHover={() => setTplOpen(false)}
      />
      <Row
        icon={<ListTree className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Object tree"
        onClick={() => run(onObjectTree)}
        onHover={() => setTplOpen(false)}
      />
      <div className="mai-ctx__subwrap">
        <Row
          label="Chart template"
          submenu
          onHover={() => setTplOpen(true)}
          onClick={() => setTplOpen((v) => !v)}
        />
        {tplOpen ? (
          <div className="mai-ctx__fly" role="menu">
            <Row label="Save as template…" onClick={() => run(onSaveTemplate)} />
            <Row label="Clear drawings layout" onClick={() => run(onClearTemplateLayout)} />
            {templates.length ? <Sep /> : null}
            {templates.map((t) => (
              <Row key={t.id} label={t.name} onClick={() => run(() => onApplyTemplate(t.id))} />
            ))}
            {!templates.length ? (
              <div className="mai-ctx__empty">No saved templates</div>
            ) : null}
          </div>
        ) : null}
      </div>
      <Sep />
      <Row
        icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={2} />}
        label={`Remove ${open.drawingCount} drawing${open.drawingCount === 1 ? '' : 's'}`}
        disabled={open.drawingCount <= 0}
        danger
        onClick={() => run(onRemoveDrawings)}
        onHover={() => setTplOpen(false)}
      />
      <Row
        icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={2} />}
        label={`Remove ${open.indicatorCount} indicator${open.indicatorCount === 1 ? '' : 's'}`}
        disabled={open.indicatorCount <= 0}
        danger
        onClick={() => run(onRemoveIndicators)}
        onHover={() => setTplOpen(false)}
      />
      <Sep />
      <Row
        icon={<Settings className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Settings…"
        onClick={() => run(onSettings)}
        onHover={() => setTplOpen(false)}
      />
    </div>,
    document.body,
  );
}
