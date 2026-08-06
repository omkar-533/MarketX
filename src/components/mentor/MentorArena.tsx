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
  buildPlan,
  loadEmpireScenario,
  resolveEmpireRound,
  type EmpireBar,
  type EmpireResolve,
  type EmpireScenario,
  type PlanAnswers,
  type TradePlan,
} from '../../services/deskEmpireReplay';
import type { DetectiveCard } from '../../services/mentorDrills';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import DeskEmpireChart from './DeskEmpireChart';

type Phase = 'lobby' | 'play' | 'plan' | 'resolve' | 'result' | 'shop' | 'garage';

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

const STEP_SECONDS = 22;

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
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<PlanAnswers>({});
  const [livePlan, setLivePlan] = useState<TradePlan | null>(null);
  const [liveR, setLiveR] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(STEP_SECONDS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmpireResolve | null>(null);
  const [shopFilter, setShopFilter] = useState<ShopCategory | 'all'>('all');
  const [buyMsg, setBuyMsg] = useState('');
  const tickRef = useRef<number | null>(null);
  const deadlineRef = useRef(0);

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
  const step = scenario?.steps[stepIdx] ?? null;

  // Once entry/stop/RR are locked, draw the ticket on the chart so the last
  // question (management) is answered while looking at the real risk picture.
  const previewPlan = useMemo(() => {
    if (!scenario || phase !== 'plan') return null;
    if (!answers.bias || answers.bias === 'skip' || !answers.stop || !answers.rr) return null;
    return buildPlan(scenario, answers);
  }, [scenario, phase, answers]);

  /* ---------------- session ---------------- */

  const startSession = useCallback(async () => {
    if (empire.bank < STAKE_OPTIONS[0]) {
      setBuyMsg('Bank low — chhota stake lo ya shop me kam kharcho.');
      return;
    }
    setLoading(true);
    setResult(null);
    setAnswers({});
    setStepIdx(0);
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
          setTimeLeft(STEP_SECONDS);
          setPhase('plan');
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
    (finalAnswers: PlanAnswers) => {
      if (!scenario) return;
      // Even a NO TRADE round replays the tape — dekhna zaroori hai ki skip sahi tha ya nahi.
      const skipped = finalAnswers.bias === 'skip';
      const plan = skipped ? null : buildPlan(scenario, finalAnswers);
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
          const res = resolveEmpireRound(scenario, finalAnswers, stake, empire.streak);
          setResult(res);
          setEmpire(applyRoundPnl(res.pnl, ownerKey));
          playArenaSfx(res.won ? 'chest' : 'miss');
          setPhase('result');
          teachRef.current(
            [
              `[DESK EMPIRE] ${scenario.symbol} ${scenario.interval} —`,
              skipped
                ? 'student ne NO TRADE chuna.'
                : `${plan?.side.toUpperCase()} plan, RR 1:${plan?.rr}, result ${res.headline}, ${res.rMultiple.toFixed(2)}R.`,
              `Checklist edge ${res.edgePct}% (grade ${res.grade}).`,
              'Do line me hype + ek process correction do. Koi Entry/SL/Target advice mat do.',
            ].join(' '),
          );
        }
      }, 95);
    },
    [scenario, stake, ownerKey, empire.streak],
  );

  const answerStep = useCallback(
    (optionId: string) => {
      if (!scenario || !step || phase !== 'plan') return;
      const next: PlanAnswers = { ...answers, [step.key]: optionId };
      setAnswers(next);
      const correct = optionId === step.bestId;
      playArenaSfx(correct ? 'combo' : 'hit');

      if (optionId === 'skip' && step.key === 'bias') {
        runResolve(next);
        return;
      }
      if (stepIdx + 1 >= scenario.steps.length) {
        runResolve(next);
        return;
      }
      setStepIdx(stepIdx + 1);
    },
    [scenario, step, phase, answers, stepIdx, runResolve],
  );

  /* ---------------- step timer ---------------- */

  const answerRef = useRef(answerStep);
  useEffect(() => {
    answerRef.current = answerStep;
  });

  useEffect(() => {
    if (phase !== 'plan' || !step) return undefined;
    deadlineRef.current = Date.now() + STEP_SECONDS * 1000;
    setTimeLeft(STEP_SECONDS);
    const id = window.setInterval(() => {
      const left = Math.ceil((deadlineRef.current - Date.now()) / 1000);
      setTimeLeft(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(id);
        answerRef.current(step.options[0].id);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, step, stepIdx]);

  /* ---------------- shop ---------------- */

  const onBuy = (item: ShopItem) => {
    const next = buyShopItem(item.id, ownerKey);
    if (!next) {
      setBuyMsg(empire.inventory.includes(item.id) ? 'Already owned.' : 'Desk cash kam hai.');
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
              Real TradingView history chalti hai → freeze → pura pre-trade checklist (bias, entry,
              SL, RR, management) → tape resolve → cash → luxury
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
                <small>replay → freeze → 6-step plan → simulated result</small>
              </span>
            </button>

            <div className="wm-empire__checklist-peek">
              {['Bias', 'Entry model', 'Stop', 'RR', 'Management', 'Context'].map((c, i) => (
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
                    ? `FROZEN · PLAN ${stepIdx + 1}/${scenario?.steps.length ?? 6}`
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
              plan={phase === 'resolve' ? livePlan : previewPlan}
              entryLine={phase === 'plan' && !previewPlan ? scenario?.entry : null}
              showLevels={phase !== 'play'}
              pulse={phase === 'plan'}
              liveR={phase === 'resolve' ? liveR : null}
            />

            {phase === 'plan' && scenario && step ? (
              <div className="wm-empire__decide">
                <div className="wm-empire__steps">
                  {scenario.steps.map((s, i) => (
                    <span
                      key={`${s.key}-${i}`}
                      className={i < stepIdx ? 'done' : i === stepIdx ? 'on' : ''}
                    />
                  ))}
                  <em className={timeLeft <= 5 ? 'hot' : ''}>{timeLeft}s</em>
                </div>
                <div
                  className="wm-empire__timerbar"
                  style={{ ['--p' as string]: `${(timeLeft / STEP_SECONDS) * 100}%` }}
                />

                <p className="wm-empire__topic">{step.topic}</p>
                <p className="wm-empire__ask">{step.question}</p>
                <div className="wm-empire__hints">
                  <span className="key">{step.hint}</span>
                  {scenario.hints.slice(0, 3).map((h, i) => (
                    <span key={`${i}-${h}`}>{h}</span>
                  ))}
                </div>

                <div className={`wm-empire__opts ${step.options.length > 3 ? 'four' : ''}`}>
                  {step.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={`wm-empire__opt ${step.key === 'bias' ? `bias-${o.id}` : ''}`}
                      onClick={() => answerStep(o.id)}
                    >
                      <b>{o.label}</b>
                      {o.sub ? <small>{o.sub}</small> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {phase === 'play' ? (
              <p className="wm-empire__running">Tape padho — freeze aa raha hai…</p>
            ) : null}

            {phase === 'resolve' && !livePlan ? (
              <p className="wm-empire__running">
                NO TRADE — dekhte hain skip sahi tha ya nahi…
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
                    : 'Risk par kuch gaya hi nahi'}
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
              <p className="wm-empire__empty">Abhi khali hai — shop se pehli flex item lo.</p>
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
