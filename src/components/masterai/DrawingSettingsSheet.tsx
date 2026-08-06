import { useEffect, useState } from 'react';
import type { Drawing, DrawingLineStyle, DrawPoint } from '../../services/chart/chartDrawings';
import { DRAW_LINE_COLORS } from '../../services/chart/chartDrawings';

export type DrawingSettingsSheetProps = {
  drawing: Drawing;
  onPatch: (patch: Partial<Drawing>) => void;
  onClose: () => void;
  onClone: () => void;
  onRemove: () => void;
};

type Tab = 'style' | 'coords' | 'visibility';

const WIDTHS = [1, 2, 3, 4] as const;

function formatTime(unix: number): string {
  try {
    return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return String(unix);
  }
}

/**
 * TradingView-style drawing properties dialog (Style / Coordinates / Visibility).
 */
export default function DrawingSettingsSheet({
  drawing,
  onPatch,
  onClose,
  onClone,
  onRemove,
}: DrawingSettingsSheetProps) {
  const [tab, setTab] = useState<Tab>('style');
  const [label, setLabel] = useState(drawing.label ?? '');
  const [pointsDraft, setPointsDraft] = useState(
    drawing.points.map((p) => ({ time: String(p.time), price: String(p.price) })),
  );

  useEffect(() => {
    setLabel(drawing.label ?? '');
    setPointsDraft(drawing.points.map((p) => ({ time: String(p.time), price: String(p.price) })));
    setTab('style');
  }, [drawing.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lineW = drawing.lineWidth ?? 2;
  const lineStyle = (drawing.lineStyle ?? 'solid') as DrawingLineStyle;
  const fillOpacity = drawing.fillOpacity ?? 0.12;

  const commitPoints = () => {
    const next: DrawPoint[] = [];
    for (const row of pointsDraft) {
      const time = Number(row.time);
      const price = Number(row.price);
      if (!Number.isFinite(time) || !Number.isFinite(price)) return;
      next.push({ time, price });
    }
    if (next.length) onPatch({ points: next });
  };

  return (
    <div className="mai-nc__sheet mai-nc__sheet--draw" role="dialog" aria-label="Drawing settings">
      <header className="mai-nc__sheet-h">
        <b>
          {drawing.kind}
          {drawing.label ? ` · ${drawing.label}` : ''}
        </b>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="mai-nc__draw-tabs" role="tablist">
        {(
          [
            ['style', 'Style'],
            ['coords', 'Coordinates'],
            ['visibility', 'Visibility'],
          ] as const
        ).map(([id, lab]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}
          >
            {lab}
          </button>
        ))}
      </div>

      <div className="mai-nc__sheet-body mai-nc__draw-body">
        {tab === 'style' ? (
          <>
            <label className="mai-nc__draw-field">
              <span>Color</span>
              <div className="mai-nc__draw-colors">
                {DRAW_LINE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`mai-nc__objbar-color ${
                      drawing.color.toLowerCase() === c ? 'on' : ''
                    }`}
                    style={{ background: c }}
                    onClick={() => onPatch({ color: c })}
                  />
                ))}
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(drawing.color) ? drawing.color : '#2962ff'}
                  onChange={(e) => onPatch({ color: e.target.value })}
                  aria-label="Custom color"
                />
              </div>
            </label>

            <label className="mai-nc__draw-field">
              <span>Line width</span>
              <div className="mai-nc__draw-seg">
                {WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={lineW === w ? 'on' : ''}
                    onClick={() => onPatch({ lineWidth: w })}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </label>

            <label className="mai-nc__draw-field">
              <span>Line style</span>
              <div className="mai-nc__draw-seg">
                {(
                  [
                    ['solid', 'Solid'],
                    ['dashed', 'Dashed'],
                    ['dotted', 'Dotted'],
                  ] as const
                ).map(([id, lab]) => (
                  <button
                    key={id}
                    type="button"
                    className={lineStyle === id ? 'on' : ''}
                    onClick={() => onPatch({ lineStyle: id })}
                  >
                    {lab}
                  </button>
                ))}
              </div>
            </label>

            <label className="mai-nc__draw-field">
              <span>Fill opacity · {Math.round(fillOpacity * 100)}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(fillOpacity * 100)}
                onChange={(e) => onPatch({ fillOpacity: Number(e.target.value) / 100 })}
              />
            </label>

            <label className="mai-nc__draw-field">
              <span>Text / label</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => onPatch({ label: label.trim() || undefined })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onPatch({ label: label.trim() || undefined });
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Optional label"
              />
            </label>

            <div className="mai-nc__draw-checks">
              <label>
                <input
                  type="checkbox"
                  checked={drawing.extendLeft === true}
                  onChange={(e) => onPatch({ extendLeft: e.target.checked })}
                />
                Extend left
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={drawing.extendRight === true}
                  onChange={(e) => onPatch({ extendRight: e.target.checked })}
                />
                Extend right
              </label>
            </div>
          </>
        ) : null}

        {tab === 'coords' ? (
          <>
            <p className="mai-nc__sheet-empty" style={{ marginBottom: 8 }}>
              Time is unix seconds · price is chart value
            </p>
            {pointsDraft.map((row, i) => (
              <div key={i} className="mai-nc__draw-coords">
                <div className="mai-nc__draw-coords-h">Point {i + 1}</div>
                <label>
                  <span>Time</span>
                  <input
                    type="text"
                    value={row.time}
                    onChange={(e) => {
                      const next = [...pointsDraft];
                      next[i] = { ...next[i], time: e.target.value };
                      setPointsDraft(next);
                    }}
                    onBlur={commitPoints}
                  />
                  <small>{formatTime(Number(row.time))}</small>
                </label>
                <label>
                  <span>Price</span>
                  <input
                    type="text"
                    value={row.price}
                    onChange={(e) => {
                      const next = [...pointsDraft];
                      next[i] = { ...next[i], price: e.target.value };
                      setPointsDraft(next);
                    }}
                    onBlur={commitPoints}
                  />
                </label>
              </div>
            ))}
            <button type="button" className="mai-nc__draw-apply" onClick={commitPoints}>
              Apply coordinates
            </button>
          </>
        ) : null}

        {tab === 'visibility' ? (
          <>
            <label className="mai-nc__draw-toggle">
              <input
                type="checkbox"
                checked={drawing.visible !== false}
                onChange={(e) => onPatch({ visible: e.target.checked })}
              />
              <span>Visible on chart</span>
            </label>
            <label className="mai-nc__draw-toggle">
              <input
                type="checkbox"
                checked={Boolean(drawing.locked)}
                onChange={(e) => onPatch({ locked: e.target.checked })}
              />
              <span>Lock (prevent drag / delete)</span>
            </label>
            <div className="mai-nc__draw-actions">
              <button type="button" onClick={onClone}>
                Clone object
              </button>
              <button type="button" className="danger" onClick={onRemove}>
                Remove
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
