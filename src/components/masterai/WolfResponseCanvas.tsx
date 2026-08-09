/**
 * WolfResponseCanvas — ONE visual UI for every Hunter AI response.
 * Never renders raw chat bubbles / markdown as the primary answer.
 */

import WolfSetupAnalysisCard from './WolfSetupAnalysisCard';
import { normalizeVisualResponse } from '../../utils/visualResponseNormalizer';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import type { WolfEvidenceItem } from '../../utils/wolfEvidence';

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
}: Props) {
  const visual = normalizeVisualResponse({
    text,
    userAsk,
    hindi,
    imageUrl,
    levels,
    shapes,
    evidence,
    sessionEvidence,
  });

  // Same desk component — always fed a parseable template + chart session.
  return (
    <div className="wolf-response-canvas" data-wolf-type={visual.type}>
      {!visual.imageUrl ? (
        <div className="wolf-response-canvas__warn" role="status">
          ⚠️ Upload / keep a chart in this chat so Wolf can pinpoint on YOUR screenshot.
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
      />
    </div>
  );
}
