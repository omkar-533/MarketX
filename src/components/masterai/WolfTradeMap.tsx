import type { ThesisKeyLevel } from '../../utils/tradingThesis';

export type TradeMapRowId = 'decision' | 'entry' | 'invalid' | 'tp1' | 'tp2';

export type TradeMapRow = {
  id: TradeMapRowId;
  label: string;
  value: string;
  level?: ThesisKeyLevel | null;
};

type Props = {
  rows: TradeMapRow[];
  onFocus?: (row: TradeMapRow) => void;
};

/** Compact V6 trade map — each value focuses chart when possible. */
export default function WolfTradeMap({ rows, onFocus }: Props) {
  const visible = rows.filter((r) => r.value && r.value !== '—' && r.value.trim());
  if (!visible.length) return null;

  return (
    <div className="wolf-map wolf-map--v6" aria-label="Trade map">
      <div className="wolf-map__head">TRADE MAP</div>
      <ul className="wolf-map__list">
        {visible.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={`wolf-map__row wolf-map__row--${row.id}`}
              onClick={() => onFocus?.(row)}
              disabled={!onFocus}
            >
              <span className="wolf-map__lab">{row.label}</span>
              <span className="wolf-map__txt">{row.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
