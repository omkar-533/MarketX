/**
 * MY SETUPS / STRATEGY LAB — teach WOLF what to hunt.
 * Manual builder + templates + Teach WOLF (controlled NL → structured conditions).
 * Strategies are private (localStorage). Scanner uses structured conditions only.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Copy,
  Pause,
  Play,
  Plus,
  ScanSearch,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  CONDITION_CATEGORIES,
  CONDITION_REGISTRY,
  getConditionDef,
  type ConditionCategory,
  type ConditionDirection,
} from '../../../services/strategy/conditionRegistry';
import { STRATEGY_TEMPLATES, STRATEGY_TEMPLATE_CATEGORIES, filterStrategyTemplates } from '../../../services/strategy/strategyTemplates';
import type { ScreenerCategoryFilter } from '../../../services/strategy/strategyTemplates';
import {
  createStrategyFromParts,
  deleteStrategy,
  duplicateStrategy,
  loadStrategies,
  newConditionId,
  setStrategyStatus,
  strategyFromTemplate,
  upsertStrategy,
} from '../../../services/strategy/strategyStore';
import { formatCondition, formatStrategyPreview, formatTimeframeStack } from '../../../services/strategy/strategyDisplay';
import { validateStrategyDraft } from '../../../services/strategy/strategyValidate';
import { requestStrategyScan } from '../../../services/strategy/strategyBridge';
import {
  parseStrategyFromText,
  type ClarificationQuestion,
  type ParsedStrategyDraft,
} from '../../../services/strategy/strategyParseApi';
import { fetchAiHealth, type AiHealth } from '../../../services/strategy/aiHealth';
import type { StrategyCondition, StrategyDefinition, TimeframeMode } from '../../../services/strategy/strategyTypes';
import type { RadarTimeframe } from '../../../services/radar/radarTypes';

type Props = {
  onScanSetup: () => void;
};

type LabTab = 'list' | 'create' | 'manual' | 'teach' | 'templates';

const ALL_TFS: RadarTimeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];

function emptyCondition(tf: RadarTimeframe): StrategyCondition {
  return {
    id: newConditionId(),
    type: 'LIQUIDITY_SWEEP',
    timeframe: tf,
    direction: 'BULLISH',
  };
}

export default function MySetupsPanel({ onScanSetup }: Props) {
  const [tab, setTab] = useState<LabTab>('list');
  const [strategies, setStrategies] = useState(() => loadStrategies());
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [note, setNote] = useState<string | null>(null);

  // Manual draft
  const [name, setName] = useState('Liquidity Reversal');
  const [description, setDescription] = useState('');
  const [tfMode, setTfMode] = useState<TimeframeMode>('SINGLE');
  const [timeframe, setTimeframe] = useState<RadarTimeframe>('5m');
  const [mtf, setMtf] = useState({
    context: '1h' as RadarTimeframe | '',
    structure: '15m' as RadarTimeframe | '',
    setup: '5m' as RadarTimeframe | '',
    confirmation: '' as RadarTimeframe | '',
  });
  const [conditions, setConditions] = useState<StrategyCondition[]>([
    emptyCondition('15m'),
    { id: newConditionId(), type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'BULLISH' },
  ]);
  const [addCategory, setAddCategory] = useState<ConditionCategory>('LIQUIDITY');

  // Teach WOLF
  const [teachText, setTeachText] = useState('');
  const [teachPhase, setTeachPhase] = useState<
    'idle' | 'understanding' | 'clarify' | 'preview' | 'fail'
  >('idle');
  const [teachMsg, setTeachMsg] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [aiDraft, setAiDraft] = useState<ParsedStrategyDraft | null>(null);
  const [teachClarity, setTeachClarity] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [tplCategory, setTplCategory] = useState<ScreenerCategoryFilter | 'MY'>('ALL');
  const [tplQuery, setTplQuery] = useState('');
  const [tplDetailId, setTplDetailId] = useState<string | null>(null);

  useEffect(() => {
    void fetchAiHealth().then(setAiHealth);
  }, []);

  useEffect(() => {
    if (!tplDetailId) return;
    const el = document.getElementById(`wolf-lab-tpl-${tplDetailId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [tplDetailId]);

  const filteredTemplates = useMemo(() => {
    if (tplCategory === 'MY') return [];
    return filterStrategyTemplates(tplCategory, tplQuery);
  }, [tplCategory, tplQuery]);

  const myLibraryScreeners = useMemo(() => {
    const q = tplQuery.trim().toLowerCase();
    return strategies.filter((s) => {
      if (filter === 'ACTIVE' && s.status !== 'ACTIVE') return false;
      if (filter === 'PAUSED' && s.status !== 'PAUSED') return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.conditions.some((c) => formatCondition(c).toLowerCase().includes(q))
      );
    });
  }, [strategies, filter, tplQuery]);

  const showMyInLibrary = tplCategory === 'ALL' || tplCategory === 'MY';

  const validation = validateStrategyDraft({ name, conditions, timeframe, timeframeMode: tfMode });
  const preview = formatStrategyPreview({
    id: 'draft',
    name,
    description,
    creationMethod: 'MANUAL',
    status: 'ACTIVE',
    timeframeMode: tfMode,
    timeframe,
    timeframes: {
      context: mtf.context || null,
      structure: mtf.structure || null,
      setup: mtf.setup || null,
      confirmation: mtf.confirmation || null,
    },
    conditions,
    logic: { id: 'x', operator: 'AND', conditions },
    version: 1,
    createdAt: 0,
    updatedAt: 0,
  });

  const refresh = (list: StrategyDefinition[]) => setStrategies(list);

  const saveManual = () => {
    const v = validateStrategyDraft({ name, conditions, timeframe, timeframeMode: tfMode });
    if (!v.ok) {
      setNote(v.errors.join(' '));
      return;
    }
    const strat = createStrategyFromParts({
      name,
      description,
      creationMethod: 'MANUAL',
      timeframeMode: tfMode,
      timeframe: tfMode === 'MULTI' ? (mtf.setup as RadarTimeframe) || timeframe : timeframe,
      timeframes:
        tfMode === 'MULTI'
          ? {
              context: mtf.context || null,
              structure: mtf.structure || null,
              setup: mtf.setup || timeframe,
              confirmation: mtf.confirmation || null,
            }
          : {},
      conditions,
    });
    refresh(upsertStrategy(strat));
    setNote(`✓ SETUP SAVED — “${strat.name}” is in WOLF Screeners Library → MY SCREENERS.`);
    setTplCategory('MY');
    setTab('templates');
  };

  const useTemplate = (id: string, scanNow = false) => {
    const tpl = STRATEGY_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    const strat = strategyFromTemplate(tpl);
    refresh(upsertStrategy(strat));
    setNote(`✓ Screener ready — “${strat.name}”.`);
    if (scanNow) {
      requestStrategyScan(strat);
      onScanSetup();
      return;
    }
    setTplCategory('MY');
    setTab('templates');
  };

  const applyAiDraftToManual = (draft: ParsedStrategyDraft) => {
    setName(draft.name);
    setDescription(draft.description || teachText.slice(0, 160));
    setTfMode(draft.timeframeMode);
    setTimeframe(draft.timeframe);
    setMtf({
      context: (draft.timeframes.context as RadarTimeframe) || '',
      structure: (draft.timeframes.structure as RadarTimeframe) || '',
      setup: (draft.timeframes.setup as RadarTimeframe) || draft.timeframe,
      confirmation: (draft.timeframes.confirmation as RadarTimeframe) || '',
    });
    setConditions(
      draft.conditions.map((c) => ({
        ...c,
        id: newConditionId(),
        timeframe: c.timeframe,
      })),
    );
  };

  const runTeachParse = async (nextAnswers: Record<string, string> = answers) => {
    setTeachPhase('understanding');
    setTeachMsg('🐺 WOLF IS UNDERSTANDING…');
    setAiDraft(null);
    try {
      setTeachMsg('Parsing your strategy… Identifying timeframes, conditions, and logic.');
      const result = await parseStrategyFromText(teachText, nextAnswers);
      if (result.clarity === 'UNSUPPORTED') {
        setTeachPhase('fail');
        setTeachMsg(result.message);
        return;
      }
      if (result.clarifications?.length) {
        setClarifications(result.clarifications);
        setTeachPhase('clarify');
        setTeachMsg(result.message || 'I need a bit more detail.');
        return;
      }
      if (!result.ok || !result.strategy?.conditions?.length) {
        setTeachPhase('fail');
        setTeachMsg(
          result.message ||
            "I couldn't confidently translate that strategy into WOLF-supported conditions.",
        );
        return;
      }
      setAiDraft(result.strategy);
      setTeachClarity(result.clarity || 'CLEAR');
      setTeachPhase('preview');
      setTeachMsg('Strategy built.');
    } catch (e) {
      setTeachPhase('fail');
      setTeachMsg(e instanceof Error ? e.message : 'Parse failed.');
    }
  };

  const saveAiDraft = () => {
    if (!aiDraft) return;
    const mapped = aiDraft.conditions.map((c) => ({
      ...c,
      id: newConditionId(),
      timeframe: c.timeframe as RadarTimeframe,
    }));
    const v = validateStrategyDraft({
      name: aiDraft.name,
      conditions: mapped,
      timeframe: aiDraft.timeframe,
      timeframeMode: aiDraft.timeframeMode,
    });
    if (!v.ok) {
      setTeachMsg(v.errors.join(' '));
      return;
    }
    const strat = createStrategyFromParts({
      name: aiDraft.name,
      description: aiDraft.description || teachText.slice(0, 160),
      creationMethod: 'AI_ASSISTED',
      timeframeMode: aiDraft.timeframeMode,
      timeframe: aiDraft.timeframe,
      timeframes: aiDraft.timeframes || {},
      conditions: mapped,
    });
    refresh(upsertStrategy(strat));
    setNote(`✓ SETUP SAVED — “${strat.name}” is in WOLF Screeners Library → MY SCREENERS.`);
    setTplCategory('MY');
    setTab('templates');
    setTeachPhase('idle');
    setAiDraft(null);
  };

  const onScan = (s: StrategyDefinition) => {
    if (s.status !== 'ACTIVE') {
      setNote('Activate the setup before scanning.');
      return;
    }
    requestStrategyScan(s);
    onScanSetup();
  };

  const addCondition = () => {
    const defs = CONDITION_REGISTRY.filter((c) => c.category === addCategory);
    const def = defs[0] || CONDITION_REGISTRY[0];
    setConditions((prev) => [
      ...prev,
      {
        id: newConditionId(),
        type: def.id,
        timeframe: timeframe,
        direction: def.needsDirection ? 'BULLISH' : undefined,
        operator: def.needsValue ? '>=' : undefined,
        value: def.defaultValue,
      },
    ]);
  };

  return (
    <div className="wolf-radar-desk wolf-radar-desk--panel wolf-lab">
      <header className="wolf-radar-desk__header">
        <div className="wolf-radar-desk__brand">
          <div className="wolf-radar-desk__title-row">
            <BookMarked size={18} className="text-gold" />
            <h1>STRATEGY LAB</h1>
            <span className="wolf-lab__badge">MY SETUPS</span>
          </div>
          <p className="wolf-radar-desk__subtitle">
            Create, teach and manage the setups WOLF hunts for.
          </p>
          <p
            className={`wolf-lab__ai-status ${aiHealth?.available ? 'is-on' : 'is-off'}`}
            title={aiHealth?.provider || 'none'}
          >
            WOLF AI · {aiHealth?.available ? `● READY (${(aiHealth.provider || 'ai').toUpperCase()})` : '○ AI BUILDER UNAVAILABLE'}
          </p>
        </div>
        {tab === 'list' && (
          <button type="button" className="wolf-radar-desk__scan-btn" onClick={() => setTab('create')}>
            <Plus size={16} /> CREATE NEW SCREENER
          </button>
        )}
        {tab !== 'list' && (
          <button type="button" className="wolf-radar-desk__scan-btn" onClick={() => setTab('list')}>
            Back to Strategy Lab
          </button>
        )}
      </header>

      {note && <p className="wolf-lab__note">{note}</p>}

      {tab === 'list' && (
        <section className="wolf-lab__empty-hero">
          <h2>STRATEGY LAB</h2>
          <p>
            Create a new screener, or open the library to manage your setups and WOLF predefined
            screeners.
          </p>
          <div className="wolf-lab__method-grid">
            <button type="button" onClick={() => setTab('create')}>
              <strong>+ CREATE NEW SCREENER</strong>
              <span>Build manually, teach WOLF, or start from a template.</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTplCategory('ALL');
                setTab('templates');
              }}
            >
              <strong>WOLF SCREENERS LIBRARY</strong>
              <span>
                {strategies.length
                  ? `${strategies.length} of your screeners · plus WOLF predefined`
                  : 'Browse predefined WOLF screeners'}
              </span>
            </button>
          </div>
        </section>
      )}

      {tab === 'create' && (
        <section className="wolf-lab__create">
          <h2>CREATE NEW SCREENER</h2>
          <p>How do you want to create it?</p>
          <div className="wolf-lab__method-grid">
            <button type="button" onClick={() => setTab('manual')}>
              <strong>1 · BUILD MANUALLY</strong>
              <span>Build using predefined WOLF conditions.</span>
            </button>
            <button type="button" onClick={() => setTab('teach')}>
              <strong>2 · TEACH WOLF</strong>
              <span>
                {aiHealth?.available
                  ? 'Describe your setup in your own words.'
                  : 'AI may be offline — you can still try; fallback to local parse.'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTplCategory('ALL');
                setTab('templates');
              }}
            >
              <strong>3 · USE PREDEFINED SCREENER</strong>
              <span>Open WOLF Screeners Library.</span>
            </button>
          </div>
        </section>
      )}

      {tab === 'templates' && (
        <section className="wolf-lab__templates">
          <h2>WOLF SCREENERS LIBRARY</h2>
          <p className="wolf-radar-desk__subtitle">
            Your screeners and WOLF predefined templates — deterministic filters, AI optional.
          </p>
          <div className="wolf-lab__tpl-toolbar">
            <input
              type="search"
              placeholder="Search screeners…"
              value={tplQuery}
              onChange={(e) => setTplQuery(e.target.value)}
            />
            <div className="wolf-lab__tpl-cats">
              <button
                type="button"
                className={tplCategory === 'ALL' ? 'is-on' : ''}
                onClick={() => setTplCategory('ALL')}
              >
                ALL
              </button>
              <button
                type="button"
                className={tplCategory === 'MY' ? 'is-on' : ''}
                onClick={() => setTplCategory('MY')}
              >
                MY SCREENERS
              </button>
              {STRATEGY_TEMPLATE_CATEGORIES.filter((c) => c !== 'ALL').map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={tplCategory === cat ? 'is-on' : ''}
                  onClick={() => setTplCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            {showMyInLibrary && (
              <div className="wolf-lab__filters">
                {(['ALL', 'ACTIVE', 'PAUSED'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={filter === f ? 'is-on' : ''}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showMyInLibrary && (
            <div className="wolf-lab__library-block">
              <h3 className="wolf-lab__library-heading">MY SCREENERS</h3>
              {!myLibraryScreeners.length ? (
                <p className="wolf-lab__note">
                  No saved screeners yet — create one or use a predefined template.
                </p>
              ) : (
                <div className="wolf-setups__list" aria-label="My screeners">
                  {myLibraryScreeners.map((s) => (
                    <article key={s.id} className="wolf-radar-desk__card wolf-lab__card">
                      <div className="wolf-radar-desk__card-main">
                        <div className="wolf-radar-desk__card-top">
                          <div>
                            <h3>{s.name}</h3>
                            <span className="price">
                              {formatTimeframeStack(s)} · {s.conditions.length} conditions ·{' '}
                              {s.creationMethod.replace('_', ' ')}
                            </span>
                          </div>
                          <span className={`wolf-lab__status ${s.status === 'ACTIVE' ? 'is-on' : ''}`}>
                            {s.status === 'ACTIVE' ? '● ACTIVE' : '○ PAUSED'}
                          </span>
                        </div>
                        <ul className="tags">
                          {s.conditions.slice(0, 6).map((c) => (
                            <li key={c.id}>{formatCondition(c)}</li>
                          ))}
                        </ul>
                        {s.description && <p className="wolf-lab__desc">{s.description}</p>}
                      </div>
                      <div className="wolf-radar-desk__card-actions">
                        <button type="button" className="primary" onClick={() => onScan(s)}>
                          <ScanSearch size={14} /> SCAN
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            refresh(
                              setStrategyStatus(s.id, s.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'),
                            )
                          }
                        >
                          {s.status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}
                          {s.status === 'ACTIVE' ? 'PAUSE' : 'ACTIVATE'}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => refresh(duplicateStrategy(s.id))}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => refresh(deleteStrategy(s.id))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {tplCategory !== 'MY' && (
            <div className="wolf-lab__library-block">
              <h3 className="wolf-lab__library-heading">WOLF PREDEFINED</h3>
              <div className="wolf-lab__tpl-grid">
                {filteredTemplates.map((t) => {
                  const open = tplDetailId === t.id;
                  return (
                    <article
                      key={t.id}
                      id={`wolf-lab-tpl-${t.id}`}
                      className={`wolf-lab__tpl ${open ? 'is-open' : ''}`}
                    >
                      <strong>{t.name}</strong>
                      <em>{t.category}</em>
                      <p>{t.description}</p>
                      <small>
                        {t.conditions.length} conditions ·{' '}
                        {t.timeframeMode === 'MULTI'
                          ? [t.timeframes.context, t.timeframes.structure, t.timeframes.setup]
                              .filter(Boolean)
                              .join(' → ')
                              .toUpperCase() || t.timeframe.toUpperCase()
                          : t.timeframe.toUpperCase()}
                      </small>
                      <div className="wolf-lab__tpl-acts">
                        <button
                          type="button"
                          className={open ? 'is-on' : ''}
                          onClick={() => setTplDetailId(open ? null : t.id)}
                        >
                          {open ? 'HIDE' : 'VIEW'}
                        </button>
                        <button
                          type="button"
                          className="primary"
                          onClick={() => useTemplate(t.id, true)}
                        >
                          USE
                        </button>
                      </div>

                      {open && (
                        <div className="wolf-lab__tpl-detail wolf-lab__tpl-detail--inline">
                          <p>{t.description}</p>
                          <dl>
                            <div>
                              <dt>WHAT IT LOOKS FOR</dt>
                              <dd>{t.explanation.whatItLooksFor}</dd>
                            </div>
                            <div>
                              <dt>WHY IT MATTERS</dt>
                              <dd>{t.explanation.whyItMatters}</dd>
                            </div>
                            <div>
                              <dt>HOW WOLF DETECTS IT</dt>
                              <dd>{t.explanation.howWolfDetects}</dd>
                            </div>
                            <div>
                              <dt>BEST USED FOR</dt>
                              <dd>{t.explanation.bestUsedFor}</dd>
                            </div>
                            <div>
                              <dt>MARKET COMPATIBILITY</dt>
                              <dd>{t.explanation.marketCompatibility}</dd>
                            </div>
                            <div>
                              <dt>LIMITATIONS</dt>
                              <dd>{t.explanation.limitations}</dd>
                            </div>
                          </dl>
                          <ul>
                            {t.conditions.map((c, i) => (
                              <li key={`${c.type}-${i}`}>
                                {formatCondition({ ...c, id: `t${i}` })}
                              </li>
                            ))}
                          </ul>
                          <div className="wolf-radar-desk__card-actions">
                            <button
                              type="button"
                              className="primary"
                              onClick={() => useTemplate(t.id, true)}
                            >
                              USE THIS SCREENER
                            </button>
                            <button type="button" onClick={() => useTemplate(t.id, false)}>
                              SAVE TO MY SCREENERS
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
                {!filteredTemplates.length && (
                  <p className="wolf-lab__note">No predefined screeners match that filter.</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'teach' && (
        <section className="wolf-lab__teach">
          <h2>TEACH WOLF</h2>
          <p className="wolf-radar-desk__subtitle">Explain your setup in your own words.</p>
          <p
            className={`wolf-lab__ai-status ${aiHealth?.available ? 'is-on' : 'is-off'}`}
          >
            {aiHealth?.available
              ? `WOLF AI · ● READY · ${aiHealth.strategyParse?.model || aiHealth.provider || 'model'}`
              : 'WOLF AI · ○ AI BUILDER UNAVAILABLE — try manual or local parse fallback'}
          </p>
          <textarea
            rows={6}
            value={teachText}
            onChange={(e) => {
              setTeachText(e.target.value);
              if (teachPhase !== 'idle' && teachPhase !== 'understanding') {
                setTeachPhase('idle');
                setAiDraft(null);
                setClarifications([]);
              }
            }}
            placeholder='I want WOLF to hunt for… e.g. "I want stocks where the 15 minute previous low is swept, then the 5 minute structure turns bullish and volume expands. The 1 hour trend should also be bullish."'
            disabled={teachPhase === 'understanding'}
          />
          <button
            type="button"
            className="wolf-radar-desk__scan-btn"
            onClick={() => void runTeachParse({})}
            disabled={!teachText.trim() || teachPhase === 'understanding'}
          >
            <Wand2 size={16} /> BUILD MY SETUP
          </button>

          {teachPhase === 'understanding' && (
            <div className="wolf-lab__loading" aria-live="polite">
              <p>{teachMsg}</p>
              <small>Identifying: Timeframes · Conditions · Logic</small>
            </div>
          )}

          {teachPhase === 'clarify' && (
            <div className="wolf-lab__clarify">
              <p className="wolf-lab__note">{teachMsg}</p>
              {clarifications.map((q) => (
                <div key={q.id} className="wolf-lab__clarify-q">
                  <strong>{q.prompt}</strong>
                  <div className="wolf-lab__clarify-opts">
                    {q.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={answers[q.id] === o.id ? 'is-on' : ''}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="wolf-radar-desk__scan-btn"
                disabled={clarifications.some((q) => !answers[q.id])}
                onClick={() => void runTeachParse(answers)}
              >
                CONTINUE
              </button>
            </div>
          )}

          {teachPhase === 'preview' && aiDraft && (
            <div className="wolf-lab__preview">
              <h3>I UNDERSTOOD YOUR SETUP AS</h3>
              {teachClarity && (
                <span className="wolf-lab__clarity">{teachClarity.replace(/_/g, ' ')}</span>
              )}
              <strong>{aiDraft.name}</strong>
              <ul>
                {aiDraft.conditions.map((c, i) => (
                  <li key={`${c.type}-${i}`}>
                    {formatCondition({ ...c, id: `p-${i}` })}
                  </li>
                ))}
              </ul>
              <div className="wolf-radar-desk__card-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    applyAiDraftToManual(aiDraft);
                    setTab('manual');
                  }}
                >
                  EDIT CONDITIONS
                </button>
                <button type="button" className="primary" onClick={saveAiDraft}>
                  SAVE SETUP
                </button>
              </div>
            </div>
          )}

          {teachPhase === 'fail' && (
            <div className="wolf-lab__fail">
              <p className="wolf-lab__note">{teachMsg}</p>
              <div className="wolf-radar-desk__card-actions">
                <button type="button" className="ghost" onClick={() => setTeachPhase('idle')}>
                  EDIT DESCRIPTION
                </button>
                <button type="button" className="primary" onClick={() => setTab('manual')}>
                  BUILD MANUALLY
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'manual' && (
        <section className="wolf-lab__manual">
          <h2>BUILD MANUALLY</h2>
          <div className="wolf-setups__builder">
            <label className="wolf-setups__field">
              <span>SETUP NAME</span>
              <input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="wolf-setups__field">
              <span>DESCRIPTION</span>
              <input value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </label>

            <div className="wolf-lab__tf-mode">
              <span>TIMEFRAME MODE</span>
              <label>
                <input
                  type="radio"
                  checked={tfMode === 'SINGLE'}
                  onChange={() => setTfMode('SINGLE')}
                />
                Single
              </label>
              <label>
                <input type="radio" checked={tfMode === 'MULTI'} onChange={() => setTfMode('MULTI')} />
                Multi-timeframe
              </label>
            </div>

            {tfMode === 'SINGLE' ? (
              <label className="wolf-setups__field">
                <span>TIMEFRAME</span>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as RadarTimeframe)}>
                  {ALL_TFS.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="wolf-lab__mtf">
                <div className="wolf-lab__mtf-flow">
                  {[
                    ['context', 'CONTEXT'],
                    ['structure', 'STRUCTURE'],
                    ['setup', 'SETUP'],
                    ['confirmation', 'CONFIRM'],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <select
                        value={(mtf as Record<string, string>)[key]}
                        onChange={(e) => setMtf((m) => ({ ...m, [key]: e.target.value }))}
                      >
                        <option value="">—</option>
                        {ALL_TFS.map((tf) => (
                          <option key={tf} value={tf}>
                            {tf.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="wolf-lab__mtf-viz">
                  {[mtf.context, mtf.structure, mtf.setup || timeframe, mtf.confirmation]
                    .filter(Boolean)
                    .map((x) => String(x).toUpperCase())
                    .join(' → ') || '—'}
                </p>
              </div>
            )}

            <div className="wolf-setups__conditions">
              <div className="wolf-lab__cond-head">
                <span>CONDITIONS (AND)</span>
                <select
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value as ConditionCategory)}
                >
                  {CONDITION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button type="button" className="ghost" onClick={addCondition}>
                  + ADD CONDITION
                </button>
              </div>

              <div className="wolf-lab__cond-list">
                {conditions.map((c, idx) => {
                  const def = getConditionDef(c.type);
                  const catDefs = CONDITION_REGISTRY.filter((d) => d.category === (def?.category || 'LIQUIDITY'));
                  return (
                    <div key={c.id} className="wolf-lab__cond-row">
                      <select
                        value={c.type}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          const d = getConditionDef(nextType);
                          setConditions((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    type: nextType,
                                    direction: d?.needsDirection ? x.direction || 'BULLISH' : undefined,
                                    operator: d?.needsValue ? x.operator || '>=' : undefined,
                                    value: d?.needsValue ? x.value ?? d.defaultValue : undefined,
                                  }
                                : x,
                            ),
                          );
                        }}
                      >
                        {(catDefs.length ? catDefs : CONDITION_REGISTRY).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                        {!catDefs.find((d) => d.id === c.type) && (
                          <option value={c.type}>{def?.name || c.type}</option>
                        )}
                      </select>
                      <select
                        value={c.timeframe}
                        onChange={(e) =>
                          setConditions((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, timeframe: e.target.value as RadarTimeframe } : x,
                            ),
                          )
                        }
                      >
                        {ALL_TFS.map((tf) => (
                          <option key={tf} value={tf}>
                            {tf.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      {def?.needsDirection && (
                        <select
                          value={c.direction || 'ANY'}
                          onChange={(e) =>
                            setConditions((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, direction: e.target.value as ConditionDirection }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="ANY">Any</option>
                          <option value="BULLISH">Bullish</option>
                          <option value="BEARISH">Bearish</option>
                        </select>
                      )}
                      {def?.needsValue && (
                        <input
                          type="number"
                          step="0.1"
                          value={c.value ?? ''}
                          onChange={(e) =>
                            setConditions((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, value: Number(e.target.value), operator: '>=' } : x,
                              ),
                            )
                          }
                        />
                      )}
                      <button
                        type="button"
                        className="ghost"
                        aria-label="Remove"
                        onClick={() => setConditions((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="wolf-lab__preview">
              <h3>I UNDERSTOOD YOUR SETUP AS</h3>
              <strong>{name || 'Untitled'}</strong>
              <ul>
                {preview.map((line, i) => (
                  <li key={`${line}-${i}`}>{line}</li>
                ))}
              </ul>
              {!validation.ok && (
                <p className="wolf-lab__err">{validation.errors.join(' ')}</p>
              )}
              {validation.warnings.map((w) => (
                <p key={w} className="wolf-lab__warn">
                  {w}
                </p>
              ))}
            </div>

            <div className="wolf-radar-desk__card-actions">
              <button type="button" className="primary" onClick={saveManual} disabled={!validation.ok}>
                SAVE SETUP
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
