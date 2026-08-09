import { useMemo, useState } from 'react';
import {
  WOLF_ANALYSIS_MODES,
  type WolfAnalysisMode,
  wolfAnalysisModeLabel,
} from '../../constants/wolfAnalysisModes';
import type { AnalysisLayer, ConsensusReport } from '../../utils/wolfConsensus';

type Props = {
  analysisMode: WolfAnalysisMode;
  onModeChange: (mode: WolfAnalysisMode) => void;
  /** Request re-analysis of same chart with this lens (no re-upload). */
  onReanalyzeLens: (mode: WolfAnalysisMode) => void;
  layers: AnalysisLayer[];
  activeLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onCompare: () => void;
  consensus: ConsensusReport | null;
  compareOpen: boolean;
  onCloseCompare: () => void;
  disabled?: boolean;
  hindi?: boolean;
};

/**
 * Lens selector — one active lens, not a WAIT-row dashboard.
 * Saved analyses appear as subtle ✓ chips; compare is a temporary overlay.
 */
export default function WolfAnalysisLab({
  analysisMode,
  onModeChange,
  onReanalyzeLens,
  layers,
  activeLayerId,
  onSelectLayer,
  onCompare,
  consensus,
  compareOpen,
  onCloseCompare,
  disabled,
  hindi,
}: Props) {
  const [openMore, setOpenMore] = useState(false);

  const primary = useMemo(
    () =>
      WOLF_ANALYSIS_MODES.filter((m) =>
        ['auto', 'smc', 'price_action', 'liquidity', 'support_resistance', 'mbp'].includes(m.id),
      ),
    [],
  );
  const more = useMemo(
    () => WOLF_ANALYSIS_MODES.filter((m) => !primary.some((p) => p.id === m.id)),
    [primary],
  );

  const doneModes = useMemo(() => new Set(layers.map((l) => l.mode)), [layers]);

  const pick = (mode: WolfAnalysisMode) => {
    if (disabled) return;
    const existing = layers.find((l) => l.mode === mode);
    if (existing) {
      onModeChange(mode);
      onSelectLayer(existing.id);
      return;
    }
    // Same lens already active with no saved layer — don't re-fire.
    if (mode === analysisMode) return;
    onModeChange(mode);
    onReanalyzeLens(mode);
  };

  return (
    <div className="wolf-lab wolf-lab--lens">
      <div className="wolf-lab__head">
        <span className="wolf-lab__title">{hindi ? 'LENS' : 'READ AS'}</span>
        {layers.length >= 2 ? (
          <button type="button" className="wolf-lab__compare-link" disabled={disabled} onClick={onCompare}>
            {hindi ? 'COMPARE' : 'COMPARE'}
          </button>
        ) : null}
      </div>

      <div className="wolf-lab__chips" role="group" aria-label="Analysis lens">
        {primary.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`wolf-lab__chip ${analysisMode === m.id ? 'is-active' : ''} ${
              doneModes.has(m.id) ? 'is-done' : ''
            }`}
            title={m.hint}
            disabled={disabled}
            onClick={() => pick(m.id)}
          >
            {doneModes.has(m.id) ? '✓ ' : ''}
            {m.short}
          </button>
        ))}
        <button
          type="button"
          className={`wolf-lab__chip wolf-lab__more ${openMore ? 'is-active' : ''}`}
          disabled={disabled}
          onClick={() => setOpenMore((v) => !v)}
        >
          +
        </button>
      </div>

      {openMore ? (
        <div className="wolf-lab__more-row">
          {more.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`wolf-lab__chip ${analysisMode === m.id ? 'is-active' : ''} ${
                doneModes.has(m.id) ? 'is-done' : ''
              }`}
              title={m.hint}
              disabled={disabled}
              onClick={() => pick(m.id)}
            >
              {doneModes.has(m.id) ? '✓ ' : ''}
              {m.short}
            </button>
          ))}
        </div>
      ) : null}

      {layers.length > 1 ? (
        <div className="wolf-lab__saved" aria-label="Saved analyses">
          {layers.map((layer) => (
            <button
              key={layer.id}
              type="button"
              className={`wolf-lab__saved-chip ${activeLayerId === layer.id ? 'is-on' : ''}`}
              onClick={() => onSelectLayer(layer.id)}
            >
              {wolfAnalysisModeLabel(layer.mode)}
            </button>
          ))}
        </div>
      ) : null}

      {compareOpen && consensus ? (
        <div className="wolf-lab__compare-panel" role="dialog" aria-label="Wolf comparison">
          <div className="wolf-lab__compare-top">
            <strong>{hindi ? 'WOLF COMPARISON' : 'WOLF COMPARISON'}</strong>
            <button type="button" onClick={onCloseCompare} aria-label="Close">
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
