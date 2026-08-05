import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Car,
  ChevronRight,
  Gauge,
  Package,
  Play,
  ShoppingBag,
  Target,
  TrendingDown,
  TrendingUp,
  Watch,
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
  loadEmpireScenario,
  resolveEmpireCall,
  type EmpireBar,
  type EmpireScenario,
  type EmpireSide,
} from '../../services/deskEmpireReplay';
import type { DetectiveCard } from '../../services/mentorDrills';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import DeskEmpireChart from './DeskEmpireChart';

type Phase = 'lobby' | 'play' | 'decide' | 'resolve' | 'result' | 'shop' | 'garage';

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
  const [side, setSide] = useState<EmpireSide | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof resolveEmpireCall> | null>(null);
  const [shopFilter, setShopFilter] = useState<ShopCategory | 'all'>('all');
  const [buyMsg, setBuyMsg] = useState('');

  useEffect(() => {
    setEmpire(loadDeskEmpire(ownerKey));
  }, [ownerKey]);

  const playing = phase === 'play' || phase === 'decide' || phase === 'resolve';
  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  useEffect(() => {
    if (!scenario || phase === 'lobby' || phase === 'shop' || phase === 'garage') {
      onChartMarks([], []);
      return;
    }
    const levels: ChartLevel[] = scenario.levels.map((l) => ({
      price: l.price,
      kind: 'pivot' as const,
      label: l.label,
    }));
    onChartMarks(levels.slice(0, 6), []);
  }, [scenario, phase, onChartMarks]);

  const firstName = studentName.split(' ')[0] || 'Trader';

  const startSession = async () => {
    if (empire.bank < STAKE_OPTIONS[0]) {
      setBuyMsg('Bank low — smaller stakes or keep collecting.');
      return;
    }
    setLoading(true);
    setResult(null);
    setSide(null);
    setBuyMsg('');
    playArenaSfx('go');
    try {
      const sc = await loadEmpireScenario(detective);
      setScenario(sc);
      setPhase('play');
      // Warmup: reveal bars gradually
      setBars(sc.visible.slice(0, Math.max(8, Math.floor(sc.visible.length * 0.45))));
      const full = sc.visible;
      let i = Math.max(8, Math.floor(full.length * 0.45));
      const tick = window.setInterval(() => {
        i += 1;
        setBars(full.slice(0, i));
        if (i >= full.length) {
          window.clearInterval(tick);
          playArenaSfx('wave');
          setPhase('decide');
        }
      }, 140);
    } catch {
      setPhase('lobby');
    } finally {
      setLoading(false);
    }
  };

  const placeCall = useCallback(
    (call: EmpireSide) => {
      if (!scenario || phase !== 'decide') return;
      if (stake > empire.bank) {
        setBuyMsg('Stake > bank — pick a smaller size.');
        return;
      }
      setSide(call);
      setPhase('resolve');
      playArenaSfx('hit');

      const base = scenario.visible;
      const fut = scenario.future;
      let j = 0;
      setBars([...base]);
      const tick = window.setInterval(() => {
        j += 1;
        setBars([...base, ...fut.slice(0, j)]);
        if (j >= fut.length) {
          window.clearInterval(tick);
          const resolved = resolveEmpireCall(scenario, call, stake);
          setResult(resolved);
          const next = applyRoundPnl(resolved.pnl, ownerKey);
          setEmpire(next);
          playArenaSfx(resolved.won ? 'chest' : 'miss');
          setPhase('result');
          onRoundTeach(
            [
              `[DESK EMPIRE] ${call.toUpperCase()} on ${scenario.symbol}.`,
              `PnL ${resolved.pnl}. ${resolved.teach}`,
              'Hype or coach 2 lines. No Entry/Stop/Target.',
            ].join(' '),
          );
        }
      }, 110);
    },
    [scenario, phase, stake, empire.bank, ownerKey, onRoundTeach],
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
  const catalog =
    shopFilter === 'all' ? SHOP_CATALOG : SHOP_CATALOG.filter((x) => x.category === shopFilter);

  return (
    <div className={`wm-arena wm-empire ${playing ? 'wm-arena--live wm-arena--playing wm-empire--play' : ''}`}>
      {phase === 'lobby' || phase === 'shop' || phase === 'garage' || phase === 'result' ? (
        <div className="wm-empire__top">
          <div>
            <p className="wm-arena__eyebrow">Wolf Desk Empire</p>
            <h2 className="wm-arena__title">
              {firstName}, <span>trade the freeze</span>
            </h2>
            <p className="wm-arena__lead">
              Chart chalta hai → rukta hai → liquidity hint se UP/DOWN → virtual PnL → luxury shop
            </p>
          </div>
          <div className="wm-empire__wallet">
            <div>
              <em>BANK</em>
              <b>{formatDeskCash(empire.bank)}</b>
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
              <p>Session stake</p>
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
                <strong>{loading ? 'LOADING TAPE…' : 'START SESSION'}</strong>
                <small>
                  {detective?.symbol || 'NIFTY'} · replay → freeze → call
                </small>
              </span>
            </button>

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

        {phase === 'play' || phase === 'decide' || phase === 'resolve' ? (
          <motion.div
            key="session"
            className="wm-empire__stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="wm-empire__session-hud">
              <span>{scenario?.symbol}</span>
              <span>{phase === 'play' ? 'TAPE RUNNING…' : phase === 'decide' ? 'FROZEN — CALL NOW' : 'RESOLVING…'}</span>
              <span>Stake {formatDeskCash(stake)}</span>
            </div>

            <DeskEmpireChart
              bars={bars}
              scenario={scenario}
              entryLine={phase === 'resolve' || phase === 'decide' ? scenario?.entry : null}
              showLevels={phase !== 'play'}
              pulse={phase === 'decide'}
            />

            {phase === 'decide' && scenario ? (
              <div className="wm-empire__decide">
                <p className="wm-empire__ask">{scenario.ask}</p>
                <div className="wm-empire__hints">
                  {scenario.hints.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
                <div className="wm-empire__calls">
                  <button type="button" className="wm-empire__call wm-empire__call--up" onClick={() => placeCall('up')}>
                    <TrendingUp className="h-5 w-5" />
                    LONG / UP
                  </button>
                  <button
                    type="button"
                    className="wm-empire__call wm-empire__call--down"
                    onClick={() => placeCall('down')}
                  >
                    <TrendingDown className="h-5 w-5" />
                    SHORT / DOWN
                  </button>
                </div>
              </div>
            ) : null}

            {phase === 'play' ? (
              <p className="wm-empire__running">Watch the tape — freeze incoming…</p>
            ) : null}
            {phase === 'resolve' && side ? (
              <p className="wm-empire__running">
                Position: {side.toUpperCase()} @ {scenario?.entry.toFixed(1)} — revealing…
              </p>
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
            <div className={`wm-empire__pnl ${result.won ? 'win' : 'lose'}`}>
              {result.pnl >= 0 ? '+' : ''}
              {formatDeskCash(result.pnl)}
            </div>
            <p className="wm-empire__teach">{result.teach}</p>
            <p className="wm-empire__meta">
              Exit {result.exit.toFixed(1)} · move {(result.movePct * 100).toFixed(2)}% · bank{' '}
              {formatDeskCash(empire.bank)}
            </p>
            <div className="wm-arena__result-actions">
              <button type="button" className="wm-arena__play wm-arena__play--sm" onClick={() => void startSession()}>
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
              <b>Garage / Collection</b>
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
