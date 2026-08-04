import { useRef, useState } from 'react';
import {
  BookOpen,
  ImageUp,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import ChatMarkdown from '../ChatMarkdown';
import {
  CHART_MENTOR_FOLLOWUPS,
  buildChartMentorAnalyzePrompt,
  buildChartMentorFollowupPrompt,
  parseChartMentorReply,
  relatedLevelMeta,
  type ParsedChartMentor,
} from '../../services/mentorChartScenarios';
import {
  MASTER_AI_IMAGE_ACCEPT,
  prepareChartImageForAi,
} from '../../services/masterAiImage';
import {
  MASTER_AI_MODEL_ID,
  askMasterAi,
  buildMasterMarketContext,
  type MasterAiLangMode,
  type MasterAiLanguage,
} from '../../services/masterAiService';
import type { MentorMode } from '../../services/mentorModes';
import type { MentorStudentProfile } from '../../services/mentorStudentProfile';
import { isLevelUnlocked, type CurriculumProgress } from '../../services/mentorCurriculum';
import { parseChartAnnotations, type ChartLevel, type ChartShape } from '../../utils/chartAnnotations';
import { tradingViewSymbolLabel, type TvInterval } from '../../utils/tradingViewSymbols';

type ChartMentorPanelProps = {
  symbol: string;
  interval: TvInterval;
  profile: MentorStudentProfile | null;
  curriculum: CurriculumProgress;
  lang: MasterAiLanguage;
  langMode: MasterAiLangMode;
  mentorMode: MentorMode;
  onChartMarks: (levels: ChartLevel[], shapes: ChartShape[]) => void;
  onOpenCurriculumLevel: (levelId: number) => void;
};

function ConfidenceBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="wm-chart__bar">
      <span>
        {label} <b>{value}%</b>
      </span>
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

export default function ChartMentorPanel({
  symbol,
  interval,
  profile,
  curriculum,
  lang,
  langMode,
  mentorMode,
  onChartMarks,
  onOpenCurriculumLevel,
}: ChartMentorPanelProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(
    'Open chart pe **Analyze** dabao — structure, liquidity, dual scenarios, aur blackboard marks. Areas of Interest only — no Entry / Stop / Target.',
  );
  const [parsed, setParsed] = useState<ParsedChartMentor | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const related = relatedLevelMeta(parsed?.relatedLevelId ?? null);
  const relatedUnlocked = related ? isLevelUnlocked(related.levelId, curriculum) : false;

  const run = async (message: string, withImage: boolean) => {
    setBusy(true);
    setNote('Chart Mentor tape padh raha hai…');
    try {
      const chartHint = `[CHART OPEN ON WOLF MENTOR DESK: ${tradingViewSymbolLabel(symbol)} · ${interval}. Module 2 Chart Mentor. Draw AOIs with wolfchart. Never Entry/Stop/Target. Reply in ${lang.replyIn}.]`;
      const result = await askMasterAi(
        {
          message: `${message}\n\n${chartHint}`,
          model: MASTER_AI_MODEL_ID,
          lang: lang.code,
          langName: lang.name,
          langMode,
          mentorMode,
          mentorDesk: true,
          mentorChart: true,
          imageDataUrl: withImage ? imageDataUrl : null,
          history: [],
        },
        buildMasterMarketContext(),
      );
      const ann = parseChartAnnotations(String(result.reply || ''));
      if (ann.levels.length || ann.shapes.length) {
        onChartMarks(ann.levels, ann.shapes);
      }
      const text = ann.text.trim() || 'No mentor note returned — retry Analyze.';
      setNote(text);
      setParsed(parseChartMentorReply(text));
    } catch {
      setNote('Chart Mentor engine unreachable. AI key Profile mein check karo, phir retry.');
    } finally {
      setBusy(false);
    }
  };

  const analyze = () =>
    void run(
      buildChartMentorAnalyzePrompt({
        symbolLabel: tradingViewSymbolLabel(symbol),
        interval: String(interval),
        studentName: profile?.name,
        weakAreas: profile?.weakAreas,
        experience: profile?.experience,
      }),
      Boolean(imageDataUrl),
    );

  const follow = (prompt: string) => void run(buildChartMentorFollowupPrompt(prompt), Boolean(imageDataUrl));

  const onPick = async (file?: File | null) => {
    if (!file) return;
    try {
      const prepared = await prepareChartImageForAi(file);
      setImageDataUrl(prepared.dataUrl);
      setPreviewName(prepared.fileName);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not read screenshot');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="wm-chart">
      <div className="wm-chart__head">
        <p className="wm-learn__eyebrow">
          <Sparkles className="h-3 w-3" />
          Module 2 · Wolf AI Chart Mentor
        </p>
        <h2 className="wm-learn__title">Educational chart read</h2>
        <p className="wm-learn__lead">
          Reasoning + dual scenarios + blackboard. Confirmation / invalidation Areas of Interest — never trade
          orders.
        </p>
      </div>

      <div className="wm-chart__actions">
        <button type="button" className="wm-learn__cta wm-chart__analyze" onClick={analyze} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {busy ? 'Analyzing…' : 'Analyze open chart'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={MASTER_AI_IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        <button
          type="button"
          className="wm-learn__chip"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Screenshot
        </button>
        {imageDataUrl ? (
          <button
            type="button"
            className="wm-learn__chip wm-learn__chip--on"
            onClick={() => {
              setImageDataUrl(null);
              setPreviewName('');
            }}
          >
            <ImageUp className="h-3.5 w-3.5" />
            {previewName || 'Image attached'} · clear
          </button>
        ) : null}
      </div>

      {parsed?.confidence &&
      (parsed.confidence.structure != null ||
        parsed.confidence.liquidity != null ||
        parsed.confidence.trend != null ||
        parsed.confidence.overall) ? (
        <div className="wm-chart__confidence">
          <div className="wm-learn__label">Evidence confidence (not win-rate)</div>
          <ConfidenceBar label="Structure" value={parsed.confidence.structure} />
          <ConfidenceBar label="Liquidity" value={parsed.confidence.liquidity} />
          <ConfidenceBar label="Trend" value={parsed.confidence.trend} />
          {parsed.confidence.overall ? (
            <p className="wm-chart__overall">
              Overall: <b>{parsed.confidence.overall}</b>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={`wm-learn__note wm-chart__note ${busy ? 'wm-learn__note--busy' : ''}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin wm-learn__spin" /> : null}
        <ChatMarkdown text={note} />
      </div>

      <div className="wm-chart__follow">
        <span className="wm-learn__label">Ask the mentor</span>
        <div className="wm-learn__chips">
          {CHART_MENTOR_FOLLOWUPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="wm-learn__chip"
              disabled={busy}
              onClick={() => follow(c.prompt)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {related ? (
        <div className="wm-chart__related">
          <BookOpen className="h-4 w-4" />
          <div>
            <p className="wm-chart__related-title">
              Related Module 1 · Level {related.levelId}: {related.title}
            </p>
            <p className="wm-learn__lead">Deepen: {related.reason}</p>
          </div>
          <button
            type="button"
            className="wm-learn__chip wm-learn__chip--on"
            onClick={() => {
              if (relatedUnlocked) {
                onOpenCurriculumLevel(related.levelId);
                return;
              }
              setNote(
                (prev) =>
                  `${prev}\n\n---\nModule 1 Level ${related.levelId} (${related.title}) abhi locked hai. Pehle earlier level quizzes pass karo — Curriculum tab se.`,
              );
            }}
            title={relatedUnlocked ? 'Open curriculum lesson' : 'Level locked — finish earlier quizzes first'}
          >
            {relatedUnlocked ? 'Open lesson' : 'Locked — tip'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
