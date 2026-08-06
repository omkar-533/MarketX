import { useEffect, useRef, useState, type CSSProperties, type RefObject, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  BringToFront,
  Copy,
  Lock,
  SendToBack,
  Settings,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  DRAW_LINE_COLORS,
  type Drawing,
  type DrawingLineStyle,
} from '../../services/chart/chartDrawings';

export type DrawingObjectToolbarProps = {
  drawing: Drawing | null;
  anchorRef: RefObject<HTMLElement | null>;
  onPatch: (patch: Partial<Drawing>) => void;
  onOpenSettings: () => void;
  onClone: () => void;
  onRemove: () => void;
  onReorder: (dir: 'front' | 'forward' | 'backward' | 'back') => void;
};

type Box = { left: number; top: number; width: number; height: number };

const WIDTHS = [1, 2, 3, 4] as const;
const STYLES: { id: DrawingLineStyle; label: string; dash: string }[] = [
  { id: 'solid', label: 'Solid', dash: '24 0' },
  { id: 'dashed', label: 'Dashed', dash: '8 4' },
  { id: 'dotted', label: 'Dotted', dash: '2 3' },
];

/**
 * TradingView floating object toolbar — appears when a drawing is selected.
 * Portaled + fixed so chart overflow never clips it.
 */
export default function DrawingObjectToolbar({
  drawing,
  anchorRef,
  onPatch,
  onOpenSettings,
  onClone,
  onRemove,
  onReorder,
}: DrawingObjectToolbarProps) {
  const [box, setBox] = useState<Box | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [widthOpen, setWidthOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el || !drawing) {
      setBox(null);
      return;
    }
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) {
          setBox(null);
          return;
        }
        setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [anchorRef, drawing]);

  useEffect(() => {
    setColorOpen(false);
    setWidthOpen(false);
    setStyleOpen(false);
  }, [drawing?.id]);

  useEffect(() => {
    if (!colorOpen && !widthOpen && !styleOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setColorOpen(false);
      setWidthOpen(false);
      setStyleOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [colorOpen, widthOpen, styleOpen]);

  if (!drawing || !box || typeof document === 'undefined') return null;

  const lineW = drawing.lineWidth ?? 2;
  const lineStyle = drawing.lineStyle ?? 'solid';
  const locked = Boolean(drawing.locked);

  const style: CSSProperties = {
    left: box.left + box.width / 2,
    top: box.top + 10,
  };

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      ref={rootRef}
      className="mai-nc__objbar"
      style={style}
      role="toolbar"
      aria-label={`${drawing.kind} settings`}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onDoubleClick={stop}
      onWheel={stop}
    >
      <div className="mai-nc__objbar-kind" title={drawing.kind}>
        {drawing.kind}
      </div>
      <span className="mai-nc__objbar-sep" aria-hidden />

      <div className="mai-nc__objbar-drop">
        <button
          type="button"
          className="mai-nc__objbar-btn"
          title="Color"
          aria-label="Line color"
          aria-expanded={colorOpen}
          onClick={() => {
            setColorOpen((v) => !v);
            setWidthOpen(false);
            setStyleOpen(false);
          }}
        >
          <span className="mai-nc__objbar-swatch" style={{ background: drawing.color }} />
        </button>
        {colorOpen ? (
          <div className="mai-nc__objbar-pop mai-nc__objbar-pop--colors" role="listbox">
            {DRAW_LINE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`mai-nc__objbar-color ${drawing.color.toLowerCase() === c ? 'on' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={() => {
                  onPatch({ color: c });
                  setColorOpen(false);
                }}
              />
            ))}
            <label className="mai-nc__objbar-picker" title="Custom color">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(drawing.color) ? drawing.color : '#2962ff'}
                onChange={(e) => onPatch({ color: e.target.value })}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="mai-nc__objbar-drop">
        <button
          type="button"
          className="mai-nc__objbar-btn"
          title="Line width"
          aria-expanded={widthOpen}
          onClick={() => {
            setWidthOpen((v) => !v);
            setColorOpen(false);
            setStyleOpen(false);
          }}
        >
          <span className="mai-nc__objbar-width-ico" style={{ height: Math.min(4, lineW) + 1 }} />
        </button>
        {widthOpen ? (
          <div className="mai-nc__objbar-pop" role="listbox">
            {WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                className={`mai-nc__objbar-row ${lineW === w ? 'on' : ''}`}
                onClick={() => {
                  onPatch({ lineWidth: w });
                  setWidthOpen(false);
                }}
              >
                <span className="mai-nc__objbar-width-ico" style={{ height: w + 1, width: 28 }} />
                <span>{w}px</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mai-nc__objbar-drop">
        <button
          type="button"
          className="mai-nc__objbar-btn"
          title="Line style"
          aria-expanded={styleOpen}
          onClick={() => {
            setStyleOpen((v) => !v);
            setColorOpen(false);
            setWidthOpen(false);
          }}
        >
          <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden>
            <line
              x1="1"
              y1="5"
              x2="21"
              y2="5"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={
                lineStyle === 'dashed' ? '5 3' : lineStyle === 'dotted' ? '1.5 3' : undefined
              }
              strokeLinecap="round"
            />
          </svg>
        </button>
        {styleOpen ? (
          <div className="mai-nc__objbar-pop" role="listbox">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`mai-nc__objbar-row ${lineStyle === s.id ? 'on' : ''}`}
                onClick={() => {
                  onPatch({ lineStyle: s.id });
                  setStyleOpen(false);
                }}
              >
                <svg width="36" height="10" viewBox="0 0 36 10" aria-hidden>
                  <line
                    x1="1"
                    y1="5"
                    x2="35"
                    y2="5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={s.dash === '24 0' ? undefined : s.dash}
                    strokeLinecap="round"
                  />
                </svg>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <span className="mai-nc__objbar-sep" aria-hidden />

      <button
        type="button"
        className="mai-nc__objbar-btn"
        title="Bring to front"
        onClick={() => onReorder('front')}
      >
        <BringToFront className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
      <button
        type="button"
        className="mai-nc__objbar-btn"
        title="Send to back"
        onClick={() => onReorder('back')}
      >
        <SendToBack className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>

      <span className="mai-nc__objbar-sep" aria-hidden />

      <button
        type="button"
        className="mai-nc__objbar-btn"
        title="Settings"
        onClick={onOpenSettings}
      >
        <Settings className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
      <button
        type="button"
        className={`mai-nc__objbar-btn ${locked ? 'on' : ''}`}
        title={locked ? 'Unlock' : 'Lock'}
        onClick={() => onPatch({ locked: !locked })}
      >
        {locked ? (
          <Lock className="h-3.5 w-3.5" strokeWidth={2.2} />
        ) : (
          <Unlock className="h-3.5 w-3.5" strokeWidth={2.2} />
        )}
      </button>
      <button type="button" className="mai-nc__objbar-btn" title="Clone" onClick={onClone}>
        <Copy className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
      <button
        type="button"
        className="mai-nc__objbar-btn mai-nc__objbar-btn--danger"
        title="Remove"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
    </div>,
    document.body,
  );
}
