import {
  AlignJustify,
  Magnet,
  Minus,
  MousePointer2,
  MoveUpRight,
  MoveVertical,
  Square,
  Trash2,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import type { DrawingTool } from '../../services/chart/chartDrawings';

const TOOLS: { id: DrawingTool; label: string; Icon: typeof MousePointer2 }[] = [
  { id: 'cursor', label: 'Cursor', Icon: MousePointer2 },
  { id: 'trend', label: 'Trend line', Icon: TrendingUp },
  { id: 'ray', label: 'Ray', Icon: MoveUpRight },
  { id: 'hline', label: 'Horizontal line', Icon: Minus },
  { id: 'vline', label: 'Vertical line', Icon: MoveVertical },
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'fib', label: 'Fib retracement', Icon: AlignJustify },
];

export type ChartToolRailProps = {
  tool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  magnet: boolean;
  onMagnetToggle: () => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  /** Layout hint from chat vs terminal desk; currently unused. */
  variant?: 'chat' | 'desk';
};

/** TradingView's left drawing rail, trimmed to the tools that matter in chat. */
export default function ChartToolRail({
  tool,
  onToolChange,
  magnet,
  onMagnetToggle,
  onUndo,
  onClear,
  canUndo,
  variant = 'chat',
}: ChartToolRailProps) {
  return (
    <div
      className={`mai-nc__rail${variant === 'desk' ? ' mai-nc__rail--desk' : ''}`}
      role="toolbar"
      aria-label="Drawing tools"
    >      {TOOLS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`mai-nc__rail-btn ${tool === id ? 'mai-nc__rail-btn--on' : ''}`}
          onClick={() => onToolChange(id)}
          title={label}
          aria-label={label}
          aria-pressed={tool === id}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}

      <span className="mai-nc__rail-sep" aria-hidden />

      <button
        type="button"
        className={`mai-nc__rail-btn ${magnet ? 'mai-nc__rail-btn--on' : ''}`}
        onClick={onMagnetToggle}
        title="Magnet: snap to OHLC"
        aria-label="Magnet: snap to OHLC"
        aria-pressed={magnet}
      >
        <Magnet className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="mai-nc__rail-btn"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo last drawing"
        aria-label="Undo last drawing"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="mai-nc__rail-btn"
        onClick={onClear}
        disabled={!canUndo}
        title="Remove all drawings"
        aria-label="Remove all drawings"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
