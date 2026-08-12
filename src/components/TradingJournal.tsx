import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CalendarRange,
  ChevronDown,
  Download,
  Filter,
  LayoutGrid,
  LineChart,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  Table2,
  TrendingUp,
  Upload,
  ImageIcon,
  Zap,
  AlertTriangle,
  Crosshair,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { User } from '../hooks/useAuth';
import { useChartTheme } from '../hooks/useChartTheme';
import type { JournalMarket, PnlCurrency, TradeRecord, TradeSide, TradeType } from '../types/journal';
import {
  createManualGlobalInstrument,
  defaultPnlCurrency,
  formatPnlAmount,
  pnlFieldLabel,
  tradeMarket,
  tradePnlCurrency,
  type GlobalInstrumentSelection,
} from '../services/globalInstrumentService';
import {
  autoSyncJournal,
  canCloudSync,
  hydrateJournalFromCloud,
  mergeTradeLists,
  persistLocalTrades,
} from '../services/journalSyncService';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { getJournalCompletenessWarnings } from '../services/masterAiService';
import {
  buildAutoCoachTips,
  buildSessionRecap,
  computeFormDraftAssist,
  computeJournalQuality,
  computeRiskDrift,
  queueHunterJournalReview,
} from '../services/journalAiAssist';
import TradePsychologyFields, { DEFAULT_TRADE_PSYCHOLOGY } from './trader/TradePsychologyFields';
import ImageLightbox from './journal/ImageLightbox';
import JournalCalendar from './journal/JournalCalendar';
import JournalWinLossChart from './journal/JournalWinLossChart';
import JournalMonthlyPnlChart from './journal/JournalMonthlyPnlChart';
import JournalAnalyticsDesk from './journal/JournalAnalyticsDesk';
import JournalAlertsCoach from './journal/JournalAlertsCoach';
import JournalTradeAssistPanel from './journal/JournalTradeAssistPanel';
import type { JournalSymbolSelection } from '../services/equitySymbolService';
import {
  calculateJournalTradeMetrics,
  formatOptionContract,
  getInstrumentLotSize,
  journalUnderlyingSymbol,
  parseOptionContract,
  type OptionRight,
} from '../services/journalTradeCalc';
import HunterMark from './HunterMark';
import LuxSelect from './ui/LuxSelect';
import { lazyWithRetry } from '../utils/lazyWithRetry';

const GlobalInstrumentPicker = lazyWithRetry(() => import('./journal/GlobalInstrumentPicker'));
const JournalSymbolPicker = lazyWithRetry(() => import('./journal/JournalSymbolPicker'));

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  tone: 'good' | 'warning' | 'info';
};

type TradeFormState = {
  market: JournalMarket;
  pnlCurrency: PnlCurrency;
  instrument: string;
  /** Options contract builder — composed into instrument on save */
  optStrike: string;
  optRight: OptionRight;
  optExpiry: string;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  target: string;
  quantity: string;
  side: TradeSide;
  type: TradeType;
  broker: string;
  strategy: string;
  notes: string;
  tags: string;
  date: string;
  quantityIsLots: boolean;
  /** Manual realized P&L — profit positive, loss negative */
  realizedPnl: string;
  beforeEmotion: string;
  afterEmotion: string;
  confidence: string;
  discipline: string;
  fearGreed: string;
  psychologyNote: string;
};

const AUTO_SYNC_MS = 800;
const CLOUD_PULL_MS = 45_000;

const MARKET_OPTIONS: { id: JournalMarket; label: string; hint: string }[] = [
  { id: 'equity', label: 'Indian Equity', hint: 'NSE / BSE stocks & F&O' },
  { id: 'crypto', label: 'Crypto', hint: 'BTC, ETH, altcoins' },
  { id: 'forex', label: 'Forex', hint: 'FX pairs & gold' },
];

