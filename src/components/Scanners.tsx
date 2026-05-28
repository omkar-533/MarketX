import { useEffect, useMemo, useRef, useState } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
  getQuickScanSymbolSet,
  getScreenerFeedStatus,
  refreshScreenerFeedAsync,
  QUICK_SCAN_TYPES,
  type QuickScanId,
  type ScreenerMarketRow,
} from '../services/screenerDataService';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import * as XLSX from 'xlsx';
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Play,
  Save,
  Search,
  Share2,
  Wand2,
} from 'lucide-react';
import type { User } from '../hooks/useAuth';
import {
  autoSyncScreeners,
  canCloudSync,
  hydrateScreenerFromCloud,
} from '../services/screenerSyncService';
import type {
  FilterField,
  FilterGroup,
  FilterRule,
  Operator,
  SavedScreener,
  ScannerCategory,
  ScannerMode,
} from '../types/screener';
import ChartinkManualBuilder, { ChartinkFormulaBar } from './ChartinkManualBuilder';
import ChartinkScansDropdown from './chartink/ChartinkScansDropdown';
import ChartinkAlertModal from './chartink/ChartinkAlertModal';
import { CHARTINK_SCAN_PRESETS } from '../services/chartinkScreenerEngine';
import { findScanPresetByQuery } from '../services/scanPresets';
import {
  CHARTINK_FIELD_CATALOG,
  createDefaultChartinkGroup,
  createDefaultChartinkRule,
  evaluateChartinkFilters,
  getFieldValue,
} from '../services/chartinkScreenerEngine';
import { groupsToFormula, copyFormulaToClipboard } from '../services/screenerFormula';
import { SCAN_SEGMENTS, symbolMatchesSegment } from '../services/screenerUniverse';
import { getCachedScreenerRows, subscribeScreenerFeed } from '../services/screenerLiveService';
import { subscribeMarketLive } from '../services/marketLiveStore';
import type { ScanSegment } from '../types/screener';

type MarketRow = ScreenerMarketRow;
type SavedScan = SavedScreener;

interface AlertItem {
  id: string;
  name: string;
  channel: 'Telegram' | 'Push' | 'Email';
  threshold: string;
  enabled: boolean;
}

const DEFAULT_GROUPS = (): FilterGroup[] => [
  {
    ...createDefaultChartinkGroup('group-1', 'Momentum Core'),
    rules: [
      { ...createDefaultChartinkRule('rule-1'), field: 'rsi14', operator: '>', value: 60, compareTarget: 'number' },
      { ...createDefaultChartinkRule('rule-2'), field: 'volumeRatio', operator: '>', value: 1.1, compareTarget: 'number', logic: 'AND' },
    ],
  },
];

const DEFAULT_ALERTS: AlertItem[] = [
  { id: 'alert-1', name: 'Breakout Watch', channel: 'Telegram', threshold: 'Volume spike > 1.4x', enabled: true },
  { id: 'alert-2', name: 'Overbought Exit', channel: 'Push', threshold: 'RSI > 75', enabled: true },
  { id: 'alert-3', name: 'OI Build-up', channel: 'Email', threshold: 'OI change > 5%', enabled: false },
];

const CODE_EXAMPLES = [
  'rsi14 > 60 and volume > 1000000 and changePercent > 1',
  'breakout == true and volumeRatio > 1.2',
  'close > sma20 and macd > macdSignal',
  'sector contains bank and gapPercent > 1',
];

function sparklinePoints(base: number, current: number, len = 12): number[] {
  return Array.from({ length: len }, (_, i) =>
    Math.round((base + ((current - base) * i) / Math.max(len - 1, 1)) * 100) / 100,
  );
}

function ScreenerSparkline({ price, changePercent }: { price: number; changePercent: number }) {
  const data = useMemo(() => {
    const denom = 1 + changePercent / 100;
    const base = Math.abs(denom) < 1e-6 ? price : price / denom;
    return sparklinePoints(base, price);
  }, [price, changePercent]);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 48;
  const h = 18;
  const xDenom = Math.max(data.length - 1, 1);
  const points = data.map((v, i) => `${(i / xDenom) * w},${h - ((v - min) / range) * h}`).join(' ');
  const positive = changePercent >= 0;
  return (
    <svg width={w} height={h} className="ci-spark-svg" aria-hidden>
      <polyline fill="none" stroke={positive ? '#22c55e' : '#ef4444'} strokeWidth="1.2" points={points} />
    </svg>
  );
}

const createRule = (id: string, field: FilterField, operator: Operator, value: number | string | boolean, logic: 'AND' | 'OR' = 'AND', secondValue?: number): FilterRule => ({
  id,
  field,
  operator,
  value,
  secondValue,
  logic,
});

const createGroup = (id: string, name: string, logic: 'AND' | 'OR' = 'AND', rules: FilterRule[] = []): FilterGroup => ({
  id,
  name,
  logic,
  rules,
  children: [],
});

const cloneGroups = (groups: FilterGroup[]): FilterGroup[] => groups.map((group) => ({
  ...group,
  rules: group.rules.map((rule) => ({ ...rule })),
  children: cloneGroups(group.children),
}));

