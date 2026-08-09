import { WOLF_ANALYSIS_MODES, type WolfAnalysisMode, saveWolfAnalysisMode } from '../../constants/wolfAnalysisModes';

type Props = {
  value: WolfAnalysisMode;
  onChange: (mode: WolfAnalysisMode) => void;
  disabled?: boolean;
  hindi?: boolean;
  className?: string;
};

/** Single source of truth for analysis mode — compact dropdown, never a chip wall. */
export default function WolfAnalyzeSelect({
  value,
  onChange,
  disabled,
  hindi,
  className = '',
}: Props) {
  return (
    <label className={`wolf-analyze-select ${className}`.trim()}>
      <span className="wolf-analyze-select__k">{hindi ? 'ANALYZE' : 'ANALYZE'}</span>
      <select
        value={value}
        disabled={disabled}
        aria-label={hindi ? 'Analysis mode' : 'Analyze mode'}
        onChange={(e) => {
          const mode = e.target.value as WolfAnalysisMode;
          onChange(mode);
          saveWolfAnalysisMode(mode);
        }}
      >
        <optgroup label={hindi ? 'Core' : 'Core'}>
          {WOLF_ANALYSIS_MODES.filter((m) => m.tier === 'core').map((m) => (
            <option key={m.id} value={m.id} title={m.hint}>
              {m.label.toUpperCase()}
            </option>
          ))}
        </optgroup>
        <optgroup label={hindi ? 'More' : 'More'}>
          {WOLF_ANALYSIS_MODES.filter((m) => m.tier === 'extended').map((m) => (
            <option key={m.id} value={m.id} title={m.hint}>
              {m.label.toUpperCase()}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