function localDateTimeInputValue(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function freshEmptyForm(): TradeFormState {
  return {
    ...EMPTY_FORM_BASE,
    date: localDateTimeInputValue(),
  };
}

const EMPTY_FORM_BASE: TradeFormState = {
  market: 'equity',
  pnlCurrency: 'INR',
  instrument: 'NIFTY',
  optStrike: '',
  optRight: 'CE',
  optExpiry: '',
  entryPrice: '',
  exitPrice: '',
  stopLoss: '',
  target: '',
  quantity: '',
  side: 'Buy',
  type: 'Intraday',
  broker: '',
  strategy: '',
  notes: '',
  tags: '',
  date: '',
  quantityIsLots: false,
  realizedPnl: '',
  ...DEFAULT_TRADE_PSYCHOLOGY,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

function sanitizeString(value: string) {
  return value.trim();
}

function tradeTags(trade: TradeRecord): string[] {
  return Array.isArray(trade.tags) ? trade.tags : [];
}

function psychologyAveragesFromTrades(trades: TradeRecord[]) {
  const scored = trades.filter((t) => typeof t.discipline === 'number' && typeof t.confidence === 'number');
  if (!scored.length) return { discipline: 78, confidence: 70 };
  return {
    discipline: Math.round(scored.reduce((s, t) => s + (t.discipline ?? 0), 0) / scored.length),
    confidence: Math.round(scored.reduce((s, t) => s + (t.confidence ?? 0), 0) / scored.length),
  };
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Prices / qty — digits + optional single decimal only (no letters). */
function sanitizeDecimalInput(raw: string): string {
  const cleaned = String(raw ?? '').replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
}

/** P&L — optional leading minus + digits + optional single decimal. */
function sanitizeSignedDecimalInput(raw: string): string {
  const text = String(raw ?? '');
  const neg = text.trimStart().startsWith('-');
  const body = sanitizeDecimalInput(text);
  if (!body && neg) return '-';
  return neg ? `-${body}` : body;
}

function buildCalcInput(
  normalized: TradeFormState,
  entryPrice: number,
  exitPrice: number,
  stopLoss: number,
  target: number,
  quantity: number,
  lotSizeOverride?: number,
) {
  const lotSize =
    lotSizeOverride ??
    getInstrumentLotSize(
      normalized.instrument,
      normalized.market,
      normalized.market === 'forex' && normalized.quantityIsLots,
    );
  return {
    instrument: normalized.instrument,
    entryPrice,
    exitPrice,
    stopLoss,
    target,
    quantity,
    quantityIsLots: normalized.quantityIsLots,
    lotSize,
    side: normalized.side,
    type: normalized.type,
    market: normalized.market,
  };
}

function buildTradeMetrics(trades: TradeRecord[]) {
  const totalTrades = trades.length;
  const winningTrades = trades.filter((trade) => safePnl(trade) > 0);
  const totalPnl = trades.reduce((sum, trade) => sum + safePnl(trade), 0);
  const avgRR = totalTrades
    ? trades.reduce((sum, trade) => sum + Number(trade.rr ?? 0), 0) / totalTrades
    : 0;
  const winRate = totalTrades ? (winningTrades.length / totalTrades) * 100 : 0;
  const best = trades.reduce((best, trade) => (safePnl(trade) > safePnl(best) ? trade : best), trades[0] ?? { pnl: 0 } as TradeRecord);
  const worst = trades.reduce((worst, trade) => (safePnl(trade) < safePnl(worst) ? trade : worst), trades[0] ?? { pnl: 0 } as TradeRecord);

  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (safePnl(sorted[i]) > 0) streak += 1;
    else break;
  }

  const monthly = Array.from({ length: 6 }, (_, index) => {
    const start = new Date();
    start.setMonth(start.getMonth() - (5 - index));
    const monthLabel = start.toLocaleString('en-US', { month: 'short' });
    const monthTrades = trades.filter((trade) => new Date(trade.date).getMonth() === start.getMonth() && new Date(trade.date).getFullYear() === start.getFullYear());
    const monthPnl = monthTrades.reduce((sum, trade) => sum + safePnl(trade), 0);
    return { label: monthLabel, pnl: monthPnl, trades: monthTrades.length };
  });

  return { totalTrades, totalPnl, avgRR, winRate, best, worst, streak, monthly };
}

/** Legacy/imported rows can carry a null or non-numeric pnl — never let it poison an aggregate. */
function safePnl(trade: Pick<TradeRecord, 'pnl'>) {
  const n = Number(trade.pnl);
  return Number.isFinite(n) ? n : 0;
}

function buildAdvancedMetrics(trades: TradeRecord[]) {
  const wins = trades.filter((t) => safePnl(t) > 0);
  const losses = trades.filter((t) => safePnl(t) < 0);
  const grossProfit = wins.reduce((s, t) => s + safePnl(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + safePnl(t), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const expectancy = trades.length ? trades.reduce((s, t) => s + safePnl(t), 0) / trades.length : 0;

  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let peak = 0;
  let cum = 0;
  let maxDrawdown = 0;
  sorted.forEach((t) => {
    cum += safePnl(t);
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDrawdown) maxDrawdown = dd;
  });

  return {
    profitFactor,
    avgWin,
    avgLoss,
    expectancy,
    maxDrawdown,
    grossProfit,
    grossLoss,
    winCount: wins.length,
    lossCount: losses.length,
  };
}

function buildEquityCurve(trades: TradeRecord[]) {
  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let cum = 0;
  return sorted.map((t, i) => {
    cum += safePnl(t);
    return {
      label: new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      equity: Math.round(cum * 100) / 100,
      trade: i + 1,
    };
  });
}

type JournalTab = 'overview' | 'trades' | 'analytics' | 'calendar';
type TradeSortKey = 'date' | 'pnl' | 'rr' | 'instrument';

function buildStrategyData(trades: TradeRecord[]) {
  const map = new Map<string, { pnl: number; trades: number }>();
  trades.forEach((trade) => {
    const key = trade.strategy || 'Unlabelled';
    const existing = map.get(key) ?? { pnl: 0, trades: 0 };
    existing.pnl += safePnl(trade);
    existing.trades += 1;
    map.set(key, existing);
  });

  return Array.from(map.entries()).map(([strategy, value]) => ({ strategy, pnl: value.pnl, trades: value.trades }));
}

function buildInstrumentData(trades: TradeRecord[]) {
  const map = new Map<string, number>();
  trades.forEach((trade) => {
    const key = trade.instrument || 'Unknown';
    map.set(key, (map.get(key) ?? 0) + safePnl(trade));
  });
  return Array.from(map.entries()).map(([instrument, pnl]) => ({ instrument, pnl }));
}

function buildRiskData(trades: TradeRecord[]) {
  return [
    { name: 'Low Risk', value: trades.filter((trade) => Number(trade.rr ?? 0) >= 1.5).length },
    { name: 'Medium Risk', value: trades.filter((trade) => {
      const rr = Number(trade.rr ?? 0);
      return rr >= 1 && rr < 1.5;
    }).length },
    { name: 'High Risk', value: trades.filter((trade) => Number(trade.rr ?? 0) < 1).length },
  ];
}

function buildHeatmap(trades: TradeRecord[]) {
  // Mon–Sun: crypto and forex trade on weekends too, so every weekday needs a bucket.
  const data = [
    { day: 'Mon', pnl: 0 },
    { day: 'Tue', pnl: 0 },
    { day: 'Wed', pnl: 0 },
    { day: 'Thu', pnl: 0 },
    { day: 'Fri', pnl: 0 },
    { day: 'Sat', pnl: 0 },
    { day: 'Sun', pnl: 0 },
  ];

  trades.forEach((trade) => {
    const dayIndex = new Date(trade.date).getDay();
    if (Number.isNaN(dayIndex)) return;
    const mappedIndex = dayIndex === 0 ? 6 : dayIndex - 1;
    data[mappedIndex].pnl += safePnl(trade);
  });

  return data;
}

function buildReplayTimeline(trades: TradeRecord[]) {
  return [...trades]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);
}

function getTradeColor(pnl: number) {
  if (pnl > 0) return '#10b981';
  if (pnl < 0) return '#f43f5e';
  return '#d4af37';
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const GOAL_TARGET_KEY = 'wolf_journal_goal_target';

function tradeBelongsToUser(trade: TradeRecord, user: User) {
  const email = user.email?.toLowerCase();
  const tradeEmail = trade.ownerEmail?.toLowerCase();
  return (
    trade.ownerId === user.id ||
    trade.ownerId === user.email ||
    (!!email && tradeEmail === email)
  );
}

function parseManualPnl(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseNumber(trimmed);
  return parsed === null ? null : parsed;
}

function hasManualPnl(input: TradeFormState): boolean {
  return parseManualPnl(input.realizedPnl) !== null;
}

/** Entry + Exit + Qty → P&L can be derived; user need not type it by hand. */
function canAutoComputePnl(input: TradeFormState): boolean {
  const entry = parseNumber(input.entryPrice);
  const exit = parseNumber(input.exitPrice);
  const qty = parseNumber(input.quantity);
  return (
    entry !== null &&
    entry > 0 &&
    exit !== null &&
    exit >= 0 &&
    qty !== null &&
    qty > 0
  );
}

function getMissingTradeFields(input: TradeFormState): string[] {
  const missing: string[] = [];
  if (!sanitizeString(input.instrument)) missing.push('Instrument');
  if (input.type === 'Options' && !sanitizeString(input.optStrike)) {
    missing.push('Option strike');
  }
  if (!sanitizeString(input.date)) missing.push('Date');
  if (parseManualPnl(input.realizedPnl) === null && !canAutoComputePnl(input)) {
    missing.push('Profit / Loss (or Entry + Exit + Qty)');
  }
  return missing;
}

/** Underlying in the picker + strike/CE-PE (or FUT) → saved script name. */
function resolveInstrumentForSave(form: TradeFormState): string {
  const underlying =
    journalUnderlyingSymbol(form.instrument) ||
    sanitizeString(form.instrument).split(/\s+/)[0] ||
    'NIFTY';
  if (form.type === 'Options') {
    return formatOptionContract(underlying, form.optStrike, form.optRight, form.optExpiry);
  }
  if (form.type === 'Futures') {
    const exp = sanitizeString(form.optExpiry).toUpperCase();
    return exp ? `${underlying} ${exp} FUT` : `${underlying} FUT`;
  }
  return underlying;
}

function normalizeFormForSave(form: TradeFormState): TradeFormState {
  const entry = parseNumber(form.entryPrice) ?? 0;
  const isBuy = form.side === 'Buy';
  const defaultSl =
    parseNumber(form.stopLoss) ??
    (isBuy ? Math.round(entry * 0.98 * 100) / 100 : Math.round(entry * 1.02 * 100) / 100);
  const defaultTarget =
    parseNumber(form.target) ??
    (isBuy ? Math.round(entry * 1.02 * 100) / 100 : Math.round(entry * 0.98 * 100) / 100);

  const market = form.market || 'equity';
  return {
    ...form,
    market,
    pnlCurrency: form.pnlCurrency || defaultPnlCurrency(market),
    broker: sanitizeString(form.broker) || 'Not specified',
    strategy: sanitizeString(form.strategy) || 'Manual',
    stopLoss: form.stopLoss.trim() || String(defaultSl),
    target: form.target.trim() || String(defaultTarget),
  };
}

function isTradeComplete(input: TradeFormState) {
  return (
    sanitizeString(input.instrument).length > 0 &&
    (input.type !== 'Options' || sanitizeString(input.optStrike).length > 0) &&
    sanitizeString(input.date).length > 0 &&
    (hasManualPnl(input) || canAutoComputePnl(input))
  );
}

function parseFormToTradeRecord(form: TradeFormState, user: User, editingId?: string, existingCreatedAt?: string) {
  const normalized = normalizeFormForSave(form);
  if (!isTradeComplete(normalized)) {
    return null;
  }

  const manualPnl = parseManualPnl(normalized.realizedPnl);
  const entryPrice = parseNumber(normalized.entryPrice) ?? 0;
  const exitPrice = parseNumber(normalized.exitPrice) ?? 0;
  const stopLoss = parseNumber(normalized.stopLoss) ?? entryPrice;
  const target = parseNumber(normalized.target) ?? entryPrice;
  const quantity = parseNumber(normalized.quantity) ?? 1;

  let pnl: number;
  let rr = 0;
  let brokerage = 0;
  let roi = 0;
  let positionSize = quantity;

  if (manualPnl !== null) {
    pnl = Number(manualPnl.toFixed(2));
    const invested = entryPrice * quantity;
    roi = invested > 0 ? Number(((pnl / invested) * 100).toFixed(2)) : 0;
    if (entryPrice > 0 && exitPrice >= 0 && quantity > 0) {
      const metrics = calculateJournalTradeMetrics(
        buildCalcInput(normalized, entryPrice, exitPrice, stopLoss, target, quantity),
      );
      rr = metrics.rr;
      brokerage = metrics.brokerage;
      positionSize = metrics.positionSize;
    }
  } else {
    const metrics = calculateJournalTradeMetrics(
      buildCalcInput(normalized, entryPrice, exitPrice, stopLoss, target, quantity),
    );
    pnl = metrics.pnl;
    rr = metrics.rr;
    brokerage = metrics.brokerage;
    roi = metrics.roi;
    positionSize = metrics.positionSize;
  }

  const now = new Date().toISOString();
  const ownerId = user.id || user.email;

  return {
    id: editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId,
    ownerEmail: user.email,
    ownerName: user.name,
    instrument: sanitizeString(normalized.instrument),
    entryPrice,
    exitPrice,
    stopLoss,
    target,
    quantity,
    side: form.side,
    type: form.type,
    broker: sanitizeString(normalized.broker),
    strategy: sanitizeString(normalized.strategy),
    notes: sanitizeString(form.notes),
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    screenshot: undefined,
    date: normalized.date,
    pnl,
    rr,
    brokerage,
    roi,
    positionSize,
    beforeEmotion: normalized.beforeEmotion,
    afterEmotion: normalized.afterEmotion,
    confidence: Number(normalized.confidence),
    discipline: Number(normalized.discipline),
    fearGreed: Number(normalized.fearGreed),
    psychologyNote: sanitizeString(normalized.psychologyNote),
    market: normalized.market,
    pnlCurrency: normalized.pnlCurrency,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
}

export default function TradingJournal({
  user,
  isAdmin,
  onNavigate,
}: {
  user: User | null;
  isAdmin: boolean;
  onNavigate?: (tab: string) => void;
}) {
  const [tradeStore, setTradeStore] = useState<TradeRecord[]>([]);
  const skipPersistRef = useRef(true);
  const syncLockRef = useRef(false);
  const hydrateGenRef = useRef(0);
  const tradeLogRef = useRef<HTMLDivElement | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    strategy: '',
    broker: '',
    instrument: '',
    tag: '',
    market: 'all' as 'all' | JournalMarket,
    pnl: 'all' as 'all' | 'win' | 'loss',
  });
  const [goalTarget, setGoalTarget] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(GOAL_TARGET_KEY));
      return Number.isFinite(saved) && saved > 0 ? saved : 5000;
    } catch {
      return 5000;
    }
  });
  const [challengeMode, setChallengeMode] = useState(true);
  const [syncStatus, setSyncStatus] = useState('Ready');
  const [statusMessage, setStatusMessage] = useState('Add a completed trade to start your journal.');
  const [form, setForm] = useState<TradeFormState>(() => freshEmptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const [lightbox, setLightbox] = useState<{ src: string; title?: string; subtitle?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<JournalTab>('overview');
  const [, setShowTradeForm] = useState(true);
  const [sortKey, setSortKey] = useState<TradeSortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    try {
      localStorage.setItem(GOAL_TARGET_KEY, String(goalTarget));
    } catch {
      /* storage full or blocked — goal stays session-only */
    }
  }, [goalTarget]);

  useEffect(() => {
    if (!user) {
      setTradeStore([]);
      setSyncStatus('Sign in to sync');
      return;
    }

    let cancelled = false;
    const gen = ++hydrateGenRef.current;
    skipPersistRef.current = true;
    setIsSyncing(true);
    setSyncStatus('Syncing journal…');

    hydrateJournalFromCloud(user).then((trades) => {
      if (cancelled || gen !== hydrateGenRef.current) return;
      // Merge so in-flight saves during hydrate are not wiped.
      setTradeStore((prev) => (prev.length ? mergeTradeLists(prev, trades) : trades));
      const cloudHint = canCloudSync(user) ? ' · cloud' : ' · local';
      setSyncStatus(`Loaded${cloudHint} • ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
      requestAnimationFrame(() => {
        skipPersistRef.current = false;
      });
      setIsSyncing(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user || skipPersistRef.current || syncLockRef.current) return;

    const timer = window.setTimeout(() => {
      syncLockRef.current = true;
      setIsSyncing(true);
      autoSyncJournal(user, tradeStore).then((result) => {
        setSyncStatus(result.message);
        setIsSyncing(false);
        syncLockRef.current = false;
      });
    }, AUTO_SYNC_MS);

    return () => window.clearTimeout(timer);
  }, [tradeStore, user]);

  useEffect(() => {
    if (!user || !canCloudSync(user)) return;

    const pull = window.setInterval(() => {
      if (syncLockRef.current || skipPersistRef.current) return;
      syncLockRef.current = true;
      const gen = ++hydrateGenRef.current;
      hydrateJournalFromCloud(user).then((merged) => {
        if (gen !== hydrateGenRef.current) {
          syncLockRef.current = false;
          return;
        }
        skipPersistRef.current = true;
        setTradeStore((prev) => mergeTradeLists(prev, merged));
        setSyncStatus(`Updated • ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
        requestAnimationFrame(() => {
          skipPersistRef.current = false;
        });
        syncLockRef.current = false;
      });
    }, CLOUD_PULL_MS);

    return () => window.clearInterval(pull);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    const onStorage = (e: StorageEvent) => {
      if (!e.key?.includes('tradeflow_journal_store_v3_')) return;
      skipPersistRef.current = true;
      hydrateJournalFromCloud(user).then((trades) => {
        setTradeStore((prev) => mergeTradeLists(prev, trades));
        setSyncStatus(`Synced from another tab • ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
        skipPersistRef.current = false;
      });
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.id, user?.email]);

  const visibleTrades = useMemo(() => {
    if (!user) return [];
    if (isAdmin) {
      return tradeStore;
    }
    return tradeStore.filter((trade) => tradeBelongsToUser(trade, user));
  }, [isAdmin, tradeStore, user]);

  const psychAverages = useMemo(() => psychologyAveragesFromTrades(visibleTrades), [visibleTrades]);
  const disciplineScore = psychAverages.discipline;
  const emotionAverage = psychAverages.confidence;

  const filteredTrades = useMemo(() => {
    const strategyQuery = filters.strategy.trim().toLowerCase();
    const brokerQuery = filters.broker.trim().toLowerCase();
    const instrumentQuery = filters.instrument.trim().toLowerCase();
    const marketFilter = filters.market;

    return visibleTrades.filter((trade) => {
      const matchesSearch = `${trade.instrument ?? ''} ${trade.strategy ?? ''} ${trade.broker ?? ''} ${tradeTags(trade).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesStrategy = strategyQuery
        ? (trade.strategy ?? '').toLowerCase().includes(strategyQuery)
        : true;
      const matchesBroker = brokerQuery
        ? (trade.broker ?? '').toLowerCase().includes(brokerQuery)
        : true;
      const matchesInstrument = instrumentQuery
        ? (trade.instrument ?? '').toLowerCase().includes(instrumentQuery)
        : true;
      const matchesTag = filters.tag ? tradeTags(trade).includes(filters.tag) : true;
      const matchesPnl = filters.pnl === 'all'
        ? true
        : filters.pnl === 'win'
          ? safePnl(trade) > 0
          : safePnl(trade) < 0;
      const matchesMarket =
        marketFilter === 'all' ? true : tradeMarket(trade) === marketFilter;

      return (
        matchesSearch &&
        matchesStrategy &&
        matchesBroker &&
        matchesInstrument &&
        matchesTag &&
        matchesPnl &&
        matchesMarket
      );
    });
  }, [filters, search, visibleTrades]);

  const metrics = useMemo(() => buildTradeMetrics(filteredTrades), [filteredTrades]);
  const advanced = useMemo(() => buildAdvancedMetrics(filteredTrades), [filteredTrades]);
  const equityCurve = useMemo(() => buildEquityCurve(filteredTrades), [filteredTrades]);

  const sortedTrades = useMemo(() => {
    const list = [...filteredTrades];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = (new Date(a.date).getTime() || 0) - (new Date(b.date).getTime() || 0);
      else if (sortKey === 'pnl') cmp = safePnl(a) - safePnl(b);
      else if (sortKey === 'rr') cmp = Number(a.rr ?? 0) - Number(b.rr ?? 0);
      else cmp = (a.instrument ?? '').localeCompare(b.instrument ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredTrades, sortKey, sortDir]);
  const strategyData = useMemo(() => buildStrategyData(filteredTrades), [filteredTrades]);
  const instrumentData = useMemo(() => buildInstrumentData(filteredTrades), [filteredTrades]);

  const netPnlDisplay = useMemo(() => {
    const currencies = new Set(filteredTrades.map((t) => tradePnlCurrency(t)));
    if (currencies.size > 1) {
      return { mixed: true, text: 'Mixed currencies — filter by market' };
    }
    const currency = currencies.values().next().value ?? 'INR';
    return { mixed: false, text: formatPnlAmount(metrics.totalPnl, currency) };
  }, [filteredTrades, metrics.totalPnl]);
  const heatmapData = useMemo(() => buildHeatmap(visibleTrades), [visibleTrades]);
  const replayTimeline = useMemo(() => buildReplayTimeline(visibleTrades), [visibleTrades]);
  const riskData = useMemo(() => buildRiskData(filteredTrades), [filteredTrades]);

  const journalQuality = useMemo(() => computeJournalQuality(filteredTrades), [filteredTrades]);
  const riskDrift = useMemo(() => computeRiskDrift(filteredTrades), [filteredTrades]);
  const sessionRecap = useMemo(() => buildSessionRecap(filteredTrades), [filteredTrades]);

  const coachTips = useMemo(
    () =>
      buildAutoCoachTips(filteredTrades, {
        winRate: metrics.winRate,
        avgRR: metrics.avgRR,
        streak: metrics.streak,
        totalTrades: metrics.totalTrades,
        disciplineScore,
      }),
    [disciplineScore, filteredTrades, metrics],
  );

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    if (journalQuality.score > 0 && journalQuality.score < 55) {
      items.push({
        id: 'quality',
        title: 'Journal quality',
        detail: `Completeness ${journalQuality.score}/100. ${journalQuality.topGaps[0] || ''}`,
        tone: 'warning',
      });
    }
    if (riskDrift.enoughData && riskDrift.severity === 'elevated') {
      items.push({
        id: 'drift',
        title: riskDrift.title,
        detail: riskDrift.detail,
        tone: 'warning',
      });
    }
    if (disciplineScore < 75) {
      items.push({
        id: 'disc',
        title: 'Discipline alert',
        detail: 'Your recent discipline score is below target. Review your notes before next trade.',
        tone: 'warning',
      });
    }
    if (metrics.winRate < 50 && metrics.totalTrades >= 5) {
      items.push({
        id: 'winrate',
        title: 'Win rate watch',
        detail: 'Improve entry quality and execution rhythm to raise consistency.',
        tone: 'info',
      });
    }
    if (challengeMode) {
      items.push({
        id: 'challenge',
        title: 'Challenge mode active',
        detail: 'Daily goal tracking is enabled for consistency and habit building.',
        tone: 'good',
      });
    }
    if (!items.length) {
      items.push({
        id: 'ready',
        title: 'Desk ready',
        detail: 'No urgent alerts. Keep logging clean trades.',
        tone: 'good',
      });
    }
    return items.slice(0, 3);
  }, [challengeMode, disciplineScore, journalQuality, metrics.totalTrades, metrics.winRate, riskDrift]);

  const openHunterReview = () => {
    queueHunterJournalReview();
    onNavigate?.('wolf-ai');
  };

  const [selectedSymbolMeta, setSelectedSymbolMeta] = useState<JournalSymbolSelection | null>(null);
  const [selectedGlobalMeta, setSelectedGlobalMeta] = useState<GlobalInstrumentSelection | null>(null);
  /** Once the user edits P&L by hand, stop overwriting it from Entry/Exit/Qty. */
  const [pnlManualOverride, setPnlManualOverride] = useState(false);

  useEffect(() => {
    if (form.market !== 'equity') {
      setSelectedSymbolMeta(null);
      return;
    }
    if (!sanitizeString(form.instrument)) {
      setForm((prev) => ({ ...prev, instrument: 'NIFTY', pnlCurrency: 'INR' }));
      return;
    }
    let cancelled = false;
    import('../services/equitySymbolService').then((mod) => {
      if (!cancelled) {
        setSelectedSymbolMeta(mod.getJournalSymbolSelection(form.instrument));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [form.instrument, form.market]);

  const activeLotSize = useMemo(() => {
    if (form.market === 'crypto') return 1;
    if (form.market === 'forex') {
      return form.quantityIsLots ? 100_000 : 1;
    }
    if (selectedSymbolMeta?.isFno) return selectedSymbolMeta.lotSize;
    return getInstrumentLotSize(
      form.type === 'Options'
        ? journalUnderlyingSymbol(form.instrument) || form.instrument || 'NIFTY'
        : form.instrument || 'NIFTY',
      'equity',
    );
  }, [form.instrument, form.market, form.quantityIsLots, form.type, selectedSymbolMeta]);

  const preview = useMemo(() => {
    const normalized = normalizeFormForSave(form);
    const entryPrice = parseNumber(normalized.entryPrice) ?? 0;
    const exitPrice = parseNumber(normalized.exitPrice) ?? 0;
    const stopLoss = parseNumber(normalized.stopLoss) ?? entryPrice;
    const target = parseNumber(normalized.target) ?? entryPrice;
    const quantity = parseNumber(normalized.quantity) ?? 0;
    const manual = parseManualPnl(normalized.realizedPnl);

    if (entryPrice > 0 && exitPrice >= 0 && quantity > 0) {
      const metrics = calculateJournalTradeMetrics(
        buildCalcInput(normalized, entryPrice, exitPrice, stopLoss, target, quantity),
      );
      // Prefer typed P&L when the user overrode; still show auto RR / lots.
      if (manual !== null && pnlManualOverride) {
        const invested = entryPrice * metrics.positionSize;
        return {
          ...metrics,
          pnl: manual,
          netPnl: manual,
          roi: invested > 0 ? Number(((manual / invested) * 100).toFixed(2)) : 0,
          isManual: true,
          isAuto: false,
        };
      }
      return { ...metrics, isManual: false, isAuto: true };
    }

    if (manual !== null) {
      const invested = entryPrice * (quantity || 1);
      return {
        pnl: manual,
        netPnl: manual,
        rr: 0,
        brokerage: 0,
        roi: invested > 0 ? Number(((manual / invested) * 100).toFixed(2)) : 0,
        positionSize: quantity || 1,
        lots: quantity || 1,
        lotSize: getInstrumentLotSize(
          normalized.instrument,
          normalized.market,
          normalized.market === 'forex' && normalized.quantityIsLots,
        ),
        notional: invested,
        isManual: true,
        isAuto: false,
      };
    }

    return null;
  }, [form, pnlManualOverride]);

  // Keep the P&L box in sync with Entry / Exit / Qty unless the user typed over it.
  useEffect(() => {
    if (pnlManualOverride || !canAutoComputePnl(form)) return;
    const entryPrice = parseNumber(form.entryPrice)!;
    const exitPrice = parseNumber(form.exitPrice)!;
    const quantity = parseNumber(form.quantity)!;
    const stopLoss = parseNumber(form.stopLoss) ?? entryPrice;
    const target = parseNumber(form.target) ?? entryPrice;
    const normalized = normalizeFormForSave(form);
    const metrics = calculateJournalTradeMetrics(
      buildCalcInput(normalized, entryPrice, exitPrice, stopLoss, target, quantity),
    );
    const next = String(metrics.pnl);
    if (form.realizedPnl === next) return;
    setForm((prev) => ({ ...prev, realizedPnl: next }));
  }, [
    form.entryPrice,
    form.exitPrice,
    form.quantity,
    form.side,
    form.quantityIsLots,
    form.type,
    form.instrument,
    form.market,
    form.stopLoss,
    form.target,
    pnlManualOverride,
  ]);

  const formAssist = useMemo(
    () =>
      computeFormDraftAssist({
        ...form,
        instrument:
          form.type === 'Options' && sanitizeString(form.optStrike)
            ? formatOptionContract(
                form.instrument || 'NIFTY',
                form.optStrike,
                form.optRight,
                form.optExpiry,
              )
            : form.instrument,
        screenshot: Boolean(uploadPreview),
      }),
    [form, uploadPreview],
  );

  const applyQuickTag = (tag: string) => {
    setForm((prev) => {
      const parts = prev.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const exists = parts.some((p) => p.toLowerCase() === tag.toLowerCase());
      const next = exists ? parts.filter((p) => p.toLowerCase() !== tag.toLowerCase()) : [...parts, tag];
      return { ...prev, tags: next.join(', ') };
    });
  };

  useAutoRefresh(() => {
    if (activeTab !== 'trades' || form.market !== 'equity' || !form.instrument) return;
    import('../services/equitySymbolService').then((mod) => {
      mod.refreshMarketSymbols();
      setSelectedSymbolMeta(mod.getJournalSymbolSelection(form.instrument));
    });
  }, activeTab === 'trades' && form.market === 'equity');

  const handleMarketChange = (market: JournalMarket) => {
    setSelectedSymbolMeta(null);
    setSelectedGlobalMeta(null);
    setForm((prev) => ({
      ...prev,
      market,
      instrument: market === 'equity' ? 'NIFTY' : '',
      pnlCurrency: defaultPnlCurrency(market),
      quantityIsLots: market === 'forex',
      type: market === 'equity' ? prev.type : 'Intraday',
    }));
    if (market === 'equity') {
      void import('../services/equitySymbolService').then((mod) => {
        setSelectedSymbolMeta(mod.getJournalSymbolSelection('NIFTY'));
      });
    }
  };

  const handleGlobalInstrumentSelect = (sel: GlobalInstrumentSelection) => {
    let pnlCurrency: PnlCurrency = defaultPnlCurrency(sel.market);
    if (sel.quoteCurrency === 'INR') pnlCurrency = 'INR';
    else if (sel.quoteCurrency === 'EUR') pnlCurrency = 'EUR';
    else if (sel.market === 'crypto') pnlCurrency = 'USDT';
    else pnlCurrency = 'USD';

    setSelectedGlobalMeta(sel);
    setForm((prev) => ({
      ...prev,
      instrument: sel.symbol,
      pnlCurrency,
      quantityIsLots: sel.market === 'forex',
    }));
  };

  const handleSymbolSelect = (sel: JournalSymbolSelection) => {
    const useLots =
      sel.isFno && (form.type === 'Futures' || form.type === 'Options' || sel.type === 'index');
    setSelectedSymbolMeta(sel);
    setSelectedGlobalMeta(null);
    setForm((prev) => ({
      ...prev,
      market: 'equity',
      pnlCurrency: 'INR',
      instrument: sel.symbol,
      // Live LTP as entry when the box is still empty (user can edit).
      entryPrice:
        !sanitizeString(prev.entryPrice) && sel.price > 0
          ? String(Number(sel.price.toFixed(2)))
          : prev.entryPrice,
      quantity:
        !sanitizeString(prev.quantity) &&
        (useLots || (sel.isFno && (prev.type === 'Futures' || prev.type === 'Options')))
          ? '1'
          : prev.quantity,
      quantityIsLots: useLots || (sel.isFno && (prev.type === 'Futures' || prev.type === 'Options')),
    }));
  };

  const totalScreenshots = filteredTrades.filter((trade) => trade.screenshot).length;
  const goalProgress = goalTarget > 0
    ? Math.max(0, Math.min((metrics.totalPnl / goalTarget) * 100, 100))
    : 0;

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setUploadPreview(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setForm(freshEmptyForm());
    setEditingId(null);
    setUploadPreview('');
    setSelectedGlobalMeta(null);
    setPnlManualOverride(false);
    void import('../services/equitySymbolService').then((mod) => {
      setSelectedSymbolMeta(mod.getJournalSymbolSelection('NIFTY'));
    });
  };

  const handleSaveTrade = () => {
    if (!user) {
      setStatusMessage('Please log in to save trades.');
      return;
    }

    // Recover underlying if picker showed a symbol but form field was empty,
    // then for Options compose "NIFTY 24600 CE …" as the saved script.
    const recoveredUnderlying =
      sanitizeString(form.instrument) ||
      selectedSymbolMeta?.symbol ||
      selectedGlobalMeta?.symbol ||
      (form.market === 'equity' ? 'NIFTY' : '');

    const formToSave: TradeFormState = {
      ...form,
      instrument: recoveredUnderlying,
      date: sanitizeString(form.date) || localDateTimeInputValue(),
      pnlCurrency: form.pnlCurrency || defaultPnlCurrency(form.market),
    };
    formToSave.instrument = resolveInstrumentForSave(formToSave);

    const missing = getMissingTradeFields(formToSave);
    if (missing.length > 0) {
      setStatusMessage(`Missing required: ${missing.join(', ')}. Fill Profit/Loss (number) then Save.`);
      return;
    }

    let record: TradeRecord | null = null;
    try {
      const normalizedForm = normalizeFormForSave(formToSave);
      record = parseFormToTradeRecord(
        normalizedForm,
        user,
        editingId ?? undefined,
        editingId ? tradeStore.find((trade) => trade.id === editingId)?.createdAt : undefined,
      );
    } catch (err) {
      console.warn('[Journal] save parse failed:', err);
      setStatusMessage('Could not save trade. Check prices / P&L numbers and try again.');
      return;
    }

    if (!record) {
      setStatusMessage('Could not save — need Instrument, Date, and Profit/Loss number.');
      return;
    }

    const nextRecord: TradeRecord = {
      ...record,
      screenshot: uploadPreview || undefined,
      updatedAt: new Date().toISOString(),
    };

    const nextStore = editingId
      ? tradeStore.map((trade) => (trade.id === editingId ? nextRecord : trade))
      : [nextRecord, ...tradeStore];

    // Persist immediately so cloud hydrate cannot wipe the new trade.
    const stored = persistLocalTrades(user, nextStore);
    skipPersistRef.current = false;
    hydrateGenRef.current += 1;
    setTradeStore(nextStore);

    const softWarnings = getJournalCompletenessWarnings(nextRecord);
    setStatusMessage(
      !stored
        ? 'Saved in this session only — browser storage is full or blocked.'
        : softWarnings.length
          ? `${editingId ? 'Trade updated' : 'Trade saved'} ✓ Completeness tips: ${softWarnings.slice(0, 3).join('; ')}.`
          : `${editingId ? 'Trade updated' : 'Trade saved'} ✓ See Trade Log below.`,
    );

    void autoSyncJournal(user, nextStore).then((result) => {
      setSyncStatus(result.message);
      if (!result.ok) {
        setStatusMessage('Trade saved locally. Cloud sync failed — check storage / connection.');
      }
    });

    setActiveTab('trades');
    setSearch('');
    setFilters({ strategy: '', broker: '', instrument: '', tag: '', market: 'all', pnl: 'all' });
    resetForm();
    requestAnimationFrame(() => {
      tradeLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleEditTrade = (trade: TradeRecord) => {
    if (!user) return;
    if (!isAdmin && !tradeBelongsToUser(trade, user)) return;

    const mkt = tradeMarket(trade);
    const opt = trade.type === 'Options' ? parseOptionContract(trade.instrument) : null;
    const underlying = opt?.underlying || journalUnderlyingSymbol(trade.instrument) || trade.instrument;
    const lotSize = getInstrumentLotSize(
      underlying,
      mkt,
      mkt === 'forex' && trade.positionSize >= 1000,
    );
    const isLots =
      mkt === 'forex' ||
      (lotSize > 1 && Math.abs(trade.quantity * lotSize - trade.positionSize) < 1);

    setForm({
      market: mkt,
      pnlCurrency: tradePnlCurrency(trade),
      instrument: underlying,
      optStrike: opt?.strike ?? '',
      optRight: opt?.right ?? 'CE',
      optExpiry: opt?.expiry ?? '',
      entryPrice: String(trade.entryPrice),
      exitPrice: String(trade.exitPrice),
      stopLoss: String(trade.stopLoss),
      target: String(trade.target),
      quantity: isLots ? String(trade.quantity) : String(trade.positionSize || trade.quantity),
      quantityIsLots: isLots || trade.type === 'Futures' || trade.type === 'Options',
      side: trade.side,
      type: trade.type,
      broker: trade.broker,
      strategy: trade.strategy,
      notes: trade.notes,
      tags: tradeTags(trade).join(', '),
      date: trade.date,
      realizedPnl: String(trade.pnl),
      beforeEmotion: trade.beforeEmotion ?? DEFAULT_TRADE_PSYCHOLOGY.beforeEmotion,
      afterEmotion: trade.afterEmotion ?? DEFAULT_TRADE_PSYCHOLOGY.afterEmotion,
      confidence: String(trade.confidence ?? DEFAULT_TRADE_PSYCHOLOGY.confidence),
      discipline: String(trade.discipline ?? DEFAULT_TRADE_PSYCHOLOGY.discipline),
      fearGreed: String(trade.fearGreed ?? DEFAULT_TRADE_PSYCHOLOGY.fearGreed),
      psychologyNote: trade.psychologyNote ?? '',
    });
    setEditingId(trade.id);
    setUploadPreview(trade.screenshot || '');
    setPnlManualOverride(true);
    if (mkt === 'crypto' || mkt === 'forex') {
      setSelectedGlobalMeta(createManualGlobalInstrument(mkt, trade.instrument));
      setSelectedSymbolMeta(null);
    } else {
      setSelectedGlobalMeta(null);
      void import('../services/equitySymbolService').then((mod) => {
        setSelectedSymbolMeta(mod.getJournalSymbolSelection(underlying));
      });
    }
    setStatusMessage('Editing trade — click Update Trade to save changes.');
  };

  const handleDeleteTrade = (tradeId: string) => {
    if (!user) return;

    const target = tradeStore.find((trade) => trade.id === tradeId);
    if (!target) return;
    if (!isAdmin && !tradeBelongsToUser(target, user)) {
      setStatusMessage('You can only delete your own trades.');
      return;
    }

    const nextStore = tradeStore.filter((trade) => trade.id !== tradeId);
    // Persist before the cloud pull runs, otherwise the merge restores the deleted row.
    persistLocalTrades(user, nextStore);
    skipPersistRef.current = false;
    hydrateGenRef.current += 1;
    setTradeStore(nextStore);
    if (editingId === tradeId) resetForm();
    setStatusMessage('Trade deleted successfully.');
    void autoSyncJournal(user, nextStore).then((result) => {
      setSyncStatus(result.message);
    });
  };

  const handleExportCsv = () => {
    const csvCell = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = filteredTrades.map((trade) => [
      trade.date,
      trade.instrument,
      trade.side,
      trade.entryPrice,
      trade.exitPrice,
      trade.stopLoss,
      trade.target,
      trade.quantity,
      trade.pnl,
      trade.rr,
      trade.brokerage,
      trade.strategy,
      trade.notes,
      trade.broker,
      trade.ownerEmail,
    ].map(csvCell).join(','));

    downloadFile('trading-journal.csv', ['date,instrument,side,entryPrice,exitPrice,stopLoss,target,quantity,pnl,rr,brokerage,strategy,notes,broker,ownerEmail', ...rows].join('\n'), 'text/csv');
  };

  const handleExportJson = () => {
    downloadFile('trading-journal.json', JSON.stringify(filteredTrades, null, 2), 'application/json');
  };

  const handleSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncStatus('Syncing…');
    skipPersistRef.current = true;
    const cloud = await hydrateJournalFromCloud(user);
    // Fold in anything edited during the debounce window so a manual sync never drops it.
    const merged = mergeTradeLists(tradeStore, cloud);
    setTradeStore(merged);
    const result = await autoSyncJournal(user, merged);
    setSyncStatus(result.message);
    if (!result.ok) setStatusMessage('Cloud sync failed — your trades are still saved on this device.');
    skipPersistRef.current = false;
    setIsSyncing(false);
  };

  const availableTags = Array.from(new Set(visibleTrades.flatMap((trade) => tradeTags(trade))));

  const chartTheme = useChartTheme();
  const mutedClass = 'text-dark-muted';
  const inputClass =
    'tf-field tj-field border focus:border-gold/40 focus:outline-none rounded-lg';

  const journalTabs: { id: JournalTab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'trades', label: 'Trades', icon: Table2 },
    { id: 'analytics', label: 'Analytics', icon: LineChart },
    { id: 'calendar', label: 'Calendar', icon: CalendarRange },
  ];

  const toggleSort = (key: TradeSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (!user) {
    return (
      <div className="app-card p-8 text-center">
        <NotebookPen className="w-12 h-12 text-[#d4af37] mx-auto mb-3 opacity-60" />
        <p className="text-lg font-semibold text-white">Please log in to access your trading journal.</p>
        <p className="text-sm text-slate-500 mt-2">Track trades and performance. Psychology lives in your Trader Profile.</p>
      </div>
    );
  }

  const openScreenshot = (src: string, trade?: TradeRecord) => {
    setLightbox({
      src,
      title: trade ? `${trade.instrument} — ${trade.side}` : 'Trade screenshot',
      subtitle: trade
        ? `${new Date(trade.date).toLocaleString('en-IN')} · P&L ${formatCurrency(trade.pnl)}`
        : undefined,
    });
  };

  return (
    <div className="tj-page space-y-4 pb-8">
      <ImageLightbox
        src={lightbox?.src ?? null}
        title={lightbox?.title}
        subtitle={lightbox?.subtitle}
        onClose={() => setLightbox(null)}
      />

      <motion.section
        className="tj-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <div className="tj-hero__orb tj-hero__orb--a" aria-hidden />
        <div className="tj-hero__orb tj-hero__orb--b" aria-hidden />
        <div className="tj-hero__mesh" aria-hidden />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="tj-hero__mark hidden sm:block">
              <HunterMark showCaption={false} compact />
            </div>
            <div className="min-w-0">
              <p className="tj-hero__eyebrow">
                <Sparkles className="w-3 h-3" />
                Professional Desk Journal
              </p>
              <h1 className="tj-hero__title">Trading Journal</h1>
              <p className={`tj-hero__sub ${mutedClass}`}>
                NSE/BSE, crypto &amp; forex · AI Desk auto-coaches from your logs
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tj-pill">{isAdmin ? 'Admin · All Traders' : user.name}</span>
            <button type="button" onClick={openHunterReview} className="tj-btn tj-btn--ghost" title="Open Wolf AI with journal review">
              <Zap className="w-3.5 h-3.5" />
              Review with Hunter
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('trades');
                setShowTradeForm(true);
              }}
              className="tj-btn tj-btn--primary"
            >
              <Plus className="w-4 h-4" /> Log Trade
            </button>
            <button type="button" onClick={handleSync} disabled={isSyncing} className="tj-btn tj-btn--ghost">
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" onClick={handleExportCsv} className="tj-btn tj-btn--icon" title="Export CSV">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="tj-metrics">
          {[
            { label: 'Net P&L', value: netPnlDisplay.text, sub: `${metrics.totalTrades} trades`, tone: metrics.totalPnl >= 0 ? 'up' : 'down' },
            { label: 'Win Rate', value: `${metrics.winRate.toFixed(1)}%`, sub: `${advanced.winCount}W / ${advanced.lossCount}L`, tone: 'neutral' as const },
            { label: 'Profit Factor', value: advanced.profitFactor >= 99 ? '∞' : advanced.profitFactor.toFixed(2), sub: 'gross P / gross L', tone: 'neutral' as const },
            { label: 'Expectancy', value: formatCurrency(advanced.expectancy), sub: 'per trade', tone: advanced.expectancy >= 0 ? 'up' : 'down' },
            { label: 'Avg R:R', value: `${metrics.avgRR.toFixed(2)}x`, sub: 'risk-reward', tone: 'neutral' as const },
            { label: 'Max Drawdown', value: formatCurrency(advanced.maxDrawdown), sub: `${metrics.streak}W streak`, tone: 'down' as const },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              className={`tj-metric tj-metric--${card.tone}`}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.06 + i * 0.045, type: 'spring', stiffness: 400, damping: 26 }}
              whileHover={{ y: -3, scale: 1.02 }}
            >
              <span className="tj-metric__label">{card.label}</span>
              <span className="tj-metric__value">{card.value}</span>
              <span className="tj-metric__sub">{card.sub}</span>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <div className="tj-tabs" role="tablist">
        {journalTabs.map(({ id, label, icon: Icon }) => {
          const on = activeTab === id;
          return (
            <button key={id} type="button" role="tab" aria-selected={on} className={`tj-tab ${on ? 'tj-tab--on' : ''}`} onClick={() => setActiveTab(id)}>
              <Icon className="w-3.5 h-3.5" />
              {label}
              {on ? <motion.span layoutId="tj-tab-glow" className="tj-tab__glow" /> : null}
            </button>
          );
        })}
      </div>

      {statusMessage ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`tj-status ${
            statusMessage.toLowerCase().includes('saved') ||
            statusMessage.toLowerCase().includes('updated') ||
            statusMessage.toLowerCase().includes('added') ||
            statusMessage.toLowerCase().includes('success')
              ? 'tj-status--ok'
              : ''
          }`}
        >
          {statusMessage}
        </motion.div>
      ) : null}

      <AnimatePresence mode="wait">
        {activeTab === 'overview' ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2 tj-card p-4">
                <h3 className="tj-card__title">
                  <TrendingUp className="w-4 h-4" /> Equity Curve
                </h3>
                {equityCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={equityCurve}>
                      <defs>
                        <linearGradient id="eqCurve" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d4af37" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={9} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={9} tickLine={false} width={56} />
                      <Tooltip contentStyle={chartTheme.tooltip} />
                      <Area type="monotone" dataKey="equity" stroke="#d4af37" fill="url(#eqCurve)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="tj-empty">
                    <NotebookPen className="w-8 h-8 text-[#d4af37]/70" />
                    <p className="tj-empty__title">Your equity story starts here</p>
                    <p className="tj-empty__sub">Log trades to paint a living curve — every session compounds clarity.</p>
                    <button
                      type="button"
                      className="tj-btn tj-btn--primary mt-3"
                      onClick={() => {
                        setActiveTab('trades');
                        setShowTradeForm(true);
                      }}
                    >
                      <Plus className="w-4 h-4" /> Log first trade
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="tj-card p-4">
                  <h3 className="text-xs font-bold text-slate-400 mb-3">Performance Snapshot</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Avg Win</span><span className="text-emerald-400 font-bold">{formatCurrency(advanced.avgWin)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Avg Loss</span><span className="text-red-400 font-bold">{formatCurrency(advanced.avgLoss)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Best Trade</span><span className="text-emerald-400 font-bold">{metrics.best ? formatCurrency(metrics.best.pnl) : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Worst Trade</span><span className="text-red-400 font-bold">{metrics.worst ? formatCurrency(metrics.worst.pnl) : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Goal Progress</span><span className="text-[#d4af37] font-bold">{goalProgress.toFixed(0)}%</span></div>
                  </div>
                  <input type="range" min={1000} max={50000} step={500} value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))} className="mt-3 w-full accent-[#d4af37]" />
                </div>

                <div className="tj-ai-card">
                  <div className="tj-ai-card__head">
                    <Brain className="w-3.5 h-3.5" />
                    <span>AI Coach</span>
                  </div>
                  <div className="space-y-2">
                    {coachTips.slice(0, 3).map((tip, i) => (
                      <motion.div
                        key={tip.id}
                        className={`tj-tip tj-tip--${tip.tone}`}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.08 + i * 0.06 }}
                      >
                        <p className="tj-tip__title">{tip.title}</p>
                        <p className="tj-tip__detail">{tip.detail}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <motion.div className="tj-ai-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <div className="tj-ai-card__head"><Crosshair className="w-3.5 h-3.5" /><span>Journal Quality</span></div>
                <div className="tj-quality">
                  <div className="tj-quality__ring" style={{ background: `conic-gradient(#d4af37 ${journalQuality.score * 3.6}deg, rgba(255,255,255,0.06) 0deg)` }}>
                    <div className="tj-quality__inner">
                      <span className="tj-quality__score">{journalQuality.score}</span>
                      <span className="tj-quality__label">{journalQuality.label}</span>
                    </div>
                  </div>
                  <div className="tj-quality__meta">
                    <p className="text-xs text-slate-400">{journalQuality.missingFieldHits} soft gaps across {journalQuality.tradeCount} trades</p>
                    <ul className="tj-quality__gaps">{journalQuality.topGaps.slice(0, 2).map((g) => <li key={g}>{g}</li>)}</ul>
                    <button type="button" className="tj-btn tj-btn--ghost tj-btn--sm mt-2" onClick={() => { setActiveTab('trades'); setShowTradeForm(true); }}>Improve next log</button>
                  </div>
                </div>
              </motion.div>

              <motion.div className="tj-ai-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="tj-ai-card__head"><Sparkles className="w-3.5 h-3.5" /><span>Session Recap</span></div>
                <p className="tj-recap__headline">{sessionRecap.headline}</p>
                <p className="tj-recap__sub">{sessionRecap.subline}</p>
                <div className="tj-recap__grid">
                  <div><span>Today</span><strong className={sessionRecap.todayPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{sessionRecap.todayCount ? formatCurrency(sessionRecap.todayPnl) : '—'}</strong></div>
                  <div><span>7-day</span><strong className={sessionRecap.weekPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{sessionRecap.weekCount ? formatCurrency(sessionRecap.weekPnl) : '—'}</strong></div>
                </div>
              </motion.div>

              <motion.div className={`tj-ai-card ${riskDrift.severity === 'elevated' ? 'tj-ai-card--warn' : riskDrift.severity === 'mild' ? 'tj-ai-card--mild' : ''}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <div className="tj-ai-card__head"><AlertTriangle className="w-3.5 h-3.5" /><span>Risk Drift</span></div>
                <p className="tj-recap__headline">{riskDrift.title}</p>
                <p className="tj-recap__sub">{riskDrift.detail}</p>
                {riskDrift.enoughData ? <p className="text-[10px] text-slate-500 mt-2">Outliers vs median: {riskDrift.outlierCount} · auto-scanned</p> : null}
              </motion.div>

              <motion.div className="tj-ai-card tj-ai-card--hunter" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <div className="tj-ai-card__head"><Zap className="w-3.5 h-3.5" /><span>Hunter Review</span></div>
                <p className="tj-recap__headline">Deep AI pass</p>
                <p className="tj-recap__sub">Opens Wolf AI with your journal snapshot — patterns, discipline, next focus.</p>
                <button type="button" className="tj-btn tj-btn--primary tj-btn--sm mt-3 w-full justify-center" onClick={openHunterReview}>
                  <Zap className="w-3.5 h-3.5" /> Review with Hunter
                </button>
              </motion.div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="tj-card tj-card--chart p-4">
                <JournalWinLossChart wins={advanced.winCount} losses={advanced.lossCount} />
              </div>
              <div className="tj-card tj-card--chart p-4">
                <JournalMonthlyPnlChart
                  data={metrics.monthly}
                  formatValue={(n) =>
                    Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)
                  }
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {activeTab === 'trades' && (
      <motion.div
        className="tj-trades space-y-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
      <div className="tj-trades__grid">
        <div className="tj-trades__main space-y-4">
          <div className="tj-card tj-trade-form p-4 sm:p-5">
            <div className="tj-trade-form__head">
              <div className="min-w-0">
                <p className="tj-chart__eyebrow">Desk entry</p>
                <h2 className="tj-trade-form__title">{editingId ? 'Edit Trade' : 'Log Trade'}</h2>
                <p className="tj-trade-form__sub">
                  Required: symbol · date · (P&amp;L auto from Entry + Exit + Qty, or type it).
                </p>
              </div>
              <NotebookPen className="w-5 h-5 text-[#d4af37] shrink-0" />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-2">Market * — choose where you traded</p>
                  <div className="flex flex-wrap gap-2">
                    {MARKET_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleMarketChange(opt.id)}
                        className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                          form.market === opt.id
                            ? 'border-[#d4af37] bg-[#d4af37]/15 text-[#d4af37]'
                            : 'border-[var(--tf-border)] bg-[var(--tf-elevated)] text-[var(--tf-text-secondary)] hover:border-[#d4af37]/40'
                        }`}
                      >
                        <span className="block text-xs font-bold">{opt.label}</span>
                        <span className="block text-[10px] opacity-80">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  {form.market === 'equity'
                    ? 'Underlying * — select NIFTY / BANKNIFTY / stock, then choose Cash / Futures / Options below'
                    : form.market === 'crypto'
                      ? 'Instrument * — crypto pair (search or type e.g. BTC/USDT)'
                      : 'Instrument * — forex pair (EUR/USD, XAU/USD, USD/INR…)'}
                </p>

                {form.market === 'equity' ? (
                  <Suspense
                    fallback={
                      <div className="rounded-lg border border-[var(--tf-border)] bg-[var(--tf-elevated)] px-3 py-4 text-xs text-slate-500">
                        Loading indices &amp; F&amp;O list…
                      </div>
                    }
                  >
                    <JournalSymbolPicker
                      selectedSymbol={form.instrument || 'NIFTY'}
                      onSelect={handleSymbolSelect}
                    />
                  </Suspense>
                ) : (
                  <Suspense
                    fallback={
                      <div className="rounded-lg border border-[var(--tf-border)] bg-[var(--tf-elevated)] px-3 py-4 text-xs text-slate-500">
                        Loading {form.market} instruments…
                      </div>
                    }
                  >
                    <GlobalInstrumentPicker
                      market={form.market === 'forex' ? 'forex' : 'crypto'}
                      selectedSymbol={form.instrument}
                      onSelect={handleGlobalInstrumentSelect}
                    />
                  </Suspense>
                )}

                {form.market === 'equity' && selectedSymbolMeta && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--tf-border)] bg-[var(--tf-elevated)] px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                    <span className="font-bold text-[var(--tf-text)]">{selectedSymbolMeta.symbol}</span>
                    <span>{selectedSymbolMeta.name}</span>
                    <span className="rounded bg-[var(--tf-surface)] border border-[var(--tf-border)] px-1.5 py-0.5 text-[10px]">{selectedSymbolMeta.exchange}</span>
                    <span className="text-[10px]">
                      {selectedSymbolMeta.isFno || selectedSymbolMeta.type === 'index'
                        ? 'Choose contract below — Cash / Futures / Options'
                        : 'Matched from list · enter prices manually'}
                    </span>
                  </div>
                )}

                {/* Contract picker for index / F&O underlyings */}
                {form.market === 'equity' &&
                  (selectedSymbolMeta?.isFno ||
                    selectedSymbolMeta?.type === 'index' ||
                    /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX)$/i.test(
                      journalUnderlyingSymbol(form.instrument) || form.instrument,
                    )) && (
                    <div className="rounded-xl border border-[#d4af37]/40 bg-[#121520] p-3 space-y-3">
                      <div>
                        <p className="text-[11px] font-bold text-[#d4af37]">
                          {journalUnderlyingSymbol(form.instrument) || form.instrument || 'NIFTY'}{' '}
                          — which contract?
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          After selecting the underlying, pick Cash, Futures, or an Options CE/PE strike.
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { id: 'cash' as const, label: 'Cash / Spot', hint: 'Index / equity' },
                            { id: 'futures' as const, label: 'Futures', hint: 'FUT contract' },
                            { id: 'options' as const, label: 'Options', hint: 'CE / PE strike' },
                          ] as const
                        ).map((opt) => {
                          const active =
                            opt.id === 'options'
                              ? form.type === 'Options'
                              : opt.id === 'futures'
                                ? form.type === 'Futures'
                                : form.type === 'Intraday' || form.type === 'Swing';
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                const underlying =
                                  journalUnderlyingSymbol(form.instrument) ||
                                  selectedSymbolMeta?.symbol ||
                                  form.instrument ||
                                  'NIFTY';
                                setPnlManualOverride(false);
                                if (opt.id === 'options') {
                                  setForm((prev) => ({
                                    ...prev,
                                    type: 'Options',
                                    instrument: underlying,
                                    quantityIsLots: true,
                                    quantity: sanitizeString(prev.quantity) || '1',
                                  }));
                                  return;
                                }
                                if (opt.id === 'futures') {
                                  setForm((prev) => ({
                                    ...prev,
                                    type: 'Futures',
                                    instrument: underlying,
                                    optStrike: '',
                                    optExpiry: '',
                                    quantityIsLots: true,
                                    quantity: sanitizeString(prev.quantity) || '1',
                                  }));
                                  return;
                                }
                                setForm((prev) => ({
                                  ...prev,
                                  type: prev.type === 'Swing' ? 'Swing' : 'Intraday',
                                  instrument: underlying,
                                  optStrike: '',
                                  optExpiry: '',
                                  quantityIsLots: false,
                                }));
                              }}
                              className={`rounded-xl border px-2 py-2.5 text-left transition-colors ${
                                active
                                  ? 'border-[#d4af37] bg-[#d4af37]/15 text-[#d4af37]'
                                  : 'border-[var(--tf-border)] bg-[var(--tf-elevated)] text-slate-400 hover:border-[#d4af37]/40'
                              }`}
                            >
                              <span className="block text-[11px] font-bold">{opt.label}</span>
                              <span className="block text-[9px] opacity-80 mt-0.5">{opt.hint}</span>
                            </button>
                          );
                        })}
                      </div>

                      {form.type === 'Futures' && (
                        <div className="space-y-1">
                          <input
                            value={form.optExpiry}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                optExpiry: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                              })
                            }
                            className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`}
                            placeholder="Futures expiry (optional) e.g. 28AUG"
                            autoComplete="off"
                          />
                          <p className="text-[10px] text-slate-500">
                            Script preview:{' '}
                            <span className="font-semibold text-[var(--tf-text)]">
                              {(journalUnderlyingSymbol(form.instrument) || form.instrument || 'NIFTY') +
                                (sanitizeString(form.optExpiry)
                                  ? ` ${sanitizeString(form.optExpiry)} FUT`
                                  : ' FUT')}
                            </span>
                          </p>
                        </div>
                      )}

                      {form.type === 'Options' && (
                        <div className="space-y-2 rounded-lg border border-[#d4af37]/25 bg-[#d4af37]/5 p-2.5">
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            Example:{' '}
                            <span className="text-slate-200">NIFTY 24600 CE 07AUG</span> — use{' '}
                            <span className="text-slate-200">option premium</span> for Entry / Exit.
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              value={form.optStrike}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  optStrike: sanitizeDecimalInput(e.target.value),
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) e.preventDefault();
                              }}
                              className={`rounded-xl border px-3 py-2 text-sm ${inputClass}`}
                              placeholder="Strike *"
                              inputMode="decimal"
                              autoComplete="off"
                            />
                            <LuxSelect
                              value={form.optRight}
                              options={[
                                { value: 'CE', label: 'CE (Call)' },
                                { value: 'PE', label: 'PE (Put)' },
                              ]}
                              onChange={(v) => setForm({ ...form, optRight: v as OptionRight })}
                            />
                            <input
                              value={form.optExpiry}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  optExpiry: e.target.value
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9]/g, ''),
                                })
                              }
                              className={`rounded-xl border px-3 py-2 text-sm ${inputClass}`}
                              placeholder="Expiry 07AUG"
                              autoComplete="off"
                            />
                          </div>
                          {sanitizeString(form.optStrike) ? (
                            <p className="text-[11px] text-[var(--tf-text)]">
                              Script:{' '}
                              <span className="font-bold text-[#d4af37]">
                                {formatOptionContract(
                                  form.instrument || selectedSymbolMeta?.symbol || 'NIFTY',
                                  form.optStrike,
                                  form.optRight,
                                  form.optExpiry,
                                )}
                              </span>
                            </p>
                          ) : (
                            <p className="text-[10px] text-amber-400/90">
                              Enter the strike to complete the contract name.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                {form.market !== 'equity' && selectedGlobalMeta && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--tf-border)] bg-[var(--tf-elevated)] px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                    <span className="font-bold text-[var(--tf-text)]">{selectedGlobalMeta.symbol}</span>
                    <span>{selectedGlobalMeta.name}</span>
                    <span className="rounded bg-[var(--tf-surface)] border border-[var(--tf-border)] px-1.5 py-0.5 text-[10px] uppercase">{form.market}</span>
                    <span className="text-[10px]">Quote: {selectedGlobalMeta.quoteCurrency}</span>
                  </div>
                )}

                {form.market !== 'equity' && (
                  <input
                    value={form.instrument}
                    onChange={(e) => setForm({ ...form, instrument: e.target.value })}
                    className={`w-full rounded-xl border px-3 py-2 text-sm ${inputClass}`}
                    placeholder={
                      form.market === 'crypto'
                        ? 'Or type pair: BTC/USDT, ETHUSDT…'
                        : 'Or type pair: EUR/USD, XAUUSD, USDINR…'
                    }
                  />
                )}

                {form.market !== 'equity' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[10px] text-slate-500">P&amp;L currency</label>
                    <select
                      value={form.pnlCurrency}
                      onChange={(e) => setForm({ ...form, pnlCurrency: e.target.value as PnlCurrency })}
                      className={`rounded-lg border px-2 py-1 text-xs ${inputClass}`}
                    >
                      {form.market === 'crypto' ? (
                        <>
                          <option value="USDT">USDT</option>
                          <option value="USD">USD</option>
                          <option value="INR">INR</option>
                        </>
                      ) : (
                        <>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="INR">INR</option>
                        </>
                      )}
                    </select>
                  </div>
                )}
              </div>
              <input
                type="datetime-local"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
              />
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input
                    value={form.entryPrice}
                    onChange={(e) =>
                      setForm({ ...form, entryPrice: sanitizeDecimalInput(e.target.value) })
                    }
                    onKeyDown={(e) => {
                      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) e.preventDefault();
                    }}
                    className={`min-w-0 flex-1 rounded-xl border px-3 py-2 ${inputClass}`}
                    placeholder={form.type === 'Options' ? 'Entry premium' : 'Entry Price'}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                  {form.market === 'equity' && selectedSymbolMeta && selectedSymbolMeta.price > 0 && (
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-[var(--tf-border)] bg-[var(--tf-elevated)] px-2.5 text-[10px] font-bold text-[#d4af37] hover:border-[#d4af37]/40"
                      title="Fill entry from live LTP"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          entryPrice: String(Number(selectedSymbolMeta.price.toFixed(2))),
                        }));
                        setPnlManualOverride(false);
                      }}
                    >
                      LTP
                    </button>
                  )}
                </div>
              </div>

              <input
                value={form.exitPrice}
                onChange={(e) =>
                  setForm({ ...form, exitPrice: sanitizeDecimalInput(e.target.value) })
                }
                onKeyDown={(e) => {
                  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) e.preventDefault();
                }}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
                placeholder={form.type === 'Options' ? 'Exit premium' : 'Exit Price'}
                inputMode="decimal"
                autoComplete="off"
              />
              <div className="space-y-1">
                <input
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: sanitizeDecimalInput(e.target.value) })
                  }
                  onKeyDown={(e) => {
                    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) e.preventDefault();
                  }}
                  className={`w-full rounded-xl border px-3 py-2 ${inputClass}`}
                  placeholder={
                    form.market === 'crypto'
                      ? 'Quantity (coins / units)'
                      : form.market === 'forex'
                        ? form.quantityIsLots
                          ? `Lots · 1 lot = ${activeLotSize.toLocaleString()} units`
                          : 'Units'
                        : form.quantityIsLots
                          ? `Lots · 1 lot = ${activeLotSize} qty`
                          : 'Quantity / Qty (shares)'
                  }
                  inputMode="decimal"
                  autoComplete="off"
                />
                {form.market === 'forex' && (
                  <label className="flex items-center gap-2 text-[10px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.quantityIsLots}
                      onChange={(e) => setForm({ ...form, quantityIsLots: e.target.checked })}
                      className="rounded"
                    />
                    Standard forex lots (1 lot = 100,000 units)
                  </label>
                )}
                {form.market === 'equity' && selectedSymbolMeta?.isFno && (
                  <label className="flex items-center gap-2 text-[10px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.quantityIsLots}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          quantityIsLots: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    F&amp;O lots (P&amp;L = price diff × lot size × lots)
                  </label>
                )}
              </div>

              <div className="md:col-span-2 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/5 p-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#d4af37]">
                    {pnlFieldLabel(form.pnlCurrency)}
                  </label>
                  <div className="flex items-center gap-2">
                    {preview?.isAuto && !pnlManualOverride && (
                      <span className="text-[10px] text-emerald-400/90">Auto from prices</span>
                    )}
                    {pnlManualOverride && (
                      <button
                        type="button"
                        className="text-[10px] font-bold text-[#d4af37] underline-offset-2 hover:underline"
                        onClick={() => setPnlManualOverride(false)}
                      >
                        Recalculate
                      </button>
                    )}
                  </div>
                </div>
                <input
                  value={form.realizedPnl}
                  onChange={(e) => {
                    setPnlManualOverride(true);
                    setForm({
                      ...form,
                      realizedPnl: sanitizeSignedDecimalInput(e.target.value),
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) e.preventDefault();
                  }}
                  className={`w-full rounded-xl border px-2.5 py-2 tj-field tj-field--pnl ${inputClass}`}
                  placeholder={
                    canAutoComputePnl(form)
                      ? 'Auto-filled — edit to override'
                      : form.market === 'equity'
                        ? '2500  or  -1200  (or fill Entry+Exit+Qty)'
                        : '150  or  -80  (or fill Entry+Exit+Qty)'
                  }
                  inputMode="decimal"
                  autoComplete="off"
                />
                <p className="text-[10px] text-slate-500">
                  {preview && preview.rr > 0
                    ? `R:R ≈ ${preview.rr} · ${
                        form.quantityIsLots
                          ? `lot size ${preview.lotSize} · ${preview.lots} lot(s)`
                          : `${preview.positionSize} units`
                      }`
                    : 'Entry + Exit + Qty → P&L auto. Positive = profit, negative = loss.'}
                </p>
              </div>
              <input
                value={form.stopLoss}
                onChange={(e) =>
                  setForm({ ...form, stopLoss: sanitizeDecimalInput(e.target.value) })
                }
                onKeyDown={(e) => {
                  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) e.preventDefault();
                }}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
                placeholder="Stop Loss (optional)"
                inputMode="decimal"
                autoComplete="off"
              />
              <input
                value={form.target}
                onChange={(e) =>
                  setForm({ ...form, target: sanitizeDecimalInput(e.target.value) })
                }
                onKeyDown={(e) => {
                  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) e.preventDefault();
                }}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
                placeholder="Target (optional)"
                inputMode="decimal"
                autoComplete="off"
              />
              <LuxSelect
                value={form.side}
                options={[
                  { value: 'Buy', label: 'Buy' },
                  { value: 'Sell', label: 'Sell' },
                ]}
                onChange={(v) => {
                  setPnlManualOverride(false);
                  setForm({ ...form, side: v as TradeSide });
                }}
              />
              <LuxSelect
                value={form.type}
                options={
                  form.market === 'equity'
                    ? [
                        { value: 'Intraday', label: 'Intraday' },
                        { value: 'Swing', label: 'Swing' },
                        { value: 'Options', label: 'Options' },
                        { value: 'Futures', label: 'Futures' },
                      ]
                    : [
                        { value: 'Intraday', label: 'Intraday' },
                        { value: 'Swing', label: 'Swing' },
                      ]
                }
                onChange={(v) => {
                  const type = v as TradeType;
                  const underlying =
                    journalUnderlyingSymbol(form.instrument) ||
                    selectedSymbolMeta?.symbol ||
                    form.instrument;
                  const fnoLots =
                    form.market === 'equity' &&
                    (type === 'Futures' || type === 'Options') &&
                    Boolean(selectedSymbolMeta?.isFno);
                  setPnlManualOverride(false);
                  setForm({
                    ...form,
                    type,
                    instrument: type === 'Options' ? underlying : form.instrument,
                    optStrike: type === 'Options' ? form.optStrike : '',
                    optRight: type === 'Options' ? form.optRight : 'CE',
                    optExpiry: type === 'Options' ? form.optExpiry : '',
                    quantity:
                      fnoLots && !sanitizeString(form.quantity) ? '1' : form.quantity,
                    quantityIsLots: fnoLots
                      ? true
                      : form.market === 'forex'
                        ? form.quantityIsLots
                        : form.quantityIsLots && Boolean(selectedSymbolMeta?.isFno),
                  });
                }}
              />
              <input value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })} className={`rounded-xl border px-3 py-2 ${inputClass}`} placeholder="Broker (optional)" />
              <input value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} className={`rounded-xl border px-3 py-2 ${inputClass}`} placeholder="Strategy (optional)" />
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={`rounded-xl border px-3 py-2 md:col-span-2 ${inputClass}`} placeholder="Tags (comma separated)" />
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`rounded-xl border px-3 py-2 md:col-span-2 ${inputClass}`} rows={2} placeholder="Trade notes / execution details" />
              <TradePsychologyFields
                value={{
                  beforeEmotion: form.beforeEmotion,
                  afterEmotion: form.afterEmotion,
                  confidence: form.confidence,
                  discipline: form.discipline,
                  fearGreed: form.fearGreed,
                  psychologyNote: form.psychologyNote,
                }}
                onChange={(patch) => setForm({ ...form, ...patch })}
                inputClass={inputClass}
              />
              <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--tf-border)] bg-[var(--tf-elevated)] text-[var(--tf-text)] px-3 py-3 md:col-span-2 cursor-pointer hover:border-[#d4af37]/50 transition-colors">
                <Upload className="w-4 h-4" />
                Upload Screenshot
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </label>
              {uploadPreview && (
                <div className="md:col-span-2 rounded-xl border border-[#d4af37]/20 bg-[#d4af37]/5 p-3">
                  <p className="text-xs text-[#d4af37]">Screenshot ready — click to view full size</p>
                  <button
                    type="button"
                    onClick={() => openScreenshot(uploadPreview, editingId ? tradeStore.find((t) => t.id === editingId) : undefined)}
                    className="mt-2 block w-full rounded-lg overflow-hidden border border-[#d4af37]/30 hover:border-[#d4af37]/60 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                  >
                    <img src={uploadPreview} alt="Screenshot preview" className="h-32 w-full object-cover cursor-zoom-in" />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="tj-trade-preview">
                <p className="text-xs text-slate-500">Live P&amp;L preview</p>
                {preview ? (
                  <div className="mt-2 text-sm space-y-0.5">
                    <p className="text-xl font-bold">
                      <span className={preview.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatPnlAmount(
                          preview.pnl,
                          form.pnlCurrency || defaultPnlCurrency(form.market),
                        )}
                      </span>
                      <span className="text-xs font-normal text-slate-500 ml-2">
                        {preview.pnl >= 0 ? 'Profit' : 'Loss'}
                      </span>
                    </p>
                    {preview.rr > 0 && (
                      <p className="text-xs text-slate-500">Planned R:R ≈ {preview.rr}</p>
                    )}
                    {'notional' in preview && preview.notional > 0 && (
                      <p className="text-xs text-slate-500">ROI (if entry×qty): {preview.roi.toFixed(2)}%</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    Fill Entry + Exit + Qty for auto P&amp;L, or type P&amp;L manually.
                  </p>
                )}
              </div>
              <div className="tj-trade-preview">
                <p className="text-xs text-slate-500">Save</p>
                <p className="mt-2 text-sm text-slate-200">{editingId ? 'Update existing record' : 'Create new trade entry'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={handleSaveTrade} className="tj-btn tj-btn--primary">
                    {editingId ? 'Update Trade' : 'Save Trade'}
                  </button>
                  {editingId && (
                    <button type="button" onClick={resetForm} className="tj-btn tj-btn--ghost">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="tj-trades__rail space-y-4">
          <JournalTradeAssistPanel
            assist={formAssist}
            previewPnl={preview?.pnl ?? null}
            formatPnl={formatCurrency}
            activeTags={form.tags}
            onApplyTag={applyQuickTag}
            onApplyStrategy={(s) => setForm((prev) => ({ ...prev, strategy: s }))}
            onHunterReview={openHunterReview}
          />

          <div className="tj-card tj-rail-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="tj-chart__eyebrow">Find</p>
                <h2 className="text-base font-bold text-white">Filters</h2>
              </div>
              <Filter className="text-[#d4af37] w-4 h-4" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className={`w-full rounded-xl border pl-10 pr-3 py-2 ${inputClass}`} placeholder="Search instrument / strategy" />
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <input
                value={filters.strategy}
                onChange={(e) => setFilters({ ...filters, strategy: e.target.value })}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
                placeholder="Filter by strategy"
              />
              <input
                value={filters.broker}
                onChange={(e) => setFilters({ ...filters, broker: e.target.value })}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
                placeholder="Filter by broker"
              />
              <input
                value={filters.instrument}
                onChange={(e) => setFilters({ ...filters, instrument: e.target.value })}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
                placeholder="Filter by instrument"
              />
              <LuxSelect
                value={filters.tag}
                options={[{ value: '', label: 'All Tags' }, ...availableTags.map((tag) => ({ value: tag, label: tag }))]}
                onChange={(v) => setFilters({ ...filters, tag: v })}
                placeholder="All Tags"
              />
              <LuxSelect
                value={filters.market}
                options={[
                  { value: 'all', label: 'All Trades' },
                  { value: 'equity', label: 'Indian Equity' },
                  { value: 'crypto', label: 'Crypto' },
                  { value: 'forex', label: 'Forex' },
                ]}
                onChange={(v) => setFilters({ ...filters, market: v as 'all' | JournalMarket })}
              />
              <LuxSelect
                value={filters.pnl}
                options={[
                  { value: 'all', label: 'All P&L' },
                  { value: 'win', label: 'Win Only' },
                  { value: 'loss', label: 'Loss Only' },
                ]}
                onChange={(v) => setFilters({ ...filters, pnl: v as 'all' | 'win' | 'loss' })}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={handleExportCsv} className="rounded-full border border-[#d4af37]/40 px-3 py-1.5 text-sm text-[#d4af37]">
                <Download className="mr-1 inline w-4 h-4" /> Export CSV
              </button>
              <button onClick={handleExportJson} className="rounded-full border border-[#d4af37]/40 px-3 py-1.5 text-sm text-[#d4af37]">
                Export JSON
              </button>
            </div>
            {syncStatus !== 'Ready' && (
              <p className={`mt-3 text-xs ${isSyncing ? 'text-amber-400' : 'text-emerald-400'}`}>
                {isSyncing ? '⟳ ' : '✓ '}{syncStatus}
              </p>
            )}
          </div>

          <div className="tj-card tj-rail-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="tj-chart__eyebrow">Habits</p>
                <h2 className="text-base font-bold text-white">Goals</h2>
              </div>
              <Sparkles className="text-[#d4af37] w-4 h-4" />
            </div>
            <div className="mt-3 grid gap-3">
              <div className="tj-trade-preview">
                <div className="flex items-center justify-between text-sm">
                  <span>Goal Tracking</span>
                  <span className="text-[#d4af37] font-bold">{goalProgress.toFixed(0)}%</span>
                </div>
                <div className="tj-goal-track mt-2">
                  <motion.span
                    className="tj-goal-track__fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(goalProgress, 100))}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </div>
                  <input type="range" min={1000} max={50000} step={500} value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))} className="mt-2 w-full accent-[#d4af37]" />
              </div>
              <div className="tj-trade-preview flex items-center justify-between">
                <span className="text-sm">Challenge Mode</span>
                <button type="button" onClick={() => setChallengeMode(!challengeMode)} className={`rounded-full px-3 py-1 text-xs font-bold ${challengeMode ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-200'}`}>
                  {challengeMode ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>

          <div className="tj-card tj-rail-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="tj-chart__eyebrow">Coach</p>
                <h2 className="text-base font-bold text-white">Desk tips</h2>
              </div>
              <Brain className="text-[#d4af37] w-4 h-4" />
            </div>
            <div className="space-y-2">
              {coachTips.slice(0, 3).map((tip, index) => (
                <motion.div
                  key={tip.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className={`tj-tip tj-tip--${tip.tone}`}
                >
                  <p className="tj-tip__title">{tip.title}</p>
                  <p className="tj-tip__detail">{tip.detail}</p>
                </motion.div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="tj-mini-stat">
                <span>Discipline</span>
                <strong>{disciplineScore}</strong>
              </div>
              <div className="tj-mini-stat">
                <span>Confidence</span>
                <strong>{emotionAverage}%</strong>
              </div>
              <div className="tj-mini-stat">
                <span>Shots</span>
                <strong>{totalScreenshots}</strong>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="tj-card overflow-hidden" ref={tradeLogRef}>
        <div className="p-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Table2 className="w-5 h-5 text-[#d4af37]" /> Trade Log
            <span className="text-xs font-normal text-slate-500">({sortedTrades.length})</span>
          </h2>
          <div className="flex gap-2 text-[10px]">
            {(['date', 'pnl', 'rr', 'instrument'] as TradeSortKey[]).map((key) => (
              <button key={key} type="button" onClick={() => toggleSort(key)} className={`px-2 py-1 rounded border capitalize ${sortKey === key ? 'border-[#d4af37]/50 text-[#d4af37]' : 'border-[#1a1f2e] text-slate-500'}`}>
                {key} <ChevronDown className={`inline w-3 h-3 ${sortKey === key && sortDir === 'asc' ? 'rotate-180' : ''}`} />
              </button>
            ))}
          </div>
        </div>
        {sortedTrades.length === 0 ? (
          <div className="tj-empty py-12">
            <Table2 className="w-8 h-8 text-[#d4af37]/70" />
            <p className="tj-empty__title">No trades yet</p>
            <p className="tj-empty__sub">Fill the desk form — AI rail tracks completeness until you hit Save.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#121520] text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Instrument</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3">Strategy</th>
                  <th className="px-4 py-3 text-right">Entry</th>
                  <th className="px-4 py-3 text-right">Exit</th>
                  <th className="px-4 py-3 text-right">R:R</th>
                  <th className="px-4 py-3 text-right">P&L</th>
                  <th className="px-4 py-3 text-center">Shot</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((trade, i) => (
                  <motion.tr
                    key={trade.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="border-t border-[#1a1f2e]/80 hover:bg-[#121520]/60"
                  >
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(trade.date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {trade.instrument}
                      <span className="block text-[10px] text-slate-500 font-normal">
                        {tradeMarket(trade) === 'crypto'
                          ? 'Crypto'
                          : tradeMarket(trade) === 'forex'
                            ? 'Forex'
                            : 'Equity'}
                        {' · '}{trade.type}
                      </span>
                      {trade.beforeEmotion && trade.afterEmotion && (
                        <span className="block text-[10px] text-violet-400/80 font-normal">{trade.beforeEmotion} → {trade.afterEmotion}</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded ${trade.side === 'Buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{trade.side}</span></td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{trade.strategy}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{trade.entryPrice}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{trade.exitPrice}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#d4af37]">
                      {Number(trade.rr ?? 0).toFixed(2)}x
                    </td>
                    <td className={`px-4 py-3 text-right font-bold tabular-nums ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      <span className="inline-flex items-center gap-0.5 justify-end">{trade.pnl >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}{formatPnlAmount(trade.pnl, tradePnlCurrency(trade))}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {trade.screenshot ? (
                        <button
                          type="button"
                          onClick={() => openScreenshot(trade.screenshot!, trade)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#d4af37]/30 bg-[#d4af37]/10 px-2 py-1 text-[10px] font-bold text-[#d4af37] hover:bg-[#d4af37]/20"
                          title="View screenshot"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          View
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => handleEditTrade(trade)} className="text-[#d4af37] hover:underline text-xs mr-2">Edit</button>
                      <button type="button" onClick={() => handleDeleteTrade(trade.id)} className="text-red-400 hover:underline text-xs">Del</button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </motion.div>
      )}

      {activeTab === 'analytics' && (
        <JournalAnalyticsDesk
          trades={filteredTrades}
          monthly={metrics.monthly}
          strategyData={strategyData}
          riskData={riskData}
          instrumentData={instrumentData}
          advanced={advanced}
          formatCurrency={formatCurrency}
        />
      )}

      {activeTab === 'calendar' && (
        <motion.div
          className="tj-cal-page grid gap-3.5 xl:grid-cols-[1.25fr_0.75fr]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <div className="tj-card p-3.5 sm:p-4">
            <JournalCalendar trades={visibleTrades} mutedClass={mutedClass} />
          </div>
          <div className="space-y-3.5">
            <div className="tj-card p-3.5">
              <p className="tj-chart__eyebrow">Edge by weekday</p>
              <h3 className="tj-chart__title mb-3">Weekday P&L</h3>
              <div className="tj-cal-weekgrid">
                {heatmapData.map((item, i) => (
                  <motion.div
                    key={item.day}
                    className="tj-cal-weekcell"
                    initial={{ opacity: 0, y: 10, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.06 + i * 0.05 }}
                    whileHover={{ y: -3, scale: 1.04 }}
                  >
                    <p>{item.day}</p>
                    <strong style={{ color: getTradeColor(item.pnl) }}>{formatCurrency(item.pnl)}</strong>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="tj-card p-3.5">
              <p className="tj-chart__eyebrow">Recent flow</p>
              <h3 className="tj-chart__title mb-3">Replay Timeline</h3>
              <div className="tj-cal-replay space-y-2 max-h-[300px] overflow-y-auto">
                {replayTimeline.length ? (
                  replayTimeline.map((trade, i) => (
                    <motion.div
                      key={trade.id}
                      className={`tj-cal-replay__row ${trade.pnl >= 0 ? 'is-up' : 'is-down'}`}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.04 + i * 0.03 }}
                    >
                      <div>
                        <p className="tj-cal-replay__name">{trade.instrument}</p>
                        <p className="tj-cal-replay__meta">
                          {new Date(trade.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </p>
                      </div>
                      <p className="tj-cal-replay__pnl">{formatCurrency(trade.pnl)}</p>
                    </motion.div>
                  ))
                ) : (
                  <p className="tj-cal__empty-note">Log trades to fill the replay tape.</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <JournalAlertsCoach
        alerts={notifications}
        tips={coachTips}
        syncStatus={syncStatus}
        onHunterReview={openHunterReview}
      />
    </div>
  );
}
