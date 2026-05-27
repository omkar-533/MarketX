import { useEffect, useMemo, useState } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
  getScreenerFeedStatus,
  loadScreenerUniverse,
  refreshScreenerFeedAsync,
  type ScreenerMarketRow,
} from '../services/screenerDataService';
import { getCachedScreenerRows, subscribeScreenerFeed } from '../services/screenerLiveService';
import { subscribeMarketLive } from '../services/marketLiveStore';
import { evaluateChartinkFilters } from '../services/chartinkScreenerEngine';
import { findTradeFinderPreset, TRADEFINDER_SCAN_PRESETS } from '../services/tradefinderScans';
import { SCAN_SEGMENTS, symbolMatchesSegment } from '../services/screenerUniverse';
import type { FilterGroup, ScanSegment } from '../types/screener';
import type { TradeFinderScanPreset } from '../services/tradefinderScans';
import TradeFinderScansLibrary from './chartink/TradeFinderScansLibrary';
import { ChartinkFormulaBar } from './ChartinkManualBuilder';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Play,
  Search,
} from 'lucide-react';

const cloneGroups = (groups: FilterGroup[]): FilterGroup[] =>
  groups.map((group) => ({
    ...group,
    rules: group.rules.map((rule) => ({ ...rule })),
    children: cloneGroups(group.children),
  }));

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function MasterTX() {
  const [stocks, setStocks] = useState<ScreenerMarketRow[]>([]);
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const [topLevelLogic] = useState<'AND' | 'OR'>('AND');
  const [activeScanName, setActiveScanName] = useState('Select a Market Master scan');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scanSegment, setScanSegment] = useState<ScanSegment>('all');
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(25);
  const [sortKey, setSortKey] = useState<keyof ScreenerMarketRow>('changePercent');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isScanning, setIsScanning] = useState(false);
  const [pasteScanUrl, setPasteScanUrl] = useState('');
  const [feedStatus, setFeedStatus] = useState(getScreenerFeedStatus);
  const [universeLoading, setUniverseLoading] = useState(true);
  const [toast, setToast] = useState('');

  const applyRows = (rows: ScreenerMarketRow[]) => {
    setStocks(rows);
    setFeedStatus(getScreenerFeedStatus());
  };

  const refreshUniverse = async () => {
    setUniverseLoading(true);
    try {
      await refreshScreenerFeedAsync();
      applyRows(getCachedScreenerRows().length ? getCachedScreenerRows() : loadScreenerUniverse());
    } finally {
      setUniverseLoading(false);
    }
  };

  useEffect(() => {
    void refreshUniverse();
    const first = TRADEFINDER_SCAN_PRESETS[0];
    if (first) {
      setGroups(cloneGroups(first.groups));
      setActiveScanName(first.label);
      setActiveSlug(first.slug);
    }
    return subscribeScreenerFeed(() => applyRows(getCachedScreenerRows()));
  }, []);

  useEffect(() => subscribeMarketLive(() => setFeedStatus(getScreenerFeedStatus())), []);
  useAutoRefresh(() => void refreshUniverse(), true);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const applyPreset = (preset: TradeFinderScanPreset) => {
    setGroups(cloneGroups(preset.groups));
    setActiveScanName(preset.label);
    setActiveSlug(preset.slug);
    setToast(`Loaded: ${preset.label}`);
  };

  const applyPasteScan = () => {
    const preset = findTradeFinderPreset(pasteScanUrl);
    if (preset) {
      applyPreset(preset);
      setPasteScanUrl('');
      return;
    }
    setToast('Scan not found in Master TX library');
  };

  const scanResults = useMemo(() => {
    if (!groups.length) return [];
    const filtered = stocks.filter((row) => {
      const matchesSearch = `${row.symbol} ${row.name} ${row.sector}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSegment = symbolMatchesSegment(row.symbol, row.sector, scanSegment, [], row.marketCap);
      return matchesSearch && matchesSegment && evaluateChartinkFilters(groups, row, topLevelLogic);
    });
    return filtered.sort((a, b) => {
      const first = a[sortKey];
      const second = b[sortKey];
      if (typeof first === 'number' && typeof second === 'number') {
        return sortDirection === 'asc' ? first - second : second - first;
      }
      return 0;
    });
  }, [stocks, groups, searchTerm, scanSegment, sortKey, sortDirection, topLevelLogic]);

  const pageCount = Math.max(1, Math.ceil(scanResults.length / rowsPerPage));
  const paginatedResults = scanResults.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const toggleSort = (key: keyof ScreenerMarketRow) => {
    if (sortKey === key) setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const runScan = () => {
    setIsScanning(true);
    void refreshUniverse().finally(() => setIsScanning(false));
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, scanSegment, groups, activeSlug]);

  return (
    <div className="ci-screener">
      <div className="ci-page-header">
        <div>
          <p className="ci-breadcrumb flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-gold" />
            Master TX <span className="mx-1">›</span> <strong>Market Master scans</strong>
          </p>
          <h1 className="ci-page-title">{activeScanName}</h1>
        </div>
        <div className="ci-status-footer">
          <span
            className={`ci-live-dot ${
              feedStatus.mode === 'live' ? '' : feedStatus.mode === 'mixed' ? 'ci-live-dot--mixed' : 'ci-live-dot--demo'
            }`}
          />
          <span title={feedStatus.message}>{universeLoading ? 'Updating…' : feedStatus.message}</span>
          <span className="text-dark-muted">· {stocks.length} symbols</span>
        </div>
      </div>

      <div className="ci-workspace">
        <div className="ci-control-strip app-card">
          <div className="ci-control-row">
            <div className="ci-paste-inline flex-1 max-w-none">
              <input
                className="ci-paste-input"
                value={pasteScanUrl}
                onChange={(e) => setPasteScanUrl(e.target.value)}
                placeholder="Load scan slug (finish-line-with-gap, 3r-vwap-breakout…)"
                onKeyDown={(e) => e.key === 'Enter' && applyPasteScan()}
              />
              <button type="button" className="ci-btn-ghost" onClick={applyPasteScan}>
                Load
              </button>
            </div>
            <button type="button" onClick={runScan} className="ci-btn-primary ci-btn-run">
              <Play className="h-4 w-4" /> Run Scan
            </button>
          </div>
        </div>

        <div className="ci-segments-bar app-card">
          <div className="ci-segments">
            {SCAN_SEGMENTS.filter((s) => s.id !== 'watchlist').map((seg) => (
              <button
                key={seg.id}
                type="button"
                title={seg.hint}
                onClick={() => setScanSegment(seg.id)}
                className={`ci-pill ${scanSegment === seg.id ? 'ci-pill--active' : ''}`}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ci-split-card app-card">
          <div className="ci-split">
            <div className="ci-panel-left">
              <div className="ci-tabs">
                <span className="ci-tab ci-tab--active px-4">Market Master Library</span>
              </div>
              <div className="ci-panel-left-scroll p-0">
                <TradeFinderScansLibrary onApply={applyPreset} />
              </div>
            </div>

            <div className="ci-panel-right">
              <div className="ci-results-header">
                <p className="ci-results-count">
                  <span>{scanResults.length}</span> stocks
                  {isScanning && <span className="ml-2 text-dark-muted">scanning…</span>}
                </p>
                <div className="flex items-center gap-1.5 ci-select" style={{ padding: '0.25rem 0.5rem' }}>
                  <Search className="h-3.5 w-3.5 text-dark-muted shrink-0" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter"
                    className="bg-transparent border-none outline-none w-24 text-xs"
                  />
                </div>
              </div>

              <div className={`ci-table-wrap ${universeLoading ? 'ci-table-loading' : ''}`}>
                <table className="ci-table">
                  <thead>
                    <tr>
                      <th className="w-8 text-center">#</th>
                      <th>
                        <button type="button" onClick={() => toggleSort('symbol')}>
                          Symbol
                        </button>
                      </th>
                      <th className="text-right">
                        <button type="button" onClick={() => toggleSort('price')}>
                          LTP
                        </button>
                      </th>
                      <th className="text-right">
                        <button type="button" onClick={() => toggleSort('changePercent')}>
                          Chg%
                        </button>
                      </th>
                      <th className="text-right">
                        <button type="button" onClick={() => toggleSort('volumeRatio')}>
                          Vol ratio
                        </button>
                      </th>
                      <th className="text-right">
                        <button type="button" onClick={() => toggleSort('rsi14')}>
                          RSI
                        </button>
                      </th>
                      <th className="text-center">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-dark-muted text-sm">
                          {universeLoading ? 'Loading…' : 'No matches — pick a Market Master scan'}
                        </td>
                      </tr>
                    ) : (
                      paginatedResults.map((row, index) => (
                        <tr key={row.symbol}>
                          <td className="text-center text-dark-muted text-[10px]">{(page - 1) * rowsPerPage + index + 1}</td>
                          <td>
                            <span className="ci-symbol">{row.symbol}</span>
                            <span className="ci-symbol-sub">{row.name}</span>
                          </td>
                          <td className="text-right font-mono">{formatCurrency(row.price)}</td>
                          <td className={`text-right ${row.changePercent >= 0 ? 'ci-chg-up' : 'ci-chg-down'}`}>
                            {row.changePercent >= 0 ? '+' : ''}
                            {row.changePercent.toFixed(2)}%
                          </td>
                          <td className="text-right font-mono text-dark-muted">{row.volumeRatio.toFixed(2)}</td>
                          <td className="text-right font-mono">{row.rsi14.toFixed(1)}</td>
                          <td className="text-center">
                            <span className={`ci-pill ${row.signal === 'BUY' ? 'ci-pill--active' : ''}`} style={{ fontSize: '0.625rem' }}>
                              {row.signal}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="ci-results-footer">
                <div className="flex items-center gap-1">
                  <button type="button" className="ci-btn-ghost p-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span>
                    Page {page} / {pageCount}
                  </span>
                  <button type="button" className="ci-btn-ghost p-1" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <ChartinkFormulaBar groups={groups} topLevelLogic={topLevelLogic} />
        </div>
      </div>

      {toast && <div className="ci-toast">{toast}</div>}
    </div>
  );
}
