import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CalendarRange,
  ChevronDown,
  Download,
  Filter,
  Goal,
  LayoutGrid,
  LineChart,
  NotebookPen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  Upload,
  ImageIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
} from '../services/globalInstrumentService';
import type { GlobalInstrumentSelection } from '../services/globalInstrumentService';
import {
  autoSyncJournal,
  canCloudSync,
  hydrateJournalFromCloud,
} from '../services/journalSyncService';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import TradePsychologyFields, { DEFAULT_TRADE_PSYCHOLOGY } from './trader/TradePsychologyFields';
import ImageLightbox from './journal/ImageLightbox';
import JournalCalendar from './journal/JournalCalendar';
import type { JournalSymbolSelection } from '../services/equitySymbolService';

const JournalSymbolPicker = lazy(() => import('./journal/JournalSymbolPicker'));
const GlobalInstrumentPicker = lazy(() => import('./journal/GlobalInstrumentPicker'));
import {
  calculateJournalTradeMetrics,
  getInstrumentLotSize,
} from '../services/journalTradeCalc';

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

const EMPTY_FORM: TradeFormState = {
  market: 'equity',
  pnlCurrency: 'INR',
  instrument: '',
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
  date: new Date().toISOString().slice(0, 16),
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
  const winningTrades = trades.filter((trade) => trade.pnl > 0);
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const avgRR = totalTrades
    ? trades.reduce((sum, trade) => sum + trade.rr, 0) / totalTrades
    : 0;
  const winRate = totalTrades ? (winningTrades.length / totalTrades) * 100 : 0;
  const best = trades.reduce((best, trade) => (trade.pnl > best.pnl ? trade : best), trades[0] ?? { pnl: 0 } as TradeRecord);
  const worst = trades.reduce((worst, trade) => (trade.pnl < worst.pnl ? trade : worst), trades[0] ?? { pnl: 0 } as TradeRecord);

  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].pnl > 0) streak += 1;
    else break;
  }

  const monthly = Array.from({ length: 6 }, (_, index) => {
    const start = new Date();
    start.setMonth(start.getMonth() - (5 - index));
    const monthLabel = start.toLocaleString('en-US', { month: 'short' });
    const monthTrades = trades.filter((trade) => new Date(trade.date).getMonth() === start.getMonth() && new Date(trade.date).getFullYear() === start.getFullYear());
    const monthPnl = monthTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    return { label: monthLabel, pnl: monthPnl, trades: monthTrades.length };
  });

  return { totalTrades, totalPnl, avgRR, winRate, best, worst, streak, monthly };
}

function buildAdvancedMetrics(trades: TradeRecord[]) {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const expectancy = trades.length ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0;

  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let peak = 0;
  let cum = 0;
  let maxDrawdown = 0;
  sorted.forEach((t) => {
    cum += t.pnl;
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
    cum += t.pnl;
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
    const existing = map.get(trade.strategy) ?? { pnl: 0, trades: 0 };
    existing.pnl += trade.pnl;
    existing.trades += 1;
    map.set(trade.strategy, existing);
  });

  return Array.from(map.entries()).map(([strategy, value]) => ({ strategy, pnl: value.pnl, trades: value.trades }));
}

function buildInstrumentData(trades: TradeRecord[]) {
  const map = new Map<string, number>();
  trades.forEach((trade) => {
    map.set(trade.instrument, (map.get(trade.instrument) ?? 0) + trade.pnl);
  });
  return Array.from(map.entries()).map(([instrument, pnl]) => ({ instrument, pnl }));
}

function buildRiskData(trades: TradeRecord[]) {
  return [
    { name: 'Low Risk', value: trades.filter((trade) => trade.rr >= 1.5).length },
    { name: 'Medium Risk', value: trades.filter((trade) => trade.rr >= 1 && trade.rr < 1.5).length },
    { name: 'High Risk', value: trades.filter((trade) => trade.rr < 1).length },
  ];
}

