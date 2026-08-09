import { useMemo, useState } from 'react';
import {
  WOLF_ANALYSIS_MODES,
  type WolfAnalysisMode,
  wolfAnalysisModeLabel,
} from '../../constants/wolfAnalysisModes';
import type { AnalysisLayer, ConsensusReport } from '../../utils/wolfConsensus';

type Props = {
  /** Primary single mode (kept for uploads / active lens). */
  analysisMode: WolfAnalysisMode;
  onModeChange: (mode: WolfAnalysisMode) => void;
  /** Selected lenses for batch analyze (max 5). */
  labLenses: WolfAnalysisMode[];
  onLabLensesChange: (modes: WolfAnalysisMode[]) => void;
  onAnalyzeSelected: () => void;
  onCompare: () => void;
  layers: AnalysisLayer[];
  activeLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onToggleLayerVisible: (id: string) => void;
  consensus: ConsensusReport | null;
  compareOpen: boolean;
  onCloseCompare: () => void;
  disabled?: boolean;
  hindi?: boolean;
  compact?: boolean;
};

const MAX_LENSES = 5;

/**
 * Analysis Lab — multi-lens select · re-analyze · compare · consensus.
 * One chart · many lenses · shared visual understanding.
 */
export default function WolfAnalysisLab({
  analysisMode,
  onModeChange,
  labLenses,
  onLabLensesChange,
  onAnalyzeSelected,
  onCompare,
  layers,
  activeLayerId,
  onSelectLayer,
  onToggleLayerVisible,
  consensus,
  compareOpen,
  onCloseCompare,
  disabled,
  hindi,
  compact,
}: Props) {
  const [openMore, setOpenMore] = useState(false);

  const core = useMemo(() => WOLF_ANALYSIS_MODES.filter((m) => m.tier === 'core' || m.id === 'smc' || m.id === 'price_action'), []);
  const more = useMemo(
    () => WOLF_ANALYSIS_MODES.filter((m) => !core.some((c) => c.id === m.id)),
    [core],
  );

  const toggle = (id: WolfAnalysisMode) => {
    if (disabled) return;
    if (labLenses.includes(id)) {
      onLabLensesChange(labLenses.filter((m) => m !== id));
      return;
    }
    if (labLenses.length >= MAX_LENSES) return;
    onLabLensesChange([...labLenses, id]);
    onModeChange(id);
  };

  return (
    <div className={`wolf-lab ${compact ? 'wolf-lab--compact' : ''}`}>
      <div className="wolf-lab__head">
        <span className="wolf-lab__title">{hindi ? 'ANALYSIS LAB' : 'ANALYSIS LAB'}</span>
        <span className="wolf-lab__hint">
          {hindi ? `Same chart · ≤${MAX_LENSES} lenses` : `Same chart · up to ${MAX_LENSES} lenses`}
        </span>
      </div>

      <div className="wolf-lab__chips" role="group" aria-label="Analysis lenses">
        {core.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`wolf-lab__chip ${labLenses.includes(m.id) ? 'is-picked' : ''} ${
                analysisMode === m.id ? 'is-active' : ''
              }`}
              title={m.hint}
              disabled={disabled}
              onClick={() => toggle(m.id)}
            >
              {m.short}
            </button>
          ))}
        <button
          type="button"
          className={`wolf-lab__chip wolf-lab__more ${openMore ? 'is-picked' : ''}`}
          disabled={disabled}
          onClick={() => setOpenMore((v) => !v)}
        >
          {hindi ? 'More ▾' : 'More ▾'}
        </button>
      </div>

      {openMore ? (
        <div className="wolf-lab__more-row">
          {more.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`wolf-lab__chip ${labLenses.includes(m.id) ? 'is-picked' : ''}`}
              title={m.hint}
              disabled={disabled}
              onClick={() => toggle(m.id)}
            >
              {m.short}
            </button>
          ))}
        </div>
      ) : null}

      <div className="wolf-lab__acts">
        <button
          type="button"
          className="wolf-lab__run"
          disabled={disabled || labLenses.length === 0}
          onClick={onAnalyzeSelected}
        >
          {hindi
            ? `ANALYZE ${labLenses.length || 1}`
            : `ANALYZE SELECTED (${labLenses.length || 0})`}
        </button>
        <button
          type="button"
          className="wolf-lab__compare"
          disabled={disabled || layers.length < 2}
          onClick={onCompare}
        >
          {hindi ? 'COMPARE' : 'COMPARE'}
        </button>
      </div>

      {layers.length ? (
        <div className="wolf-lab__layers" aria-label="Analysis layers">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className={`wolf-lab__layer ${activeLayerId === layer.id ? 'is-on' : ''} ${
                layer.visible ? '' : 'is-dim'
              }`}
            >
              <button type="button" className="wolf-lab__layer-main" onClick={() => onSelectLayer(layer.id)}>
                <span>{wolfAnalysisModeLabel(layer.mode)}</span>
                <em>{layer.analysis?.bias || '…'}</em>
              </button>
              <button
                type="button"
                className="wolf-lab__eye"
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={() => onToggleLayerVisible(layer.id)}
              >
                {layer.visible ? '◉' : '○'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {compareOpen && consensus ? (
        <div className="wolf-lab__compare-panel" role="region" aria-label="Analysis comparison">
          <div className="wolf-lab__compare-top">
            <strong>{hindi ? 'COMPARISON' : 'ANALYSIS COMPARISON'}</strong>
            <button type="button" onClick={onCloseCompare} aria-label="Close compare">
              ✕
            </button>
          </div>
          <div className="wolf-lab__table-wrap">
            <table className="wolf-lab__table">
              <thead>
                <tr>
                  {consensus.rows.map((r) => (
                    <th key={r.mode}>{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {consensus.rows.map((r) => (
                    <td key={`${r.mode}-bias`}>{r.bias}</td>
                  ))}
                </tr>
                <tr>
                  {consensus.rows.map((r) => (
                    <td key={`${r.mode}-story`}>{r.story}</td>
                  ))}
                </tr>
                <tr>
                  {consensus.rows.map((r) => (
                    <td key={`${r.mode}-next`}>{r.next}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="wolf-lab__cons">
            <span>CONSENSUS</span>
            {consensus.biasConsensus}
          </p>
          <p className="wolf-lab__cons wolf-lab__cons--entry">{consensus.entryConsensus}</p>
          {consensus.conflicts.length ? (
            <ul className="wolf-lab__conflicts">
              {consensus.conflicts.map((c) => (
                <li key={c}>
                  <span>CONFLICT</span> {c}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="wolf-lab__verdict">
            <span>WOLF VERDICT</span>
            {consensus.verdict}
          </p>
        </div>
      ) : null}
    </div>
  );
}
