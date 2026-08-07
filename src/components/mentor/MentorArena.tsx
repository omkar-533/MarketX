import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Car,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Package,
  Play,
  ShoppingBag,
  Target,
  Watch,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { playArenaSfx } from '../../services/mentorArena';
import {
  STAKE_OPTIONS,
  SHOP_CATALOG,
  applyRoundPnl,
  buyShopItem,
  formatDeskCash,
  loadDeskEmpire,
  ownedItems,
  type DeskEmpireState,
  type ShopCategory,
  type ShopItem,
} from '../../services/deskEmpire';
import {
  buildPlanFromDraft,
  defaultDraftLevels,
  loadEmpireScenario,
  resolveEmpireRound,
  type EmpireBar,
  type EmpireResolve,
  type EmpireScenario,
  type EmpireSide,
  type PlanAnswers,
  type TradePlan,
} from '../../services/deskEmpireReplay';
import type { DetectiveCard } from '../../services/mentorDrills';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import DeskEmpireChart, { type DraftLevels } from './DeskEmpireChart';

type Phase = 'lobby' | 'play' | 'plan' | 'resolve' | 'result' | 'shop' | 'garage';
type PlanStage = 'bias' | 'tools' | 'manage';
type DragKey = 'entry' | 'stop' | 'target';

type MentorArenaProps = {
  ownerKey: string;
  detective: DetectiveCard | null;
  studentName: string;
  onOpenCurriculum: () => void;
  onOpenLab: () => void;
  onRoundTeach: (summary: string) => void;
  onChartMarks: (levels: ChartLevel[], shapes: ChartShape[]) => void;
  onPlayingChange?: (playing: boolean) => void;
};

function catIcon(cat: ShopCategory) {
  if (cat === 'car') return Car;
  if (cat === 'property') return Building2;
  if (cat === 'watch') return Watch;
  return Gauge;
}

