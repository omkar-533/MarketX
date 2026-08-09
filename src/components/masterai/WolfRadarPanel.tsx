import type { WolfEvidenceBars } from '../../utils/wolfVisualStory';

function DotRow({ label, value }: { label: string; value: number }) {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * 10);
  return (
    <div className="wolf-radar-x__row">
      <span className="wolf-radar-x__label">{label}</span>
      <span className="wolf-radar-x__dots" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={i < filled ? 'is-on' : ''} />
        ))}
      </span>
      <strong>{Math.round(value)}</strong>
    </div>
  );
}

/** Dot-style Setup Strength — not win probability. */
export default function WolfRadarPanel({ bars }: { bars: WolfEvidenceBars }) {
  return (
    <div className="wolf-radar-x" aria-label="Wolf Radar setup strength">
      <div className="wolf-radar-x__head">WOLF RADAR · SETUP STRENGTH</div>
      <DotRow label="STRUCTURE" value={bars.structure} />
      <DotRow label="LIQUIDITY" value={bars.liquidity} />
      <DotRow label="MOMENTUM" value={bars.momentum} />
      <DotRow label="CONFIRMATION" value={bars.confirmation} />
      <p className="wolf-radar-x__note">Evidence strength — not probability of profit.</p>
    </div>
  );
}