function buildHeatmap(trades: TradeRecord[]) {
  const data = [
    { day: 'Mon', pnl: 0 },
    { day: 'Tue', pnl: 0 },
    { day: 'Wed', pnl: 0 },
    { day: 'Thu', pnl: 0 },
    { day: 'Fri', pnl: 0 },
  ];

  trades.forEach((trade) => {
    const dayIndex = new Date(trade.date).getDay();
    const mappedIndex = dayIndex === 0 ? 5 : dayIndex - 1;
    data[mappedIndex].pnl += trade.pnl;
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

function getMissingTradeFields(input: TradeFormState): string[] {
  const missing: string[] = [];
  if (!sanitizeString(input.instrument)) missing.push('Instrument');
  if (!sanitizeString(input.date)) missing.push('Date');
  if (parseManualPnl(input.realizedPnl) === null) missing.push('Profit / Loss');
  return missing;
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

  return {
    ...form,
    broker: sanitizeString(form.broker) || 'Not specified',
    strategy: sanitizeString(form.strategy) || 'Manual',
    stopLoss: form.stopLoss.trim() || String(defaultSl),
    target: form.target.trim() || String(defaultTarget),
  };
}

function isTradeComplete(input: TradeFormState) {
  return (
    sanitizeString(input.instrument).length > 0 &&
    sanitizeString(input.date).length > 0 &&
    hasManualPnl(input)
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
}: {
  user: User | null;
  isAdmin: boolean;
}) {
  const [tradeStore, setTradeStore] = useState<TradeRecord[]>([]);
  const skipPersistRef = useRef(true);
  const syncLockRef = useRef(false);
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
  const [goalTarget, setGoalTarget] = useState(5000);
  const [challengeMode, setChallengeMode] = useState(true);
  const [syncStatus, setSyncStatus] = useState('Ready');
  const [statusMessage, setStatusMessage] = useState('Add a completed trade to start your journal.');
  const [form, setForm] = useState<TradeFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const [lightbox, setLightbox] = useState<{ src: string; title?: string; subtitle?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<JournalTab>('overview');
  const [, setShowTradeForm] = useState(true);
  const [sortKey, setSortKey] = useState<TradeSortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!user) {
      setTradeStore([]);
      setSyncStatus('Sign in to sync');
      return;
    }

    let cancelled = false;
    skipPersistRef.current = true;
    setIsSyncing(true);
    setSyncStatus('Syncing journal…');

    hydrateJournalFromCloud(user).then((trades) => {
      if (cancelled) return;
      setTradeStore(trades);
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
      hydrateJournalFromCloud(user).then((merged) => {
        skipPersistRef.current = true;
        setTradeStore(merged);
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
        setTradeStore(trades);
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
      const matchesSearch = `${trade.instrument} ${trade.strategy} ${trade.broker} ${tradeTags(trade).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesStrategy = strategyQuery
        ? trade.strategy.toLowerCase().includes(strategyQuery)
        : true;
      const matchesBroker = brokerQuery
        ? trade.broker.toLowerCase().includes(brokerQuery)
        : true;
      const matchesInstrument = instrumentQuery
        ? trade.instrument.toLowerCase().includes(instrumentQuery)
        : true;
      const matchesTag = filters.tag ? tradeTags(trade).includes(filters.tag) : true;
      const matchesPnl = filters.pnl === 'all'
        ? true
        : filters.pnl === 'win'
          ? trade.pnl > 0
          : trade.pnl < 0;
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
      if (sortKey === 'date') cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortKey === 'pnl') cmp = a.pnl - b.pnl;
      else if (sortKey === 'rr') cmp = a.rr - b.rr;
      else cmp = a.instrument.localeCompare(b.instrument);
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

  const coachInsights = useMemo(() => {
    const insights: string[] = [];
    const repeatedTags = [...new Set(filteredTrades.flatMap((trade) => tradeTags(trade)))]
      .map((tag) => ({ tag, count: filteredTrades.filter((trade) => tradeTags(trade).includes(tag)).length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    if (metrics.winRate < 50) insights.push('Win rate below target. Focus on cleaner entries and patient execution.');
    if (metrics.streak > 0 && metrics.streak < 3) insights.push('Momentum is improving. Keep process strict and avoid overtrading.');
    if (metrics.streak === 0 && metrics.totalTrades > 0) insights.push('Neutral phase detected. Revisit your trade checklist before next setup.');
    if (metrics.avgRR < 1.5) insights.push('Average reward-to-risk is low. Improve trade quality and preserve edge.');
    if (disciplineScore < 75) insights.push('Discipline score is below target. Reintroduce stop-loss respect and pre-trade review.');
    if (repeatedTags.some((item) => item.count >= 2)) insights.push(`Repeat pattern detected: ${repeatedTags[0].tag}. Review recent calls tagged ${repeatedTags[0].tag}.`);
    if (!insights.length) insights.push('Your process looks clean. Keep consistency and protect your edge.');

    return insights.slice(0, 5);
  }, [disciplineScore, filteredTrades, metrics]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    if (disciplineScore < 75) items.push({ id: 'disc', title: 'Discipline alert', detail: 'Your recent discipline score is below target. Review your notes before next trade.', tone: 'warning' });
    if (metrics.winRate < 50) items.push({ id: 'winrate', title: 'Win rate watch', detail: 'Improve entry quality and execution rhythm to raise consistency.', tone: 'info' });
    if (challengeMode) items.push({ id: 'challenge', title: 'Challenge mode active', detail: 'Daily goal tracking is enabled for consistency and habit building.', tone: 'good' });
    return items;
  }, [challengeMode, disciplineScore, metrics.winRate]);

  const [selectedSymbolMeta, setSelectedSymbolMeta] = useState<JournalSymbolSelection | null>(null);
  const [selectedGlobalMeta, setSelectedGlobalMeta] = useState<GlobalInstrumentSelection | null>(null);

  useEffect(() => {
    if (form.market !== 'equity' || !form.instrument) {
      setSelectedSymbolMeta(null);
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
    return getInstrumentLotSize(form.instrument || 'NIFTY', 'equity');
  }, [form.instrument, form.market, form.quantityIsLots, selectedSymbolMeta]);

  const preview = useMemo(() => {
    const normalized = normalizeFormForSave(form);
    const manual = parseManualPnl(normalized.realizedPnl);

    if (manual !== null) {
      const entryPrice = parseNumber(normalized.entryPrice) ?? 0;
      const quantity = parseNumber(normalized.quantity) ?? 1;
      const invested = entryPrice * quantity;
      return {
        pnl: manual,
        netPnl: manual,
        rr: 0,
        brokerage: 0,
        roi: invested > 0 ? Number(((manual / invested) * 100).toFixed(2)) : 0,
        positionSize: quantity,
        lots: quantity,
        lotSize: getInstrumentLotSize(
          normalized.instrument,
          normalized.market,
          normalized.market === 'forex' && normalized.quantityIsLots,
        ),
        notional: invested,
        isManual: true,
      };
    }

    return null;
  }, [form]);

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
      instrument: '',
      pnlCurrency: defaultPnlCurrency(market),
      quantityIsLots: market === 'forex',
      type: market === 'equity' ? prev.type : 'Intraday',
    }));
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
      sel.isFno && (form.type === 'Futures' || form.type === 'Options');

    setForm((prev) => ({
      ...prev,
      instrument: sel.symbol,
      quantityIsLots: useLots,
    }));
  };

  const totalScreenshots = filteredTrades.filter((trade) => trade.screenshot).length;
  const goalProgress = Math.min((metrics.totalPnl / goalTarget) * 100, 100);

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
    setForm(EMPTY_FORM);
    setEditingId(null);
    setUploadPreview('');
  };

  const handleSaveTrade = () => {
    if (!user) {
      setStatusMessage('Please log in to save trades.');
      return;
    }

    const missing = getMissingTradeFields(form);
    if (missing.length > 0) {
      setStatusMessage(`Missing required: ${missing.join(', ')}. Broker & strategy are optional.`);
      return;
    }

    const normalizedForm = normalizeFormForSave(form);
    const record = parseFormToTradeRecord(
      normalizedForm,
      user,
      editingId ?? undefined,
      editingId ? tradeStore.find((trade) => trade.id === editingId)?.createdAt : undefined,
    );
    if (!record) {
      setStatusMessage('Invalid trade data. Check entry, exit, and quantity values.');
      return;
    }

    const nextRecord = {
      ...record,
      screenshot: uploadPreview || undefined,
      updatedAt: new Date().toISOString(),
    };

    let nextStore: TradeRecord[];
    if (editingId) {
      nextStore = tradeStore.map((trade) => (trade.id === editingId ? nextRecord : trade));
      setStatusMessage('Trade updated successfully.');
    } else {
      nextStore = [nextRecord, ...tradeStore];
      setStatusMessage('Trade saved successfully. View it in the Trades tab.');
    }

    setTradeStore(nextStore);
    skipPersistRef.current = false;
    autoSyncJournal(user, nextStore).then((result) => {
      setSyncStatus(result.message);
      if (!result.ok) {
        setStatusMessage('Trade saved but sync failed. Storage may be full — remove screenshots.');
      }
    });
    setActiveTab('trades');
    setSearch('');
    setFilters({ strategy: '', broker: '', instrument: '', tag: '', market: 'all', pnl: 'all' });
    resetForm();
  };

  const handleEditTrade = (trade: TradeRecord) => {
    if (!user) return;
    if (!isAdmin && trade.ownerId !== user.id) return;

    const mkt = tradeMarket(trade);
    const lotSize = getInstrumentLotSize(
      trade.instrument,
      mkt,
      mkt === 'forex' && trade.positionSize >= 1000,
    );
    const isLots =
      mkt === 'forex' ||
      (lotSize > 1 && Math.abs(trade.quantity * lotSize - trade.positionSize) < 1);

    setForm({
      market: mkt,
      pnlCurrency: tradePnlCurrency(trade),
      instrument: trade.instrument,
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
    if (mkt === 'crypto' || mkt === 'forex') {
      setSelectedGlobalMeta(createManualGlobalInstrument(mkt, trade.instrument));
      setSelectedSymbolMeta(null);
    } else {
      setSelectedGlobalMeta(null);
    }
    setStatusMessage('Editing trade — click Update Trade to save changes.');
  };

  const handleDeleteTrade = (tradeId: string) => {
    if (!user) return;

    const target = tradeStore.find((trade) => trade.id === tradeId);
    if (!target) return;
    if (!isAdmin && target.ownerId !== user.id) {
      setStatusMessage('You can only delete your own trades.');
      return;
    }

    setTradeStore((prev) => prev.filter((trade) => trade.id !== tradeId));
    if (editingId === tradeId) resetForm();
    setStatusMessage('Trade deleted successfully.');
  };

  const handleExportCsv = () => {
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
      trade.ownerEmail,
    ].join(','));

    downloadFile('trading-journal.csv', ['date,instrument,side,entryPrice,exitPrice,stopLoss,target,quantity,pnl,rr,brokerage,strategy,ownerEmail', ...rows].join('\n'), 'text/csv');
  };

  const handleExportJson = () => {
    downloadFile('trading-journal.json', JSON.stringify(filteredTrades, null, 2), 'application/json');
  };

  const handleSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncStatus('Syncing…');
    skipPersistRef.current = true;
    const merged = await hydrateJournalFromCloud(user);
    setTradeStore(merged);
    const result = await autoSyncJournal(user, merged);
    setSyncStatus(result.message);
    skipPersistRef.current = false;
    setIsSyncing(false);
  };

  const availableTags = Array.from(new Set(visibleTrades.flatMap((trade) => tradeTags(trade))));

  const chartTheme = useChartTheme();
  const mutedClass = 'text-dark-muted';
  const inputClass =
    'tf-field border focus:border-gold/40 focus:outline-none rounded-lg';

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
    <div className="space-y-4 pb-8">
      <ImageLightbox
        src={lightbox?.src ?? null}
        title={lightbox?.title}
        subtitle={lightbox?.subtitle}
        onClose={() => setLightbox(null)}
      />
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-[#1a1f2e] bg-gradient-to-br from-[#121520] via-[#0b0e17] to-[#080a12] p-5">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#d4af37]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#d4af37] font-bold">Professional Journal</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Trading Journal</h1>
            <p className={`${mutedClass} text-sm mt-1 max-w-xl`}>
              NSE/BSE, crypto &amp; forex — log any market with manual P&amp;L.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 py-1.5 text-xs font-semibold text-[#d4af37]">
              {isAdmin ? 'Admin · All Traders' : user.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setActiveTab('trades');
                setShowTradeForm(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-bold text-[#0b0e17] hover:bg-[#e8c04a]"
            >
              <Plus className="w-4 h-4" /> Log Trade
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="rounded-lg border border-[#1a1f2e] px-4 py-2 text-sm text-slate-300 hover:border-[#d4af37]/40 disabled:opacity-50"
            >
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" onClick={handleExportCsv} className="rounded-lg border border-[#1a1f2e] px-3 py-2 text-slate-400 hover:text-[#d4af37]" title="Export CSV">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: 'Net P&L', value: netPnlDisplay.text, sub: `${metrics.totalTrades} trades`, up: metrics.totalPnl >= 0 },
            { label: 'Win Rate', value: `${metrics.winRate.toFixed(1)}%`, sub: `${advanced.winCount}W / ${advanced.lossCount}L` },
            { label: 'Profit Factor', value: advanced.profitFactor >= 99 ? '∞' : advanced.profitFactor.toFixed(2), sub: 'gross P / gross L' },
            { label: 'Expectancy', value: formatCurrency(advanced.expectancy), sub: 'per trade' },
            { label: 'Avg R:R', value: `${metrics.avgRR.toFixed(2)}x`, sub: 'risk-reward' },
            { label: 'Max Drawdown', value: formatCurrency(advanced.maxDrawdown), sub: `${metrics.streak}W streak`, up: false },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-[#0b0e17]/80 border border-[#1a1f2e] px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className={`text-base font-bold tabular-nums ${s.up === true ? 'text-emerald-400' : s.up === false && s.label === 'Max Drawdown' ? 'text-red-400' : s.label === 'Net P&L' ? (metrics.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-white'}`}>
                {s.value}
              </div>
              <div className="text-[9px] text-slate-600">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0b0e17] border border-[#1a1f2e] overflow-x-auto">
        {journalTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === id ? 'bg-[#d4af37] text-[#0b0e17]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className={`rounded-lg px-4 py-2.5 text-sm border ${
        statusMessage.includes('success') || statusMessage.includes('updated') || statusMessage.includes('added')
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          : 'bg-[#121520] border-[#1a1f2e] text-slate-300'
      }`}>
        {statusMessage}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2 app-card p-4">
              <h3 className="text-sm font-bold text-[#d4af37] mb-3 flex items-center gap-2">
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
                <p className="text-sm text-slate-500 py-16 text-center">Log trades to build your equity curve.</p>
              )}
            </div>
            <div className="space-y-4">
              <div className="app-card p-4">
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
              <div className="app-card p-4">
                <h3 className="text-xs font-bold text-[#d4af37] mb-2 flex items-center gap-1"><Brain className="w-3.5 h-3.5" /> Coach</h3>
                {coachInsights.slice(0, 3).map((insight) => (
                  <p key={insight} className="text-[11px] text-slate-400 leading-snug mb-2 last:mb-0">• {insight}</p>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="app-card p-4">
              <p className="text-sm font-semibold text-white mb-2">Win / Loss Distribution</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{ name: 'Win', value: advanced.winCount || 0.1 }, { name: 'Loss', value: advanced.lossCount || 0.1 }]} dataKey="value" innerRadius={40} outerRadius={65}>
                      <Cell fill="#10b981" /><Cell fill="#f43f5e" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="app-card p-4">
              <p className="text-sm font-semibold text-white mb-2">Monthly P&L</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {metrics.monthly.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? '#10b981' : '#f43f5e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'trades' && (
      <>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#1a1f2e] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Add / Edit Trade</h2>
                <p className={`${mutedClass} text-sm`}>Required: symbol, date, profit/loss. Prices & qty — manual only (no auto-fill).</p>
              </div>
              <NotebookPen className="text-[#d4af37]" />
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
                            : 'border-[#24324b] bg-[#172033] text-slate-400 hover:border-[#d4af37]/40'
                        }`}
                      >
                        <span className="block text-xs font-bold">{opt.label}</span>
                        <span className="block text-[10px] opacity-80">{opt.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Instrument * —{' '}
                  {form.market === 'equity'
                    ? 'NSE / BSE stocks & indices'
                    : form.market === 'crypto'
                      ? 'crypto pair (search or type e.g. BTC/USDT)'
                      : 'forex pair (EUR/USD, XAU/USD, USD/INR…)'}
                </p>

                {form.market === 'equity' ? (
                  <Suspense
                    fallback={
                      <div className="rounded-lg border border-[#24324b] bg-[#172033] px-3 py-4 text-xs text-slate-500">
                        Loading NSE / BSE symbol list…
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
                      <div className="rounded-lg border border-[#24324b] bg-[#172033] px-3 py-4 text-xs text-slate-500">
                        Loading {form.market} instruments…
                      </div>
                    }
                  >
                    <GlobalInstrumentPicker
                      market={form.market}
                      selectedSymbol={form.instrument}
                      onSelect={handleGlobalInstrumentSelect}
                    />
                  </Suspense>
                )}

                {form.market === 'equity' && selectedSymbolMeta && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#24324b] bg-[#0d1728] px-3 py-2 text-xs text-slate-500">
                    <span className="font-bold text-slate-300">{selectedSymbolMeta.symbol}</span>
                    <span>{selectedSymbolMeta.name}</span>
                    <span className="rounded bg-[#172033] px-1.5 py-0.5 text-[10px]">{selectedSymbolMeta.exchange}</span>
                    <span className="text-[10px]">Reference only — enter prices manually below</span>
                  </div>
                )}
                {form.market !== 'equity' && selectedGlobalMeta && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#24324b] bg-[#0d1728] px-3 py-2 text-xs text-slate-500">
                    <span className="font-bold text-slate-300">{selectedGlobalMeta.symbol}</span>
                    <span>{selectedGlobalMeta.name}</span>
                    <span className="rounded bg-[#172033] px-1.5 py-0.5 text-[10px] uppercase">{form.market}</span>
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
              <input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`rounded-xl border px-3 py-2 ${inputClass}`} />
              <input value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} className={`rounded-xl border px-3 py-2 ${inputClass}`} placeholder="Entry Price" inputMode="decimal" />
              <input value={form.exitPrice} onChange={(e) => setForm({ ...form, exitPrice: e.target.value })} className={`rounded-xl border px-3 py-2 ${inputClass}`} placeholder="Exit Price" inputMode="decimal" />
              <div className="md:col-span-2 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/5 p-3 space-y-1">
                <label className="text-xs font-bold text-[#d4af37]">{pnlFieldLabel(form.pnlCurrency)}</label>
                <input
                  value={form.realizedPnl}
                  onChange={(e) => setForm({ ...form, realizedPnl: e.target.value })}
                  className={`w-full rounded-xl border px-3 py-2.5 text-lg font-bold ${inputClass}`}
                  placeholder={
                    form.market === 'equity'
                      ? 'Profit: 2500  or  Loss: -1200'
                      : 'Profit: 150  or  Loss: -80'
                  }
                  inputMode="decimal"
                />
                <p className="text-[10px] text-slate-500">Positive = profit, negative (-) = loss. This is saved as your trade P&amp;L.</p>
              </div>
              <input value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} className={`rounded-xl border px-3 py-2 ${inputClass}`} placeholder="Stop Loss (optional)" inputMode="decimal" />
              <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className={`rounded-xl border px-3 py-2 ${inputClass}`} placeholder="Target (optional)" inputMode="decimal" />
              <div className="space-y-1">
                <input
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className={`w-full rounded-xl border px-3 py-2 ${inputClass}`}
                  placeholder={
                    form.market === 'crypto'
                      ? 'Quantity (coins / units) — optional'
                      : form.market === 'forex'
                        ? form.quantityIsLots
                          ? `Lots · 1 standard lot = ${activeLotSize.toLocaleString()} units`
                          : 'Units (optional) — or enable standard lots below'
                        : form.quantityIsLots
                          ? `Lots (manual) · 1 lot = ${activeLotSize} shares`
                          : 'Quantity / Qty (shares) — optional'
                  }
                  inputMode="numeric"
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
                    F&amp;O lots mode (P&amp;L = price diff × lot size × lots)
                  </label>
                )}
              </div>
              <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as TradeSide })} className={`rounded-xl border px-3 py-2 ${inputClass}`}>
                <option value="Buy">Buy</option>
                <option value="Sell">Sell</option>
              </select>
              <select
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as TradeType;
                  setForm({
                    ...form,
                    type,
                    quantityIsLots:
                      (type === 'Futures' || type === 'Options') && Boolean(selectedSymbolMeta?.isFno)
                        ? true
                        : form.quantityIsLots && Boolean(selectedSymbolMeta?.isFno),
                  });
                }}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
              >
                <option value="Intraday">Intraday</option>
                <option value="Swing">Swing</option>
                {form.market === 'equity' && (
                  <>
                    <option value="Options">Options</option>
                    <option value="Futures">Futures</option>
                  </>
                )}
              </select>
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
              <label className={`flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 md:col-span-2 ${inputClass}`}>
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
              <div className="rounded-xl bg-[#111827] p-3">
                <p className="text-xs text-slate-500">Real-time Preview</p>
                {preview ? (
                  <div className="mt-2 text-sm space-y-0.5">
                    <p className="text-xs text-slate-500">Your entered P&amp;L</p>
                    <p className="text-xl font-bold">
                      <span className={preview.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatCurrency(preview.pnl)}
                      </span>
                      <span className="text-xs font-normal text-slate-500 ml-2">
                        {preview.pnl >= 0 ? 'Profit' : 'Loss'}
                      </span>
                    </p>
                    {preview.notional > 0 && (
                      <p className="text-xs text-slate-500">ROI (if entry×qty filled): {preview.roi.toFixed(2)}%</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">Enter symbol, date, and profit/loss amount.</p>
                )}
              </div>
              <div className="rounded-xl bg-[#111827] p-3">
                <p className="text-xs text-slate-500">Save Mode</p>
                <p className="mt-2 text-sm text-slate-200">{editingId ? 'Update existing trade record' : 'Create a new real trade entry'}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={handleSaveTrade} className="rounded-xl bg-[#d4af37] px-4 py-2 font-bold text-[#0b0e17] hover:bg-[#e8c04a]">
                    {editingId ? 'Update Trade' : 'Save Trade'}
                  </button>
                  {editingId && (
                    <button onClick={resetForm} className="rounded-xl border border-[#1a1f2e] px-4 py-2 text-sm text-slate-200">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1a1f2e] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">AI Trading Coach</h2>
                <p className={`${mutedClass} text-sm`}>Behavior and execution insights from your saved trades.</p>
              </div>
              <Brain className="text-[#d4af37]" />
            </div>
            <div className="mt-3 space-y-2">
              {coachInsights.map((insight, index) => (
                <motion.div key={insight} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} className="rounded-xl border border-[#1a1f2e] bg-[#111827]/80 p-3 text-sm text-slate-200">
                  <span className="mr-2 text-[#d4af37]">•</span>
                  {insight}
                </motion.div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[#111827] p-3">
                <p className="text-xs text-slate-500">Discipline (Profile)</p>
                <p className="mt-1 text-lg font-bold text-[#d4af37]">{disciplineScore}/100</p>
              </div>
              <div className="rounded-xl bg-[#111827] p-3">
                <p className="text-xs text-slate-500">Confidence (Profile)</p>
                <p className="mt-1 text-lg font-bold text-emerald-400">{emotionAverage}%</p>
              </div>
              <div className="rounded-xl bg-[#111827] p-3">
                <p className="text-xs text-slate-500">Screenshots</p>
                <p className="mt-1 text-lg font-bold text-[#d4af37]">{totalScreenshots}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[#1a1f2e] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Filters & Search</h2>
                <p className={`${mutedClass} text-sm`}>Show only relevant records.</p>
              </div>
              <Filter className="text-[#d4af37]" />
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
              <select value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })} className={`rounded-xl border px-3 py-2 ${inputClass}`}>
                <option value="">All Tags</option>
                {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
              <select
                value={filters.market}
                onChange={(e) => setFilters({ ...filters, market: e.target.value as 'all' | JournalMarket })}
                className={`rounded-xl border px-3 py-2 ${inputClass}`}
              >
                <option value="all">All Markets</option>
                <option value="equity">Indian Equity</option>
                <option value="crypto">Crypto</option>
                <option value="forex">Forex</option>
              </select>
              <select value={filters.pnl} onChange={(e) => setFilters({ ...filters, pnl: e.target.value as 'all' | 'win' | 'loss' })} className={`rounded-xl border px-3 py-2 ${inputClass}`}>
                <option value="all">All Profit / Loss</option>
                <option value="win">Win Only</option>
                <option value="loss">Loss Only</option>
              </select>
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

          <div className="rounded-2xl border border-[#1a1f2e] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Premium Features</h2>
                <p className={`${mutedClass} text-sm`}>Goal tracking and habit support.</p>
              </div>
              <Sparkles className="text-[#d4af37]" />
            </div>
            <div className="mt-3 grid gap-3">
              <div className="rounded-xl bg-[#111827] p-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Goal Tracking</span>
                  <span>{goalProgress.toFixed(0)}%</span>
                </div>
                <input type="range" min={1000} max={20000} step={100} value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))} className="mt-2 w-full accent-[#d4af37]" />
              </div>
              <div className="rounded-xl bg-[#111827] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Challenge Mode</span>
                  <button onClick={() => setChallengeMode(!challengeMode)} className={`rounded-full px-3 py-1 text-xs ${challengeMode ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-200'}`}>
                    {challengeMode ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="p-4 border-b border-[#1a1f2e] flex flex-wrap items-center justify-between gap-3">
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
          <p className="p-8 text-center text-sm text-slate-500">No trades yet. Use Log Trade to add your first entry.</p>
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
                {sortedTrades.map((trade) => (
                  <tr key={trade.id} className="border-t border-[#1a1f2e]/80 hover:bg-[#121520]/60">
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(trade.date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {trade.instrument}
                      <span className="block text-[10px] text-slate-500 font-normal">
                        {tradeMarket(trade) === 'crypto' ? 'Crypto' : tradeMarket(trade) === 'forex' ? 'Forex' : 'Equity'}
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
                    <td className="px-4 py-3 text-right tabular-nums text-[#d4af37]">{trade.rr.toFixed(2)}x</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'analytics' && (
      <>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="app-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Advanced Analytics</h2>
              <p className={`${mutedClass} text-sm`}>Based on filtered trades in view.</p>
            </div>
            <ShieldCheck className="text-[#d4af37]" />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-[#111827] p-3">
              <p className="text-sm font-semibold">Win / Loss</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{ name: 'Win', value: metrics.winRate }, { name: 'Loss', value: 100 - metrics.winRate }]} dataKey="value" innerRadius={35} outerRadius={60} paddingAngle={3}>
                      <Cell fill="#10b981" />
                      <Cell fill="#f43f5e" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl bg-[#111827] p-3">
              <p className="text-sm font-semibold">Strategy Performance</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={strategyData.slice(0, 5)}>
                    <CartesianGrid stroke="#1a1f2e" strokeDasharray="3 3" />
                    <XAxis dataKey="strategy" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="pnl" fill="#d4af37" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl bg-[#111827] p-3 md:col-span-2">
              <p className="text-sm font-semibold">Monthly Comparison</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.monthly}>
                    <defs>
                      <linearGradient id="journal_pnl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4af37" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1a1f2e" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="pnl" stroke="#d4af37" fill="url(#journal_pnl)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {activeTab === 'calendar' && (
      <>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="app-card p-4">
          <JournalCalendar trades={visibleTrades} mutedClass={mutedClass} />
        </div>
        <div className="space-y-4">
          <div className="app-card p-4">
            <h3 className="text-sm font-bold text-white mb-3">Weekday P&L</h3>
            <div className="grid grid-cols-5 gap-2">
              {heatmapData.map((item) => (
                <div key={item.day} className="rounded-lg border border-[#1a1f2e] p-3 text-center">
                  <p className="text-[10px] uppercase text-slate-500">{item.day}</p>
                  <p className="mt-1 text-sm font-bold" style={{ color: getTradeColor(item.pnl) }}>{formatCurrency(item.pnl)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="app-card p-4">
            <h3 className="text-sm font-bold text-white mb-3">Replay Timeline</h3>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {replayTimeline.map((trade) => (
                <div key={trade.id} className="flex justify-between rounded-lg bg-[#121520] p-2.5 text-sm">
                  <div>
                    <p className="font-semibold text-white">{trade.instrument}</p>
                    <p className="text-[10px] text-slate-500">{new Date(trade.date).toLocaleDateString()}</p>
                  </div>
                  <p className={trade.pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{formatCurrency(trade.pnl)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {activeTab === 'analytics' && (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="app-card p-4">
          <h3 className="text-sm font-bold text-white mb-2">Risk Profile</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskData}>
                <CartesianGrid stroke="#1a1f2e" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={chartTheme.tooltip} />
                <Bar dataKey="value" fill="#d4af37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="app-card p-4">
          <h3 className="text-sm font-bold text-white mb-2">P&L by Instrument</h3>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {instrumentData.map((item) => (
              <div key={item.instrument} className="flex justify-between rounded-lg bg-[#121520] px-3 py-2 text-sm">
                <span className="text-slate-300">{item.instrument}</span>
                <span className={item.pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{formatCurrency(item.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-white">Alerts & Coach</h2>
            <p className={`${mutedClass} text-sm`}>Execution reminders from your journal data.</p>
          </div>
          <Goal className="text-[#d4af37]" />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {notifications.map((note) => (
            <div key={note.id} className={`rounded-lg p-3 border ${note.tone === 'warning' ? 'border-amber-500/30 bg-amber-500/10' : note.tone === 'good' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-[#1a1f2e] bg-[#121520]'}`}>
              <p className="text-sm font-semibold text-white">{note.title}</p>
              <p className="mt-1 text-xs text-slate-400">{note.detail}</p>
            </div>
          ))}
          {coachInsights.slice(0, 2).map((insight) => (
            <div key={insight} className="rounded-lg p-3 border border-[#d4af37]/20 bg-[#d4af37]/5 text-xs text-slate-300">
              <Brain className="w-3.5 h-3.5 text-[#d4af37] mb-1" />
              {insight}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-600">{syncStatus}</p>
      </div>
    </div>
  );
}