export default function MentorArena({
  ownerKey,
  detective,
  studentName,
  onOpenCurriculum,
  onOpenLab,
  onRoundTeach,
  onChartMarks,
  onPlayingChange,
}: MentorArenaProps) {
  const [empire, setEmpire] = useState<DeskEmpireState>(() => loadDeskEmpire(ownerKey));
  const [phase, setPhase] = useState<Phase>('lobby');
  const [scenario, setScenario] = useState<EmpireScenario | null>(null);
  const [bars, setBars] = useState<EmpireBar[]>([]);
  const [stake, setStake] = useState<number>(STAKE_OPTIONS[1]);
  const [planStage, setPlanStage] = useState<PlanStage>('bias');
  const [answers, setAnswers] = useState<PlanAnswers>({});
  const [draft, setDraft] = useState<DraftLevels | null>(null);
  const [activeTool, setActiveTool] = useState<DragKey>('entry');
  const [livePlan, setLivePlan] = useState<TradePlan | null>(null);
  const [liveR, setLiveR] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmpireResolve | null>(null);
  const [shopFilter, setShopFilter] = useState<ShopCategory | 'all'>('all');
  const [buyMsg, setBuyMsg] = useState('');
  const tickRef = useRef<number | null>(null);

  // The parent passes fresh inline callbacks on every render; keeping them in refs
  // stops effects from re-firing (and re-marking the chart) in a loop.
  const marksRef = useRef(onChartMarks);
  const teachRef = useRef(onRoundTeach);
  const playingCbRef = useRef(onPlayingChange);
  useEffect(() => {
    marksRef.current = onChartMarks;
    teachRef.current = onRoundTeach;
    playingCbRef.current = onPlayingChange;
  });

  useEffect(() => {
    setEmpire(loadDeskEmpire(ownerKey));
  }, [ownerKey]);

  const playing = phase === 'play' || phase === 'plan' || phase === 'resolve';
  useEffect(() => {
    playingCbRef.current?.(playing);
  }, [playing]);

  useEffect(
    () => () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!scenario || phase === 'lobby' || phase === 'shop' || phase === 'garage') {
      marksRef.current([], []);
      return;
    }
    marksRef.current(
      scenario.levels.slice(0, 5).map((l) => ({ price: l.price, kind: 'pivot' as const, label: l.label })),
      [],
    );
  }, [scenario, phase]);

  const firstName = studentName.split(' ')[0] || 'Trader';
  const biasStep = scenario?.steps.find((s) => s.key === 'bias') ?? null;
  const manageStep = scenario?.steps.find((s) => s.key === 'manage') ?? null;
  const side: EmpireSide | null =
    answers.bias === 'long' || answers.bias === 'short' ? answers.bias : null;

  const draftRr = useMemo(() => {
    if (!draft) return 0;
    const risk = Math.abs(draft.entry - draft.stop);
    if (risk <= 0) return 0;
    return Math.round((Math.abs(draft.target - draft.entry) / risk) * 10) / 10;
  }, [draft]);

  /* ---------------- session ---------------- */

  const startSession = useCallback(async () => {
    if (empire.bank < STAKE_OPTIONS[0]) {
      setBuyMsg('Bank low — use a smaller stake or spend less in the shop.');
      return;
    }
    setLoading(true);
    setResult(null);
    setAnswers({});
    setDraft(null);
    setPlanStage('bias');
    setActiveTool('entry');
    setLivePlan(null);
    setLiveR(null);
    setBuyMsg('');
    playArenaSfx('go');
    try {
      const sc = await loadEmpireScenario(detective);
      setScenario(sc);
      setPhase('play');
      const full = sc.visible;
      let i = Math.max(30, Math.floor(full.length * 0.72));
      setBars(full.slice(0, i));
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => {
        i += 1;
        setBars(full.slice(0, Math.min(i, full.length)));
        if (i >= full.length) {
          if (tickRef.current) window.clearInterval(tickRef.current);
          tickRef.current = null;
          setBars(full);
          playArenaSfx('wave');
          setPhase('plan');
          setPlanStage('bias');
        }
      }, 85);
    } catch {
      setPhase('lobby');
    } finally {
      setLoading(false);
    }
  }, [detective, empire.bank]);

  /* ---------------- resolve ---------------- */

  const runResolve = useCallback(
    (finalAnswers: PlanAnswers, planOverride: TradePlan | null) => {
      if (!scenario) return;
      const skipped = finalAnswers.bias === 'skip';
      const plan = skipped ? null : planOverride;
      setLivePlan(plan);
      setPhase('resolve');
      playArenaSfx('hit');

      const base = scenario.visible;
      const fut = scenario.future;
      const dir = plan?.side === 'short' ? -1 : 1;
      let j = 0;
      setBars([...base]);
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => {
        j += 1;
        const slice = fut.slice(0, j);
        setBars([...base, ...slice]);
        if (plan) {
          const px = slice.at(-1)?.close ?? plan.entryPrice;
          setLiveR(((px - plan.entryPrice) * dir) / Math.max(1e-9, plan.risk));
        }
        if (j >= fut.length) {
          if (tickRef.current) window.clearInterval(tickRef.current);
          tickRef.current = null;
          const res = resolveEmpireRound(scenario, finalAnswers, stake, empire.streak, plan);
          setResult(res);
          setEmpire(applyRoundPnl(res.pnl, ownerKey));
          playArenaSfx(res.won ? 'chest' : 'miss');
          setPhase('result');
          teachRef.current(
            [
              `[DESK EMPIRE] ${scenario.symbol} ${scenario.interval} —`,
              skipped
                ? 'student chose NO TRADE.'
                : `${plan?.side.toUpperCase()} plan, RR 1:${plan?.rr}, result ${res.headline}, ${res.rMultiple.toFixed(2)}R.`,
              `Checklist edge ${res.edgePct}% (grade ${res.grade}).`,
              'Two lines of hype plus one process correction. Do not give Entry/SL/Target advice.',
            ].join(' '),
          );
        }
      }, 95);
    },
    [scenario, stake, ownerKey, empire.streak],
  );

  const pickBias = useCallback(
    (optionId: string) => {
      if (!scenario || phase !== 'plan' || planStage !== 'bias') return;
      const next: PlanAnswers = { ...answers, bias: optionId };
      setAnswers(next);
      playArenaSfx(optionId === biasStep?.bestId ? 'combo' : 'hit');
      if (optionId === 'skip') {
        runResolve(next, null);
        return;
      }
      const sidePick = optionId as EmpireSide;
      setDraft(defaultDraftLevels(scenario, sidePick));
      setActiveTool('entry');
      setPlanStage('tools');
    },
    [scenario, phase, planStage, answers, biasStep?.bestId, runResolve],
  );

  const lockTools = useCallback(() => {
    if (!scenario || !draft || !side) return;
    const manage = answers.manage ?? manageStep?.bestId ?? 'fixed';
    const plan = buildPlanFromDraft(scenario, side, draft, manage);
    const next: PlanAnswers = {
      ...answers,
      bias: side,
      entry: 'market',
      stop: 'structure',
      rr: String(Math.min(5, Math.max(1, Math.round(plan.rr)))),
      manage,
    };
    setAnswers(next);
    playArenaSfx('combo');
    if (manageStep) setPlanStage('manage');
    else runResolve(next, plan);
  }, [scenario, draft, side, answers, manageStep, runResolve]);

  const pickManage = useCallback(
    (optionId: string) => {
      if (!scenario || !draft || !side || planStage !== 'manage') return;
      const next: PlanAnswers = { ...answers, manage: optionId };
      setAnswers(next);
      const plan = buildPlanFromDraft(scenario, side, draft, optionId);
      playArenaSfx(optionId === manageStep?.bestId ? 'combo' : 'hit');
      runResolve(next, plan);
    },
    [scenario, draft, side, planStage, answers, manageStep?.bestId, runResolve],
  );

  const onBuy = (item: ShopItem) => {
    const next = buyShopItem(item.id, ownerKey);
    if (!next) {
      setBuyMsg(empire.inventory.includes(item.id) ? 'Already owned.' : 'Not enough desk cash.');
      playArenaSfx('miss');
      return;
    }
    setEmpire(next);
    setBuyMsg(`Owned: ${item.name}`);
    playArenaSfx('star');
  };

  const garage = ownedItems(empire);
  const catalog = useMemo(
    () => (shopFilter === 'all' ? SHOP_CATALOG : SHOP_CATALOG.filter((x) => x.category === shopFilter)),
    [shopFilter],
  );
  const netWorth = useMemo(
    () => empire.bank + garage.reduce((s, i) => s + i.price, 0),
    [empire.bank, garage],
  );

  const showHeader = phase === 'lobby' || phase === 'shop' || phase === 'garage' || phase === 'result';

  return (
    <div className={`wm-arena wm-empire ${playing ? 'wm-arena--live wm-arena--playing wm-empire--play' : ''}`}>
      {showHeader ? (
        <div className="wm-empire__top">
          <div>
            <p className="wm-arena__eyebrow">Wolf Desk Empire</p>
            <h2 className="wm-arena__title">
              {firstName}, <span>run the desk</span>
            </h2>
            <p className="wm-arena__lead">
              Chart freeze → bias → drag Entry / SL / Target on chart → tape resolves → cash
            </p>
          </div>
          <div className="wm-empire__wallet">
            <div>
              <em>BANK</em>
              <b>{formatDeskCash(empire.bank)}</b>
            </div>
            <div>
              <em>NET WORTH</em>
              <b>{formatDeskCash(netWorth)}</b>
            </div>
            <div>
              <em>STREAK</em>
              <b>{empire.streak}</b>
            </div>
            <div>
              <em>W / R</em>
              <b>
                {empire.wins}/{empire.rounds}
              </b>
            </div>
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {phase === 'lobby' ? (
          <motion.div
            key="lobby"
            className="wm-arena__panel wm-empire__lobby"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="wm-empire__stake">
              <p>Risk per trade (1R)</p>
              <div className="wm-empire__stake-row">
                {STAKE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`wm-empire__stake-btn ${stake === s ? 'on' : ''}`}
                    disabled={s > empire.bank}
                    onClick={() => setStake(s)}
                  >
                    {formatDeskCash(s)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="wm-arena__play"
              onClick={() => void startSession()}
              disabled={loading || empire.bank < STAKE_OPTIONS[0]}
            >
              <Play className="h-5 w-5" />
              <span>
                <strong>{loading ? 'PULLING HISTORY…' : 'START SESSION'}</strong>
                <small>replay → analyze chart → drag Entry/SL/TP</small>
              </span>
            </button>

            <div className="wm-empire__checklist-peek">
              {['Bias', 'Drag Entry', 'Drag SL', 'Drag Target', 'Manage'].map((c, i) => (
                <span key={c}>
                  <b>{i + 1}</b>
                  {c}
                </span>
              ))}
            </div>

            <div className="wm-empire__lobby-actions">
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('shop')}>
                <ShoppingBag className="h-3.5 w-3.5" />
                Luxury Shop
              </button>
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('garage')}>
                <Package className="h-3.5 w-3.5" />
                Garage ({garage.length})
              </button>
              <button type="button" className="wm-arena__chip" onClick={onOpenCurriculum}>
                <Target className="h-3.5 w-3.5" />
                Curriculum
              </button>
              <button type="button" className="wm-arena__chip" onClick={onOpenLab}>
                <RotateCcw className="h-3.5 w-3.5" />
                Lab
              </button>
            </div>
            {buyMsg ? <p className="wm-empire__msg">{buyMsg}</p> : null}
          </motion.div>
        ) : null}

        {phase === 'play' || phase === 'plan' || phase === 'resolve' ? (
          <motion.div
            key="session"
            className="wm-empire__stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="wm-empire__session-hud">
              <span>
                {scenario?.symbol} · {scenario?.interval}
              </span>
              <span className={phase === 'plan' ? 'is-frozen' : ''}>
                {phase === 'play'
                  ? 'TAPE RUNNING…'
                  : phase === 'plan'
                    ? planStage === 'bias'
                      ? 'FROZEN · READ CHART → BIAS'
                      : planStage === 'tools'
                        ? 'FROZEN · DRAG ENTRY / SL / TP'
                        : 'FROZEN · MANAGEMENT'
                    : 'POSITION LIVE…'}
              </span>
              <span>
                1R = {formatDeskCash(stake)}
                {empire.streak > 0 ? ` · streak ×${(1 + Math.min(0.75, empire.streak * 0.15)).toFixed(2)}` : ''}
              </span>
            </div>

            <DeskEmpireChart
              bars={bars}
              scenario={scenario}
              plan={phase === 'resolve' ? livePlan : null}
              draft={phase === 'plan' && planStage !== 'bias' ? draft : null}
              onDraftChange={setDraft}
              activeTool={activeTool}
              onActiveToolChange={setActiveTool}
              editable={phase === 'plan' && planStage === 'tools'}
              showLevels={phase !== 'play'}
              pulse={phase === 'plan' && planStage === 'bias'}
              liveR={phase === 'resolve' ? liveR : null}
            />

            {phase === 'plan' && planStage === 'bias' && biasStep ? (
              <div className="wm-empire__decide wm-empire__decide--compact">
                <p className="wm-empire__topic">{biasStep.topic}</p>
                <p className="wm-empire__ask">Read the chart — no timer. What is your bias?</p>
                <div className="wm-empire__hints">
                  {scenario?.hints.slice(0, 4).map((h, i) => (
                    <span key={`${i}-${h}`}>{h}</span>
                  ))}
                </div>
                <div className="wm-empire__opts">
                  {biasStep.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={`wm-empire__opt bias-${o.id}`}
                      onClick={() => pickBias(o.id)}
                    >
                      <b>{o.label}</b>
                      {o.sub ? <small>{o.sub}</small> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {phase === 'plan' && planStage === 'tools' && draft ? (
              <div className="wm-empire__tools">
                <div className="wm-empire__tool-row">
                  {(
                    [
                      ['entry', 'ENTRY', '#f0b90b'],
                      ['stop', 'SL', '#ef5350'],
                      ['target', 'TARGET', '#26a69a'],
                    ] as const
                  ).map(([id, label, color]) => (
                    <button
                      key={id}
                      type="button"
                      className={`wm-empire__tool ${activeTool === id ? 'on' : ''}`}
                      style={{ ['--tool' as string]: color }}
                      onClick={() => setActiveTool(id)}
                    >
                      {label}
                      <em>
                        {(id === 'entry'
                          ? draft.entry
                          : id === 'stop'
                            ? draft.stop
                            : draft.target
                        ).toFixed(2)}
                      </em>
                    </button>
                  ))}
                  <span className="wm-empire__tool-rr">1:{draftRr || '—'}</span>
                </div>
                <button type="button" className="wm-empire__lock" onClick={lockTools}>
                  Lock plan & continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {phase === 'plan' && planStage === 'manage' && manageStep ? (
              <div className="wm-empire__decide wm-empire__decide--compact">
                <p className="wm-empire__topic">{manageStep.topic}</p>
                <p className="wm-empire__ask">{manageStep.question}</p>
                <div className={`wm-empire__opts ${manageStep.options.length > 3 ? 'four' : ''}`}>
                  {manageStep.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="wm-empire__opt"
                      onClick={() => pickManage(o.id)}
                    >
                      <b>{o.label}</b>
                      {o.sub ? <small>{o.sub}</small> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {phase === 'play' ? (
              <p className="wm-empire__running">Reading the tape — freeze incoming…</p>
            ) : null}

            {phase === 'resolve' && !livePlan ? (
              <p className="wm-empire__running">
                NO TRADE — checking whether the skip was correct…
              </p>
            ) : null}

            {phase === 'resolve' && livePlan ? (
              <div className="wm-empire__ticket">
                <span className={livePlan.side === 'long' ? 'long' : 'short'}>
                  {livePlan.side.toUpperCase()}
                </span>
                <span>Entry {livePlan.entryPrice.toFixed(2)}</span>
                <span>SL {livePlan.stopPrice.toFixed(2)}</span>
                <span>TP {livePlan.targetPrice.toFixed(2)}</span>
                <span>1:{livePlan.rr}</span>
                <span className={(liveR ?? 0) >= 0 ? 'long' : 'short'}>
                  {(liveR ?? 0) >= 0 ? '+' : ''}
                  {(liveR ?? 0).toFixed(2)}R
                </span>
              </div>
            ) : null}
          </motion.div>
        ) : null}

        {phase === 'result' && result ? (
          <motion.div
            key="result"
            className="wm-arena__panel wm-empire__result"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="wm-empire__result-head">
              <div className={`wm-empire__grade g-${result.grade}`}>
                <b>{result.grade}</b>
                <em>{result.edgePct}% edge</em>
              </div>
              <div>
                <p className="wm-empire__headline">{result.headline}</p>
                <div className={`wm-empire__pnl ${result.pnl >= 0 ? 'win' : 'lose'}`}>
                  {result.pnl >= 0 ? '+' : ''}
                  {formatDeskCash(result.pnl)}
                </div>
                <p className="wm-empire__meta">
                  {result.filled
                    ? `${result.rMultiple >= 0 ? '+' : ''}${result.rMultiple.toFixed(2)}R · MFE ${result.mfeR.toFixed(1)}R · MAE ${result.maeR.toFixed(1)}R`
                    : 'Nothing was put at risk'}
                  {result.processBonus ? ` · process bonus ${formatDeskCash(result.processBonus)}` : ''}
                  {result.streakMult > 1 && result.pnl > 0
                    ? ` · streak ×${result.streakMult.toFixed(2)}`
                    : ''}
                  {' · bank '}
                  {formatDeskCash(empire.bank)}
                </p>
              </div>
            </div>

            <p className="wm-empire__teach">{result.teach}</p>

            <div className="wm-empire__debrief">
              {result.reviews.map((r, i) => (
                <div key={`${r.key}-${i}`} className={`wm-empire__review ${r.correct ? 'ok' : 'no'}`}>
                  <div className="wm-empire__review-head">
                    {r.correct ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    <b>{r.topic}</b>
                    <span>
                      {r.picked}
                      {r.correct ? '' : ` → ${r.best}`}
                    </span>
                  </div>
                  <p>{r.why}</p>
                </div>
              ))}
            </div>

            <div className="wm-arena__result-actions">
              <button
                type="button"
                className="wm-arena__play wm-arena__play--sm"
                onClick={() => void startSession()}
              >
                <Play className="h-4 w-4" />
                Next Tape
              </button>
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('shop')}>
                <ShoppingBag className="h-3.5 w-3.5" />
                Spend in Shop
              </button>
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('lobby')}>
                Lobby
              </button>
            </div>
          </motion.div>
        ) : null}

        {phase === 'shop' ? (
          <motion.div
            key="shop"
            className="wm-arena__panel wm-empire__shop"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="wm-empire__shop-head">
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('lobby')}>
                ← Lobby
              </button>
              <b>Luxury Shop · {formatDeskCash(empire.bank)}</b>
            </div>
            <div className="wm-empire__filters">
              {(['all', 'watch', 'car', 'property', 'desk'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`wm-empire__filter ${shopFilter === f ? 'on' : ''}`}
                  onClick={() => setShopFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="wm-empire__grid">
              {catalog.map((item) => {
                const owned = empire.inventory.includes(item.id);
                const Icon = catIcon(item.category);
                return (
                  <div
                    key={item.id}
                    className={`wm-empire__card ${owned ? 'owned' : ''}`}
                    style={{ ['--tone' as string]: item.tone }}
                  >
                    <div className="wm-empire__card-art">
                      <Icon className="h-8 w-8" />
                    </div>
                    <b>{item.name}</b>
                    <span>{item.blurb}</span>
                    <div className="wm-empire__card-foot">
                      <em>{formatDeskCash(item.price)}</em>
                      <button
                        type="button"
                        disabled={owned || empire.bank < item.price}
                        onClick={() => onBuy(item)}
                      >
                        {owned ? 'Owned' : 'Buy'}
                        {!owned ? <ChevronRight className="h-3.5 w-3.5" /> : null}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {buyMsg ? <p className="wm-empire__msg">{buyMsg}</p> : null}
          </motion.div>
        ) : null}

        {phase === 'garage' ? (
          <motion.div
            key="garage"
            className="wm-arena__panel wm-empire__shop"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="wm-empire__shop-head">
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('lobby')}>
                ← Lobby
              </button>
              <b>Garage · net worth {formatDeskCash(netWorth)}</b>
            </div>
            {garage.length === 0 ? (
              <p className="wm-empire__empty">Empty for now — buy your first flex item in the shop.</p>
            ) : (
              <div className="wm-empire__grid">
                {garage.map((item) => {
                  const Icon = catIcon(item.category);
                  return (
                    <div
                      key={item.id}
                      className="wm-empire__card owned"
                      style={{ ['--tone' as string]: item.tone }}
                    >
                      <div className="wm-empire__card-art">
                        <Icon className="h-8 w-8" />
                      </div>
                      <b>{item.name}</b>
                      <span>{item.blurb}</span>
                      <div className="wm-empire__card-foot">
                        <em>Owned</em>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" className="wm-arena__chip" onClick={() => setPhase('shop')}>
              <ShoppingBag className="h-3.5 w-3.5" />
              Open Shop
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