const SCAN_PRESETS = [
  {
    label: 'Momentum Burst',
    category: 'Momentum' as ScannerCategory,
    description: 'High RSI, strong price trend, and above-VWAP momentum.',
    groups: [
      createGroup('preset-momentum', 'Momentum set', 'AND', [
        createRule('preset-momentum-1', 'rsi', '>', 60),
        createRule('preset-momentum-2', 'priceVsVwap', '>', 0.5),
        createRule('preset-momentum-3', 'changePercent', '>', 1),
      ]),
    ],
  },
  {
    label: 'Breakout Watch',
    category: 'Breakout' as ScannerCategory,
    description: 'Breakout candidates with volume confirmation and fresh momentum.',
    groups: [
      createGroup('preset-breakout', 'Breakout set', 'AND', [
        createRule('preset-breakout-1', 'breakout', '=', true),
        createRule('preset-breakout-2', 'volumeRatio', '>', 1.2),
        createRule('preset-breakout-3', 'aiScore', '>', 70),
      ]),
    ],
  },
  {
    label: 'OI Build-up',
    category: 'OI' as ScannerCategory,
    description: 'Large open interest changes combined with strong volume.',
    groups: [
      createGroup('preset-oi', 'OI set', 'AND', [
        createRule('preset-oi-1', 'oiChange', '>', 4),
        createRule('preset-oi-2', 'volumeRatio', '>', 1.1),
        createRule('preset-oi-3', 'signal', '=', 'BUY'),
      ]),
    ],
  },
  {
    label: 'Banking Value',
    category: 'Volume' as ScannerCategory,
    description: 'Banking sector names with stable price support and bullish signal.',
    groups: [
      createGroup('preset-banking', 'Banking set', 'AND', [
        createRule('preset-banking-1', 'sector', 'contains', 'banking'),
        createRule('preset-banking-2', 'price', '>', 800),
        createRule('preset-banking-3', 'signal', 'contains', 'BUY'),
      ]),
    ],
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

function formatCompact(value: number) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function createChartData(stock: MarketRow) {
  const base = stock.price;
  return Array.from({ length: 30 }, (_, idx) => {
    const drift = Math.sin(idx / 3) * 1.1 + Math.cos(idx / 4) * 0.7;
    const open = Number((base + drift * 1.2 - idx * 0.05).toFixed(2));
    const close = Number((open + Math.sin(idx / 2) * 0.9 + (idx % 3 === 0 ? 0.45 : -0.2)).toFixed(2));
    const high = Math.max(open, close) + 0.35;
    const low = Math.min(open, close) - 0.35;
    return {
      time: idx + 1,
      open,
      high,
      low,
      close,
    };
  });
}

function evaluateFilters(groups: FilterGroup[], stock: MarketRow, topLevelLogic: 'AND' | 'OR' = 'AND') {
  return evaluateChartinkFilters(groups, stock, topLevelLogic);
}

function parseAiPrompt(text: string) {
  const normalized = text.toLowerCase();
  const rules: FilterRule[] = [];
  const base = (): FilterRule => ({ ...createDefaultChartinkRule(`ai-${Date.now()}-${rules.length}`), logic: 'AND' });

  if (normalized.includes('bullish engulfing') || normalized.includes('engulfing')) {
    rules.push({ ...base(), field: 'pattern', operator: 'contains', value: 'bullish', compareTarget: 'number' });
  }
  if (normalized.includes('gap up')) {
    rules.push({ ...base(), field: 'gapPercent', operator: '>', value: 1, compareTarget: 'number' });
  }
  if (normalized.includes('gap down')) {
    rules.push({ ...base(), field: 'gapPercent', operator: '<', value: -1, compareTarget: 'number' });
  }
  if (normalized.includes('oversold')) {
    rules.push({ ...base(), field: 'rsi14', operator: '<', value: 30, compareTarget: 'number' });
  }
  if (normalized.includes('overbought')) {
    rules.push({ ...base(), field: 'rsi14', operator: '>', value: 70, compareTarget: 'number' });
  }
  if (normalized.includes('above vwap') || normalized.includes('vwap')) {
    rules.push({ ...base(), field: 'priceVsVwap', operator: '>', value: 0, compareTarget: 'number' });
  }
  if (normalized.includes('macd')) {
    rules.push({
      ...base(),
      field: 'macd',
      operator: '>',
      value: 0,
      compareTarget: 'field',
      compareField: 'macdSignal',
    });
  }
  if (normalized.includes('sma') || normalized.includes('moving average')) {
    rules.push({
      ...base(),
      field: 'close',
      operator: '>',
      value: 0,
      compareTarget: 'field',
      compareField: 'sma20',
    });
  }
  if (normalized.includes('rsi') || normalized.includes('breakout')) {
    rules.push({ ...base(), field: 'rsi14', operator: '>', value: 60, compareTarget: 'number' });
  }
  if (normalized.includes('volume') || normalized.includes('spike')) {
    rules.push({ ...base(), field: 'volumeRatio', operator: '>', value: 1.2, compareTarget: 'number' });
  }
  if (normalized.includes('oi') || normalized.includes('interest')) {
    rules.push({ ...base(), field: 'oiChange', operator: '>', value: 4, compareTarget: 'number' });
  }
  if (normalized.includes('bank')) {
    rules.push({ ...base(), field: 'sector', operator: 'contains', value: 'bank', compareTarget: 'number' });
  }
  if (!rules.length) {
    rules.push({ ...base(), field: 'aiScore', operator: '>', value: 70, compareTarget: 'number' });
  }

  return rules;
}

const CODE_FIELD_ALIASES: Record<string, FilterField> = Object.fromEntries(
  CHARTINK_FIELD_CATALOG.flatMap((f) => {
    const key = f.value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [
      [key, f.value],
      [f.value, f.value],
      ...(f.value === 'close' ? [['ltp', 'close' as FilterField], ['price', 'close' as FilterField]] : []),
      ...(f.value === 'rsi14' ? [['rsi', 'rsi14' as FilterField]] : []),
      ...(f.value === 'changePercent' ? [['change', 'changePercent' as FilterField], ['chg', 'changePercent' as FilterField]] : []),
    ];
  }),
) as Record<string, FilterField>;

type CodeAtom = { field: string; op: '>' | '<' | '=' | '!=' | '>=' | '<='; value: number | boolean | string };

type CodeValidation = { valid: boolean; message: string; conditionCount: number };

function getCodeFieldValue(stock: MarketRow, field: string) {
  const mapped = CODE_FIELD_ALIASES[field] ?? (field as FilterField);
  if (!CHARTINK_FIELD_CATALOG.some((f) => f.value === mapped)) {
    return undefined;
  }
  return getFieldValue(stock, mapped);
}

function parseCodeLiteral(token: string): number | boolean | string {
  const trimmed = token.trim();
  const lowered = trimmed.toLowerCase();
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'false') {
    return false;
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).toLowerCase();
  }
  if (!Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  return lowered;
}

function parseCodeCondition(condition: string): CodeAtom | null {
  const match = condition.match(/^([a-z_]+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const rawField = match[1].toLowerCase();
  const normalizedField = rawField.replace(/[^a-z0-9]/g, '');
  const field = CODE_FIELD_ALIASES[normalizedField] ?? CODE_FIELD_ALIASES[rawField] ?? normalizedField;
  const rawOp = match[2];
  const op = (rawOp === '==' ? '=' : rawOp) as CodeAtom['op'];
  const value = parseCodeLiteral(match[3]);
  return { field, op, value };
}

function validateCodeScript(script: string): CodeValidation {
  const trimmed = script.trim();
  if (!trimmed) {
    return { valid: false, message: 'Enter a query to scan.', conditionCount: 0 };
  }

  const segments = trimmed.split(/\s+(and|or)\s+/i).filter(Boolean);
  const conditionCount = segments.filter((segment) => !/^(and|or)$/i.test(segment)).length;

  if (!conditionCount) {
    return { valid: false, message: 'Add at least one valid condition.', conditionCount: 0 };
  }

  for (const segment of segments) {
    if (/^(and|or)$/i.test(segment)) {
      continue;
    }

    const condition = parseCodeCondition(segment);
    if (!condition) {
      return { valid: false, message: `Invalid condition: ${segment}`, conditionCount };
    }
  }

  return { valid: true, message: `${conditionCount} condition${conditionCount > 1 ? 's' : ''} ready`, conditionCount };
}

function evaluateCodeCondition(stock: MarketRow, condition: CodeAtom) {
  const current = getCodeFieldValue(stock, condition.field);
  if (typeof current === 'undefined') return false;

  const rhsField = CODE_FIELD_ALIASES[String(condition.value).toLowerCase().replace(/[^a-z0-9]/g, '')];
  const rhsFromField = rhsField && CHARTINK_FIELD_CATALOG.some((f) => f.value === rhsField);
  const right = rhsFromField ? getCodeFieldValue(stock, rhsField) : condition.value;

  if (typeof condition.value === 'boolean' && !rhsFromField) {
    return current === condition.value;
  }

  if (typeof right === 'string' || (typeof current === 'string' && typeof condition.value === 'string' && !rhsFromField)) {
    if (typeof current !== 'string') return false;
    const normalizedCurrent = current.toLowerCase();
    const v = String(right).toLowerCase();
    if (condition.op === '=') return normalizedCurrent === v;
    if (condition.op === '!=') return normalizedCurrent !== v;
    if (condition.op === '>') return normalizedCurrent > v;
    if (condition.op === '<') return normalizedCurrent < v;
    return false;
  }

  if (typeof current !== 'number' || typeof right !== 'number') {
    return false;
  }

  switch (condition.op) {
    case '>':
      return current > right;
    case '<':
      return current < right;
    case '=':
      return current === right;
    case '!=':
      return current !== right;
    case '>=':
      return current >= right;
    case '<=':
      return current <= right;
    default:
      return false;
  }
}

function evaluateCodeScript(script: string, stock: MarketRow) {
  const validation = validateCodeScript(script);
  if (!validation.valid) {
    return false;
  }

  const terms = script.trim().split(/\s+(and|or)\s+/i).filter(Boolean);
  let result = false;
  let pendingLogic: 'and' | 'or' = 'and';

  terms.forEach((term, index) => {
    if (/^(and|or)$/i.test(term)) {
      pendingLogic = term.toLowerCase() as 'and' | 'or';
      return;
    }

    const condition = parseCodeCondition(term);
    if (!condition) {
      result = false;
      return;
    }

    const conditionResult = evaluateCodeCondition(stock, condition);
    if (index === 0) {
      result = conditionResult;
      return;
    }

    if (pendingLogic === 'and') {
      result = result && conditionResult;
      return;
    }

    result = result || conditionResult;
  });

  return result;
}

function createExportRows(rows: MarketRow[]) {
  return rows.map((row) => ({
    Symbol: row.symbol,
    Name: row.name,
    Sector: row.sector,
    LTP: row.price,
    Change: row.changePercent,
    Volume: row.volume,
    RSI: row.rsi,
    MACD: row.macd,
    VWAP: row.vwap,
    Signal: row.signal,
    Breakout: row.breakout ? 'Yes' : 'No',
    AI: row.aiScore,
  }));
}

interface ScannersProps {
  user: User | null;
}

export default function Scanners({ user }: ScannersProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [stocks, setStocks] = useState<MarketRow[]>([]);
  const [groups, setGroups] = useState<FilterGroup[]>(DEFAULT_GROUPS());
  const [aiPrompt, setAiPrompt] = useState('Bullish engulfing stocks above VWAP');
  const [assistantSummary, setAssistantSummary] = useState('AI assistant ready to translate natural language into live screener logic.');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState('All');
  const [showOnlyBreakouts, setShowOnlyBreakouts] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof MarketRow>('aiScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState<'append' | 'replace'>('replace');
  const [filterMode, setFilterMode] = useState<ScannerMode>('manual');
  const [codeScript, setCodeScript] = useState('rsi14 > 60 and volume > 1000000 and changePercent > 1');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    symbol: true,
    ltp: true,
    change: true,
    volume: true,
    rsi: true,
    macd: true,
    vwap: true,
    sector: true,
    marketCap: true,
    signal: true,
    breakout: true,
    chart: true,
  });
  const [watchlist, setWatchlist] = useState<string[]>(['RELIANCE', 'TCS']);
  const [, setAlerts] = useState<AlertItem[]>(DEFAULT_ALERTS);
  const [, setActiveTab] = useState<'scan' | 'alerts' | 'watchlist' | 'backtest'>('scan');
  const [toast, setToast] = useState('');
  const [selectedStock, setSelectedStock] = useState<MarketRow | null>(null);
  const [savedScanName, setSavedScanName] = useState('Daily Momentum');
  const [savedScans, setSavedScans] = useState<SavedScan[]>([]);
  const [activeScreenerId, setActiveScreenerId] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState('');
  const [screenersHydrating, setScreenersHydrating] = useState(true);
  const [, setChartStatus] = useState<'ready' | 'fallback'>('ready');
  const [activeQuickScan, setActiveQuickScan] = useState<QuickScanId | null>(null);
  const [scanSegment, setScanSegment] = useState<ScanSegment>('all');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [topLevelLogic, setTopLevelLogic] = useState<'AND' | 'OR'>('AND');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [pasteScanUrl, setPasteScanUrl] = useState('');
  const [autoRefreshScan, setAutoRefreshScan] = useState(true);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [feedStatus, setFeedStatus] = useState(getScreenerFeedStatus);
  const [universeLoading, setUniverseLoading] = useState(true);
  const importScanInputRef = useRef<HTMLInputElement | null>(null);

  const WATCHLIST_KEY = 'mmtt-screener-watchlist';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      if (raw) setWatchlist(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch {
      /* ignore */
    }
  }, [watchlist]);

  const applyUniverseRows = (rows: MarketRow[]) => {
    setStocks(rows);
    setFeedStatus(getScreenerFeedStatus());
    setSelectedStock((prev) => rows.find((r) => r.symbol === prev?.symbol) ?? rows[0] ?? null);
  };

  const refreshUniverse = async (opts?: { forceOhlc?: boolean }) => {
    setUniverseLoading(true);
    try {
      await refreshScreenerFeedAsync(opts);
      applyUniverseRows(getCachedScreenerRows());
    } finally {
      setUniverseLoading(false);
    }
  };

  useEffect(() => {
    void refreshUniverse({ forceOhlc: true });
    return subscribeScreenerFeed(() => applyUniverseRows(getCachedScreenerRows()));
  }, []);

  useEffect(() => subscribeMarketLive(() => setFeedStatus(getScreenerFeedStatus())), []);

  useAutoRefresh(() => {
    if (autoRefreshScan) void refreshUniverse();
  }, autoRefreshScan);

  useEffect(() => {
    if (!chartRef.current || !selectedStock) {
      return;
    }

    try {
      const chart = createChart(chartRef.current, {
        layout: {
          background: { color: '#080a12' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: 'rgba(96, 165, 250, 0.08)' },
          horzLines: { color: 'rgba(96, 165, 250, 0.08)' },
        },
        width: chartRef.current.clientWidth || 320,
        height: 260,
      });

      setChartStatus('ready');

      const candlestick = chart.addSeries(CandlestickSeries, {
        upColor: '#34d399',
        downColor: '#f87171',
        borderDownColor: '#f87171',
        borderUpColor: '#34d399',
        wickDownColor: '#f87171',
        wickUpColor: '#34d399',
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#8b5cf6',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      const candleData = createChartData(selectedStock);
      const vols = candleData.map((point, idx) => ({ time: point.time, value: selectedStock.volume / 2000000 + idx * 0.03 }));
      candlestick.setData(candleData as never);
      volumeSeries.setData(vols as never);
      chart.priceScale('left').applyOptions({ borderColor: 'rgba(76, 29, 149, 0.5)' });
      chart.timeScale().fitContent();

      return () => chart.remove();
    } catch {
      setChartStatus('fallback');
      return;
    }
  }, [selectedStock]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const codeValidation = useMemo(() => validateCodeScript(codeScript), [codeScript]);

  const quickScanSymbols = useMemo(
    () => (activeQuickScan ? getQuickScanSymbolSet(activeQuickScan, stocks) : null),
    [activeQuickScan, stocks],
  );

  const scanResults = useMemo(() => {
    const filtered = stocks.filter((row) => {
      const matchesSearch = `${row.symbol} ${row.name} ${row.sector}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSector =
        selectedSector === 'All' || selectedSector === 'All sectors' || row.sector === selectedSector;
      const matchesBreakout = !showOnlyBreakouts || row.breakout;
      const matchesQuickScan = !quickScanSymbols || quickScanSymbols.has(row.symbol);
      const matchesSegment = symbolMatchesSegment(row.symbol, row.sector, scanSegment, watchlist, row.marketCap);
      const matchesWatchlist = !watchlistOnly || watchlist.includes(row.symbol);

      if (filterMode === 'code') {
        return (
          matchesSearch &&
          matchesSector &&
          matchesBreakout &&
          matchesQuickScan &&
          matchesSegment &&
          matchesWatchlist &&
          codeValidation.valid &&
          evaluateCodeScript(codeScript, row)
        );
      }

      return (
        matchesSearch &&
        matchesSector &&
        matchesBreakout &&
        matchesQuickScan &&
        matchesSegment &&
        matchesWatchlist &&
        evaluateFilters(groups, row, topLevelLogic)
      );
    });

    return filtered.sort((a, b) => {
      const first = a[sortKey];
      const second = b[sortKey];
      if (typeof first === 'number' && typeof second === 'number') {
        return sortDirection === 'asc' ? first - second : second - first;
      }
      if (typeof first === 'string' && typeof second === 'string') {
        return sortDirection === 'asc' ? first.localeCompare(second) : second.localeCompare(first);
      }
      return 0;
    });
  }, [stocks, groups, searchTerm, selectedSector, showOnlyBreakouts, sortKey, sortDirection, filterMode, codeScript, codeValidation, quickScanSymbols, scanSegment, watchlistOnly, watchlist, topLevelLogic]);

  const scanFormula = useMemo(() => groupsToFormula(groups, topLevelLogic), [groups, topLevelLogic]);

  const toggleSort = (key: keyof MarketRow) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const pageCount = Math.max(1, Math.ceil(scanResults.length / rowsPerPage));
  const paginatedResults = scanResults.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const applyPasteScan = () => {
    const slug = pasteScanUrl.trim();
    if (!slug) return;
    const preset = findScanPresetByQuery(slug);
    if (preset) {
      setGroups(cloneGroups(preset.groups));
      setSavedScanName(preset.label);
      setFilterMode('manual');
      setToast(`Loaded: ${preset.label} (${preset.source})`);
      return;
    }
    if (slug.toLowerCase().includes('rsi') && slug.toLowerCase().includes('70')) {
      const overbought = CHARTINK_SCAN_PRESETS.find((p) => p.label === 'Overbought');
      if (overbought) {
        setGroups(cloneGroups(overbought.groups));
        setToast('Loaded Overbought scan');
        return;
      }
    }
    setToast('Scan not found — try Chartink preset e.g. "Gap Up" or use Master TX for TradeFinder');
  };

  const handleCreateAlert = (channel: 'Telegram' | 'Push' | 'Email') => {
    setAlerts((prev) => [
      ...prev,
      {
        id: `alert-${Date.now()}`,
        name: savedScanName,
        channel,
        threshold: scanFormula.slice(0, 80) || 'Scan match',
        enabled: true,
      },
    ]);
    setShowAlertModal(false);
    setToast(`Alert created (${channel})`);
  };

  const handleGenerate = () => {
    const parsed = parseAiPrompt(aiPrompt);
    const generatedGroup: FilterGroup = {
      id: `ai-${Date.now()}`,
      name: 'AI Parsed Filter',
      logic: 'AND',
      rules: parsed,
      children: [],
    };

    setGroups((prev) => (scanMode === 'replace' ? [generatedGroup] : [...prev, generatedGroup]));
    setAssistantSummary(`AI translated your prompt into ${parsed.length} condition${parsed.length > 1 ? 's' : ''}.`);
    setToast('AI filter generated successfully');
  };

  const persistScreeners = async (list: SavedScan[], toastMsg?: string) => {
    setSavedScans(list);
    const result = await autoSyncScreeners(user, list);
    setSyncNote(result.message);
    if (toastMsg) setToast(toastMsg);
  };

  useEffect(() => {
    let cancelled = false;
    setScreenersHydrating(true);
    void hydrateScreenerFromCloud(user).then((list) => {
      if (cancelled) return;
      setSavedScans(list);
      setScreenersHydrating(false);
      setSyncNote(
        user && canCloudSync(user)
          ? 'Your screeners are synced to your account'
          : user
            ? 'Saved on this device'
            : 'Login to save screeners to your account',
      );
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  const applyScreenerToEditor = (scan: SavedScan) => {
    setActiveScreenerId(scan.id);
    setSavedScanName(scan.name);
    setFilterMode(scan.mode);
    setGroups(cloneGroups(scan.groups));
    setCodeScript(scan.codeScript);
    setScanSegment(scan.segment ?? 'all');
    setTopLevelLogic(scan.topLevelLogic ?? 'AND');
    setActiveQuickScan(null);
  };

  const createNewScreener = () => {
    setActiveScreenerId(null);
    setSavedScanName('New Screener');
    setFilterMode('manual');
    setGroups(DEFAULT_GROUPS());
    setCodeScript('rsi14 > 60 and volume > 1000000 and changePercent > 1');
    setToast('New screener — add conditions and Save');
  };

  const deleteScreener = async (scanId: string) => {
    const next = savedScans.filter((s) => s.id !== scanId);
    await persistScreeners(next, 'Screener deleted');
    if (activeScreenerId === scanId) {
      setActiveScreenerId(null);
      createNewScreener();
    }
  };

  const duplicateScreener = async (scan: SavedScan) => {
    const copy: SavedScan = {
      ...scan,
      id: `scan-${Date.now()}`,
      name: `${scan.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: user?.id,
    };
    const next = [copy, ...savedScans];
    await persistScreeners(next, `Duplicated ${scan.name}`);
    applyScreenerToEditor(copy);
  };

  const runScan = () => {
    setIsScanning(true);
    void refreshUniverse().finally(() => {
      setIsScanning(false);
      setToast(getScreenerFeedStatus().mode === 'live' ? 'Live scan complete' : 'Scan complete — connect TradeX live for real-time data');
      setActiveTab('scan');
    });
  };

  const saveScan = async () => {
    const now = new Date().toISOString();
    const existing = activeScreenerId ? savedScans.find((s) => s.id === activeScreenerId) : null;
    const snapshot: SavedScan = {
      id: existing?.id ?? `scan-${Date.now()}`,
      ownerId: user?.id,
      name: savedScanName.trim() || 'Untitled Screener',
      category: filterMode === 'code' ? 'Custom' : 'Momentum',
      description: `${filterMode} screener — manual, AI, or code conditions`,
      mode: filterMode,
      groups: cloneGroups(groups),
      codeScript,
      segment: scanSegment,
      topLevelLogic,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const nextScans = [snapshot, ...savedScans.filter((scan) => scan.id !== snapshot.id)];
    setActiveScreenerId(snapshot.id);
    await persistScreeners(nextScans, `Saved: ${snapshot.name}`);
  };

  const loadSavedScan = (scanId: string) => {
    const scan = savedScans.find((item) => item.id === scanId);
    if (!scan) {
      setToast('Screener not found');
      return;
    }
    applyScreenerToEditor(scan);
    setToast(`Opened ${scan.name}`);
    runScan();
  };

  const applyPreset = (preset: typeof SCAN_PRESETS[number]) => {
    setSavedScanName(preset.label);
    setFilterMode('manual');
    setGroups(cloneGroups(preset.groups));
    setCodeScript('');
    setToast(`Applied preset: ${preset.label}`);
  };

  const importScan = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const scan = Array.isArray(parsed) ? parsed[0] : parsed;

      if (!scan || !Array.isArray(scan.groups)) {
        throw new Error('Invalid scan format');
      }

      const now = new Date().toISOString();
      const nextScan: SavedScan = {
        id: scan.id ?? `import-${Date.now()}`,
        ownerId: user?.id,
        name: scan.name ?? 'Imported Screener',
        category: scan.category ?? 'Custom',
        description: scan.description ?? 'Imported scan',
        mode: scan.mode ?? 'manual',
        groups: cloneGroups(scan.groups),
        codeScript: scan.codeScript ?? '',
        createdAt: scan.createdAt ?? now,
        updatedAt: now,
      };

      const nextScans = [nextScan, ...savedScans.filter((item) => item.id !== nextScan.id)];
      await persistScreeners(nextScans, `Imported ${nextScan.name}`);
      applyScreenerToEditor(nextScan);
    } catch {
      setToast('Could not import scan JSON');
    } finally {
      event.target.value = '';
    }
  };

  const cloneScan = () => {
    setGroups((prev) => prev.map((group, idx) => ({ ...group, id: `clone-${idx}-${Date.now()}`, rules: group.rules.map((rule) => ({ ...rule, id: `${rule.id}-clone` })) })));
    setToast('Scan cloned for quick refinement');
  };

  const shareScan = async () => {
    const payload = `Master AI Screener | ${groups.length} groups | ${scanResults.length} results`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Master AI Screener', text: payload });
      } else {
        await navigator.clipboard.writeText(payload);
        setToast('Scan summary copied');
      }
    } catch {
      setToast('Share cancelled');
    }
  };

  const addWatchlist = (symbol: string) => {
    setWatchlist((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
    setToast(`${symbol} added to watchlist`);
  };

  const exportCsv = () => {
    const rows = createExportRows(scanResults);
    const header = Object.keys(rows[0] ?? {}).join(',');
    const body = rows.map((row) => Object.values(row).join(',')).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'master-screener.csv';
    link.click();
    URL.revokeObjectURL(url);
    setToast('CSV exported');
  };

  const exportExcel = () => {
    const rows = createExportRows(scanResults);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Master AI Screener');
    XLSX.writeFile(workbook, 'master-screener.xlsx');
    setToast('Excel exported');
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedSector, showOnlyBreakouts, groups, filterMode, codeScript, activeQuickScan]);

  return (
    <div className="ci-screener">
      <div className="ci-page-header">
        <div>
          <p className="ci-breadcrumb">
            Screeners <span className="mx-1">›</span> <strong>Edit scan</strong>
          </p>
          <h1 className="ci-page-title">{savedScanName || 'New stock screener'}</h1>
        </div>
        <div className="ci-status-footer">
          <span
            className={`ci-live-dot ${
              feedStatus.mode === 'live' ? '' : feedStatus.mode === 'mixed' ? 'ci-live-dot--mixed' : 'ci-live-dot--demo'
            }`}
          />
          <span title={feedStatus.message}>
            {universeLoading ? 'Updating…' : feedStatus.message}
          </span>
          <span className="text-dark-muted">· {stocks.length} symbols</span>
          {feedStatus.updatedAt && (
            <span className="text-dark-muted hidden sm:inline">
              · {new Date(feedStatus.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="ci-workspace">
        <div className="ci-control-strip app-card">
          <div className="ci-control-row">
            <ChartinkScansDropdown
              savedScans={savedScans}
              activeId={activeScreenerId}
              activeName={savedScanName}
              syncNote={syncNote}
              hydrating={screenersHydrating}
              onNew={createNewScreener}
              onLoad={loadSavedScan}
              onDuplicate={(s) => void duplicateScreener(s)}
              onDelete={(id) => void deleteScreener(id)}
              showLoginHint={!user}
            />
            <input
              className="ci-scan-name ci-scan-name--grow"
              value={savedScanName}
              onChange={(e) => setSavedScanName(e.target.value)}
              placeholder="Scan name"
            />
            <div className="ci-paste-inline">
              <input
                className="ci-paste-input"
                value={pasteScanUrl}
                onChange={(e) => setPasteScanUrl(e.target.value)}
                placeholder="Load scan (Finish Line, 3R VWAP, Gap Up…)"
                onKeyDown={(e) => e.key === 'Enter' && applyPasteScan()}
              />
              <button type="button" className="ci-btn-ghost" onClick={applyPasteScan}>
                Load
              </button>
            </div>
          </div>
          <div className="ci-toolbar ci-toolbar--actions">
            <button type="button" onClick={runScan} className="ci-btn-primary ci-btn-run">
              <Play className="h-4 w-4" /> Run Scan
            </button>
            <button type="button" onClick={() => void saveScan()} className="ci-btn-ghost">
              <Save className="h-3.5 w-3.5" /> Save
            </button>
            <button type="button" onClick={() => setShowAlertModal(true)} className="ci-btn-ghost">
              <BellRing className="h-3.5 w-3.5" /> Alert
            </button>
            <button type="button" onClick={cloneScan} className="ci-btn-ghost hidden sm:inline-flex">
              <Copy className="h-3.5 w-3.5" /> Clone
            </button>
            <button type="button" onClick={shareScan} className="ci-btn-ghost hidden sm:inline-flex">
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={exportCsv} className="ci-btn-ghost hidden md:inline-flex">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button type="button" onClick={exportExcel} className="ci-btn-ghost hidden lg:inline-flex">
              Excel
            </button>
            <button
              type="button"
              onClick={() => setAutoRefreshScan((p) => !p)}
              className={`ci-btn-ghost hidden md:inline-flex ${autoRefreshScan ? 'ci-btn-ghost--active' : ''}`}
            >
              Auto refresh
            </button>
          </div>
        </div>

        <div className="ci-segments-bar app-card">
          <div className="ci-segments">
            {SCAN_SEGMENTS.map((seg) => (
              <button
                key={seg.id}
                type="button"
                title={seg.hint}
                onClick={() => {
                  setScanSegment(seg.id);
                  if (seg.id === 'watchlist') setWatchlistOnly(true);
                  else setWatchlistOnly(false);
                }}
                className={`ci-pill ${scanSegment === seg.id ? 'ci-pill--active' : ''}`}
              >
                {seg.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setWatchlistOnly((p) => !p)}
              className={`ci-pill ${watchlistOnly ? 'ci-pill--active' : ''}`}
            >
              Watchlist
            </button>
            {QUICK_SCAN_TYPES.slice(0, 6).map((scan) => (
              <button
                key={scan.id}
                type="button"
                title={scan.hint}
                onClick={() => {
                  setActiveQuickScan(activeQuickScan === scan.id ? null : scan.id);
                }}
                className={`ci-pill ${activeQuickScan === scan.id ? 'ci-pill--active' : ''}`}
              >
                {scan.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ci-split-card app-card">
        <div className="ci-split">
          <div className="ci-panel-left">
            <div className="ci-tabs">
              {(['manual', 'ai', 'code'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterMode(mode)}
                  className={`ci-tab capitalize ${filterMode === mode ? 'ci-tab--active' : ''}`}
                >
                  {mode === 'manual' ? 'Manual' : mode === 'ai' ? 'AI' : 'Code'}
                </button>
              ))}
            </div>
            <div className="ci-panel-left-scroll">
              {filterMode === 'manual' && (
                <>
                  <ChartinkManualBuilder
                    groups={groups}
                    onGroupsChange={setGroups}
                    topLevelLogic={topLevelLogic}
                    onTopLevelLogicChange={setTopLevelLogic}
                    onPresetApply={(label) => {
                      setSavedScanName(label);
                      setToast(`Applied Chartink preset: ${label}`);
                    }}
                  />
                  <div className="mt-3 pt-3 border-t border-dark-border px-1">
                    <p className="text-[10px] text-dark-muted mb-2">Quick presets</p>
                    <div className="ci-presets">
                      {SCAN_PRESETS.map((preset) => (
                        <button key={preset.label} type="button" onClick={() => applyPreset(preset)} className="ci-pill">
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {filterMode === 'ai' && (
                <div className="ci-panel-pad space-y-3">
                  <input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Bullish engulfing above VWAP, RSI breakout banking"
                    className="ci-scan-name w-full max-w-none"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setScanMode('append')} className={`ci-pill ${scanMode === 'append' ? 'ci-pill--active' : ''}`}>Append</button>
                    <button type="button" onClick={() => setScanMode('replace')} className={`ci-pill ${scanMode === 'replace' ? 'ci-pill--active' : ''}`}>Replace</button>
                  </div>
                  <div className="ci-presets">
                    {['Bullish engulfing stocks', 'Stocks above VWAP', 'RSI breakout stocks'].map((example) => (
                      <button key={example} type="button" onClick={() => setAiPrompt(example)} className="ci-pill">{example}</button>
                    ))}
                  </div>
                  <button type="button" onClick={handleGenerate} className="ci-btn-primary w-full justify-center">
                    <Wand2 className="h-4 w-4" /> Generate conditions
                  </button>
                  <p className="text-xs text-dark-muted">{assistantSummary}</p>
                </div>
              )}

              {filterMode === 'code' && (
                <div className="ci-panel-pad space-y-3">
                  <label className="text-[10px] uppercase tracking-wider text-dark-muted">Scan query (Chartink code style)</label>
                  <textarea
                    rows={8}
                    value={codeScript}
                    onChange={(e) => setCodeScript(e.target.value)}
                    className="ci-scan-name w-full max-w-none font-mono text-xs min-h-[120px]"
                    placeholder="rsi14 > 60 and close > sma20"
                  />
                  <div className="ci-presets">
                    {CODE_EXAMPLES.map((example) => (
                      <button key={example} type="button" onClick={() => setCodeScript(example)} className="ci-pill text-left">
                        {example.slice(0, 28)}…
                      </button>
                    ))}
                  </div>
                  <p className={`text-xs ${codeValidation.valid ? 'text-emerald-400' : 'text-rose-400'}`}>{codeValidation.message}</p>
                </div>
              )}
            </div>
          </div>

          <div className="ci-panel-right">
            <div className="ci-results-header">
              <p className="ci-results-count">
                <span>{scanResults.length}</span> stocks found
                {isScanning && <span className="ml-2 text-dark-muted">scanning…</span>}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 ci-select" style={{ padding: '0.25rem 0.5rem' }}>
                  <Search className="h-3.5 w-3.5 text-dark-muted shrink-0" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter"
                    className="bg-transparent border-none outline-none w-20 sm:w-28 text-xs"
                  />
                </div>
                <select value={selectedSector} onChange={(e) => setSelectedSector(e.target.value)} className="ci-select ci-select--sm">
                  <option value="All">All sectors</option>
                  {Array.from(new Set(stocks.map((row) => row.sector))).map((sector) => (
                    <option key={sector}>{sector}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowOnlyBreakouts((p) => !p)}
                  className={`ci-pill ${showOnlyBreakouts ? 'ci-pill--active' : ''}`}
                >
                  Breakout
                </button>
                <button type="button" onClick={() => setShowColumnPicker((p) => !p)} className="ci-btn-ghost">Columns</button>
              </div>
            </div>

            {showColumnPicker && (
              <div className="flex flex-wrap gap-3 px-3 py-2 border-b border-dark-border bg-dark-elevated text-xs">
                {Object.keys(visibleColumns).map((col) => (
                  <label key={col} className="flex items-center gap-1 capitalize text-dark-muted">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col]}
                      onChange={() => setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }))}
                    />
                    {col}
                  </label>
                ))}
              </div>
            )}

            <div className={`ci-table-wrap ${universeLoading ? 'ci-table-loading' : ''}`}>
              <table className="ci-table">
                <thead>
                  <tr>
                    <th className="w-8 text-center text-dark-muted">#</th>
                    {visibleColumns.chart && <th className="w-14" />}
                    {visibleColumns.symbol && <th><button type="button" onClick={() => toggleSort('symbol')}>Symbol</button></th>}
                    {visibleColumns.ltp && <th className="text-right"><button type="button" onClick={() => toggleSort('price')}>LTP</button></th>}
                    {visibleColumns.change && <th className="text-right"><button type="button" onClick={() => toggleSort('changePercent')}>Chg%</button></th>}
                    {visibleColumns.volume && <th className="text-right"><button type="button" onClick={() => toggleSort('volume')}>Volume</button></th>}
                    {visibleColumns.rsi && <th className="text-right"><button type="button" onClick={() => toggleSort('rsi')}>RSI</button></th>}
                    {visibleColumns.macd && <th className="text-right"><button type="button" onClick={() => toggleSort('macd')}>MACD</button></th>}
                    {visibleColumns.vwap && <th className="text-right"><button type="button" onClick={() => toggleSort('vwap')}>VWAP</button></th>}
                    {visibleColumns.sector && <th><button type="button" onClick={() => toggleSort('sector')}>Sector</button></th>}
                    {visibleColumns.signal && <th className="text-center">Signal</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-12 text-center text-dark-muted text-sm">
                        {universeLoading
                          ? 'Loading live market data…'
                          : 'No stocks match — add conditions and Run Scan'}
                      </td>
                    </tr>
                  ) : (
                    paginatedResults.map((row, index) => (
                      <tr
                        key={`${row.symbol}-${index}`}
                        onClick={() => setSelectedStock(row)}
                        className="cursor-pointer"
                      >
                        <td className="text-center text-dark-muted font-mono text-[10px]">
                          {(page - 1) * rowsPerPage + index + 1}
                        </td>
                        {visibleColumns.chart && (
                          <td>
                            <ScreenerSparkline price={row.price} changePercent={row.changePercent} />
                          </td>
                        )}
                        {visibleColumns.symbol && (
                          <td>
                            <span className="ci-symbol">{row.symbol}</span>
                            <span className="ci-symbol-sub">{row.name}</span>
                          </td>
                        )}
                        {visibleColumns.ltp && <td className="text-right font-mono">{formatCurrency(row.price)}</td>}
                        {visibleColumns.change && (
                          <td className={`text-right ${row.changePercent >= 0 ? 'ci-chg-up' : 'ci-chg-down'}`}>
                            {row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(2)}%
                          </td>
                        )}
                        {visibleColumns.volume && <td className="text-right font-mono text-dark-muted">{formatCompact(row.volume)}</td>}
                        {visibleColumns.rsi && <td className="text-right font-mono">{row.rsi.toFixed(1)}</td>}
                        {visibleColumns.macd && <td className="text-right font-mono">{row.macd.toFixed(2)}</td>}
                        {visibleColumns.vwap && <td className="text-right font-mono text-dark-muted">{formatCurrency(row.vwap)}</td>}
                        {visibleColumns.sector && <td className="text-dark-muted">{row.sector}</td>}
                        {visibleColumns.signal && (
                          <td className="text-center">
                            <span className={`ci-pill ${row.signal === 'BUY' ? 'ci-pill--active' : ''}`} style={{ fontSize: '0.625rem' }}>
                              {row.signal}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="ci-results-footer">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} className="ci-btn-ghost p-1" disabled={page <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>
                  Page {page} / {pageCount} · {scanResults.length} results
                </span>
                <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="ci-btn-ghost p-1" disabled={page >= pageCount}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <label className="flex items-center gap-1.5">
                Rows
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                  className="ci-select ci-select--sm"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void copyFormulaToClipboard(groups, topLevelLogic)} className="ci-link">
                Copy formula
              </button>
              <button type="button" onClick={() => addWatchlist(paginatedResults[0]?.symbol ?? '')} className="ci-link">
                + Watchlist
              </button>
            </div>
          </div>
        </div>

          <ChartinkFormulaBar groups={groups} topLevelLogic={topLevelLogic} />
        </div>

        <input ref={importScanInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importScan} />
      </div>

      <ChartinkAlertModal
        open={showAlertModal}
        scanName={savedScanName}
        formula={scanFormula}
        onClose={() => setShowAlertModal(false)}
        onCreate={handleCreateAlert}
      />

      {toast && <div className="ci-toast">{toast}</div>}
    </div>
  );
}