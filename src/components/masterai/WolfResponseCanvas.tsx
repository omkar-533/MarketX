/**
 * WolfResponseCanvas — ONE visual UI for every Hunter AI response.
 * Never renders raw chat bubbles / markdown as the primary answer.
 */

import type { ReactNode } from 'react';
import WolfSetupAnalysisCard, { type WolfTrailItem } from './WolfSetupAnalysisCard';
import { normalizeVisualResponse } from '../../utils/visualResponseNormalizer';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import type { WolfEvidenceItem } from '../../utils/wolfEvidence';
import type { WolfAnalysisMode } from '../../constants/wolfAnalysisModes';

type Props = {
  text: string;
  /** Prior user ask helps classify response type for the normalizer. */
  userAsk?: string;
  hindi?: boolean;
  onSpeak?: (text: string) => void;
  imageUrl?: string | null;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  evidence?: WolfEvidenceItem[];
  sessionEvidence?: WolfEvidenceItem[];
  onWhatIf?: (prompt: string) => void;
  onAskWolf?: () => void;
  trail?: WolfTrailItem[];
  activeTrailId?: string | null;
  onTrailSelect?: (id: string) => void;
  hideAskDock?: boolean;
  symbolLabel?: string;
  timeframeLabel?: string;
  analysisMode?: WolfAnalysisMode;
  onAnalysisModeChange?: (mode: WolfAnalysisMode) => void;
  analysisModeDisabled?: boolean;
  analysisLab?: ReactNode;
  layerTextOverride?: string;
  layerEvidenceOverride?: WolfEvidenceItem[];
  chartIdentityBanner?: string | null;
};

export default function WolfResponseCanvas({
  text,
  userAsk,
  hindi,
  onSpeak,
  imageUrl,
  levels = [],
  shapes = [],
  evidence = [],
  sessionEvidence = [],
  onWhatIf,
  onAskWolf,
  trail,
  activeTrailId,
  onTrailSelect,
  hideAskDock = true,
  symbolLabel,
  timeframeLabel,
  analysisMode,
  onAnalysisModeChange,
  analysisModeDisabled,
  analysisLab,
  layerTextOverride,
  layerEvidenceOverride,
  chartIdentityBanner,
}: Props) {
  const sourceText = layerTextOverride || text;
  const sourceEvidence =
    layerEvidenceOverride && layerEvidenceOverride.length
      ? layerEvidenceOverride
      : evidence;

  const visual = normalizeVisualResponse({
    text: sourceText,
    userAsk,
    hindi,
    imageUrl,
    levels,
    shapes,
    evidence: sourceEvidence,
    sessionEvidence,
  });

  // Hard rule: never render analysis UI without an active chart image.
  if (!visual.imageUrl) {
    return (
      <div className="wolf-response-canvas wolf-response-canvas--empty" data-wolf-type="empty">
        <div className="wolf-vision-home wolf-vision-home--compact">
          <p className="wolf-vision-home__tag">
            {hindi
              ? 'Chart upload karo — tab analysis dikhega.'
              : 'Upload a chart — analysis appears after Wolf reads it.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wolf-response-canvas" data-wolf-type={visual.type}>
      {chartIdentityBanner ? (
        <div className="wolf-response-canvas__id" role="status">
          {chartIdentityBanner}
        </div>
      ) : null}
      <WolfSetupAnalysisCard
        text={visual.templateText}
        hindi={hindi}
        onSpeak={onSpeak}
        imageUrl={visual.imageUrl}
        levels={visual.levels}
        shapes={visual.shapes}
        evidence={visual.evidence.length ? visual.evidence : sessionEvidence}
        onWhatIf={onWhatIf}
        onAskWolf={onAskWolf}
        trail={trail}
        activeTrailId={activeTrailId}
        onTrailSelect={onTrailSelect}
        hideAskDock={hideAskDock}
        symbolLabel={symbolLabel}
        timeframeLabel={timeframeLabel}
        analysisMode={analysisMode}
        onAnalysisModeChange={onAnalysisModeChange}
        analysisModeDisabled={analysisModeDisabled}
        analysisLab={analysisLab}
      />
    </div>
  );
}
