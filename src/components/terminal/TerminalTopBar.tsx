import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CandlestickChart,
  ChevronDown,
  LayoutGrid,
  Maximize2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { AI_PRODUCT_NAME } from '../../constants/brandLabels';
import {
  NATIVE_STUDY_PRESETS,
  NATIVE_TIMEFRAMES,
  TECHNICAL_STUDY_PRESETS,
  TV_CHART_STYLES,
  TV_TIMEFRAMES,
  joinStudies,
  parseStudies,
  tradingViewSymbolLabel,
  usesNativeChart,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';
import TerminalSymbolSearch from './TerminalSymbolSearch';
import TerminalWolfCreatePanel from './TerminalWolfCreatePanel';
import {
  adminDeleteIndicator,
  adminListIndicators,
  listIndicators,
  type IndicatorItem,
} from '../../services/indicatorLibrary';
import { loadAppSession } from '../../services/appInviteAuth';
import {
  isIndicatorFavorite,
  loadIndicatorFavorites,
  toggleIndicatorFavorite,
  type IndicatorFav,
} from '../../services/terminalIndicatorFavorites';
import {
  isWolfStudyId,
  wolfStudyIdFor,
  rememberWolfStudyTitle,
} from '../../services/chart/wolfIndicators';
import { rememberStudySettingsSchema } from '../../services/wolfIndicatorSettings';
import { sanitizeIndicatorDescription } from '../../services/indicatorCopy';
import {
  TERMINAL_CHART_COUNTS,
  chartLayoutPreview,
  type TerminalChartCount,
} from '../../services/terminalChartLayouts';

type IndCategory = 'technicals' | 'wolf' | 'favourites';

export type TerminalTopBarProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  chartCount: TerminalChartCount;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: TvInterval) => void;
  onStudyChange: (study: string) => void;
  onChartStyleChange: (style: TvChartStyle) => void;
  onChartCountChange: (count: TerminalChartCount) => void;
  onReload: () => void;
  onExitApp?: () => void;
  onScreenshot?: () => void;
  onNavigate?: (tab: string) => void;
};

/** TradingView-density header: symbol · TF pills · style · indicators · actions. */
export default function TerminalTopBar({
  symbol,
  interval,
  study,
  chartStyle,
  chartCount,
  onSymbolChange,
  onIntervalChange,
  onStudyChange,
  onChartStyleChange,
  onChartCountChange,
  onReload,
  onExitApp,
  onScreenshot,
  onNavigate,
}: TerminalTopBarProps) {
  const native = usesNativeChart(symbol);
  const timeframes = native ? NATIVE_TIMEFRAMES : TV_TIMEFRAMES;
  /** Always show the full technicals catalog; native chart applies what it supports. */
  const studyPresets = TECHNICAL_STUDY_PRESETS;
  const nativeSupported = useMemo(
    () => new Set(NATIVE_STUDY_PRESETS.map((s) => s.id)),
    [],
  );

  const [symbolInput, setSymbolInput] = useState(() => tradingViewSymbolLabel(symbol));
  const [searchOpen, setSearchOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [indQuery, setIndQuery] = useState('');
  const [indCategory, setIndCategory] = useState<IndCategory>('wolf');
  const [favorites, setFavorites] = useState<IndicatorFav[]>(() => loadIndicatorFavorites());
  const [wolfItems, setWolfItems] = useState<IndicatorItem[]>([]);
  const [wolfLoading, setWolfLoading] = useState(false);
  const [wolfError, setWolfError] = useState<string | null>(null);
  const [wolfCreateOpen, setWolfCreateOpen] = useState(false);
  const [wolfEditing, setWolfEditing] = useState<IndicatorItem | null>(null);
  const [wolfAdminBusy, setWolfAdminBusy] = useState<string | null>(null);
  const isAdmin = loadAppSession()?.user?.role === 'admin';

  const styleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSymbolInput(tradingViewSymbolLabel(symbol));
  }, [symbol]);

  useEffect(() => {
    if (!timeframes.some((tf) => tf.id === interval)) onIntervalChange('5');
  }, [timeframes, interval, onIntervalChange]);

  const activeInterval = useMemo(
    () => (timeframes.some((tf) => tf.id === interval) ? interval : '5'),
    [timeframes, interval],
  );

  const activeStyleLabel =
    TV_CHART_STYLES.find((s) => s.id === chartStyle)?.label ?? 'Candles';

  const technicalIds = useMemo(
    () => new Set(studyPresets.map((s) => s.id)),
    [studyPresets],
  );

  const activeStudies = useMemo(
    () => parseStudies(study).filter((id) => technicalIds.has(id)),
    [study, technicalIds],
  );

  const activeWolfStudies = useMemo(
    () => parseStudies(study).filter((id) => isWolfStudyId(id)),
    [study],
  );

  const filteredTechnicals = useMemo(() => {
    const q = indQuery.trim().toLowerCase();
    if (!q) return studyPresets;
    return studyPresets.filter((s) => s.label.toLowerCase().includes(q) || s.id.includes(q));
  }, [studyPresets, indQuery]);

  const favouriteTechnicals = useMemo(() => {
    const ids = new Set(favorites.filter((f) => f.kind === 'tech').map((f) => f.id));
    return studyPresets.filter((s) => ids.has(s.id));
  }, [favorites, studyPresets]);

  const favouriteWolf = useMemo(() => {
    const ids = new Set(favorites.filter((f) => f.kind === 'wolf').map((f) => f.id));
    return wolfItems.filter((item) => ids.has(item.id));
  }, [favorites, wolfItems]);

  /** CMS Wolf indicators only — built-in packs stay as engines, not list rows. */
  const wolfRows = useMemo(() => {
    const rows: {
      key: string;
      studyId: string;
      title: string;
      description: string;
      favId: string;
      /** Present when backed by admin CMS indicator (editable). */
      cmsId?: string;
    }[] = [];
    const seen = new Set<string>();

    for (const item of wolfItems) {
      const studyId = wolfStudyIdFor(item);
      if (seen.has(studyId) || seen.has(item.id)) continue;
      seen.add(studyId);
      seen.add(item.id);
      rows.push({
        key: item.id,
        studyId,
        title: item.title,
        description: sanitizeIndicatorDescription(item.description),
        favId: item.id,
        cmsId: item.id,
      });
    }

    const q = indQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.studyId.includes(q),
    );
  }, [wolfItems, indQuery]);

  const refreshWolfList = () => {
    setWolfLoading(true);
    setWolfError(null);
    void listIndicators()
      .then((items) => {
        const published = items.filter((i) => i.published !== false);
        setWolfItems(published);
        for (const item of published) {
          const studyId = wolfStudyIdFor(item);
          rememberWolfStudyTitle(studyId, item.title);
          rememberStudySettingsSchema(studyId, item.settings);
        }
      })
      .catch((err) => {
        setWolfError(err instanceof Error ? err.message : 'Could not load Wolf indicators');
        setWolfItems([]);
      })
      .finally(() => setWolfLoading(false));
  };

  useEffect(() => {
    if (indicatorsOpen) {
      setIndCategory('wolf');
      setIndQuery('');
    }
  }, [indicatorsOpen]);

  useEffect(() => {
    if (!indicatorsOpen) return;
    refreshWolfList();
  }, [indicatorsOpen]);

  const openWolfCreate = () => {
    setWolfEditing(null);
    setWolfCreateOpen(true);
  };

  const openWolfEdit = async (cmsId: string) => {
    setWolfAdminBusy(cmsId);
    try {
      const all = await adminListIndicators();
      const hit = all.find((i) => i.id === cmsId);
      if (!hit) throw new Error('Indicator not found');
      setWolfEditing(hit);
      setWolfCreateOpen(true);
    } catch (err) {
      setWolfError(err instanceof Error ? err.message : 'Could not load indicator for edit');
    } finally {
      setWolfAdminBusy(null);
    }
  };

  const deleteWolfIndicator = async (cmsId: string, title: string) => {
    if (!window.confirm(`Delete “${title}”? Members will lose this Wolf indicator.`)) return;
    setWolfAdminBusy(cmsId);
    try {
      await adminDeleteIndicator(cmsId);
      refreshWolfList();
    } catch (err) {
      setWolfError(err instanceof Error ? err.message : 'Could not delete indicator');
    } finally {
      setWolfAdminBusy(null);
    }
  };

  useEffect(() => {
    if (!styleOpen && !menuOpen && !indicatorsOpen && !layoutOpen) return;
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (styleOpen && !styleRef.current?.contains(t)) setStyleOpen(false);
      if (menuOpen && !menuRef.current?.contains(t)) setMenuOpen(false);
      if (layoutOpen && !layoutRef.current?.contains(t)) setLayoutOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setStyleOpen(false);
        setMenuOpen(false);
        setIndicatorsOpen(false);
        setLayoutOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [styleOpen, menuOpen, indicatorsOpen, layoutOpen]);

  const toggleStudy = (id: string) => {
    const all = parseStudies(study);
    const next = all.includes(id) ? all.filter((s) => s !== id) : [...all, id];
    onStudyChange(joinStudies(next));
  };

  const toggleWolfStudy = (studyId: string, title?: string) => {
    if (title) rememberWolfStudyTitle(studyId, title);
    toggleStudy(studyId);
  };

  const toggleFav = (kind: IndicatorFav['kind'], id: string) => {
    setFavorites((prev) => toggleIndicatorFavorite(prev, kind, id));
  };

  const goFullscreen = () => {
    const el = document.querySelector('.wolf-term');
    if (!el) return;
    if (!document.fullscreenElement) void (el as HTMLElement).requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  return (
    <>
      <header className="wolf-term__bar">
        <div className="wolf-term__bar-left">
          <button
            type="button"
            className="wolf-term__back"
            title="Back to Dashboard"
            onClick={() => onExitApp?.()}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
            <span>Back to Dashboard</span>
          </button>

          <div className="wolf-term__brand" ref={menuRef}>
            <button
              type="button"
              className="wolf-term__logo"
              title={`${AI_PRODUCT_NAME} menu`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              W
            </button>
            <div className="wolf-term__brand-copy" aria-hidden>
              <b>{AI_PRODUCT_NAME}</b>
              <em>Terminal</em>
            </div>
            {menuOpen ? (
              <div className="wolf-term__brand-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onExitApp?.();
                  }}
                >
                  Back to Dashboard
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onReload();
                  }}
                >
                  Reload chart
                </button>
              </div>
            ) : null}
          </div>

          <div className="wolf-term__search">
            <button
              type="button"
              className="wolf-term__chip wolf-term__chip--symbol"
              title="Symbol search"
              onClick={() => {
                setSearchOpen(true);
                setStyleOpen(false);
              }}
            >
              <Search className="h-3.5 w-3.5" />
              <span>{tradingViewSymbolLabel(symbol)}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </div>

          <div className="wolf-term__tf-pills" role="group" aria-label="Timeframe">
            {timeframes.map((tf) => (
              <button
                key={tf.id}
                type="button"
                className={`wolf-term__tf-pill ${tf.id === activeInterval ? 'on' : ''}`}
                onClick={() => onIntervalChange(tf.id)}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <span className="wolf-term__bar-sep" aria-hidden />

          <div className="wolf-term__tf-wrap" ref={styleRef}>
            <button
              type="button"
              className="wolf-term__icon-btn"
              title={activeStyleLabel}
              aria-expanded={styleOpen}
              onClick={() => {
                setStyleOpen((v) => !v);
                setSearchOpen(false);
              }}
            >
              <CandlestickChart className="h-4 w-4" />
            </button>
            {styleOpen ? (
              <div className="wolf-term__pop" role="listbox">
                {TV_CHART_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`wolf-term__pop-item ${s.id === chartStyle ? 'on' : ''}`}
                    onClick={() => {
                      onChartStyleChange(s.id);
                      setStyleOpen(false);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={`wolf-term__text-btn ${activeStudies.length ? 'on' : ''}`}
            onClick={() => setIndicatorsOpen(true)}
          >
            Indicators
            {activeStudies.length ? <em>{activeStudies.length}</em> : null}
          </button>
        </div>

        <div className="wolf-term__bar-right">
          {!native ? (
            <span className="wolf-term__badge" title="TradingView Advanced Chart widget">
              Widget
            </span>
          ) : null}

          <div className="wolf-term__layout-wrap" ref={layoutRef}>
            <button
              type="button"
              className={`wolf-term__icon-btn wolf-term__layout-btn ${chartCount > 1 ? 'on' : ''} ${layoutOpen ? 'open' : ''}`}
              title="Multi chart layout"
              aria-label="Multi chart layout"
              aria-expanded={layoutOpen}
              onClick={() => {
                setLayoutOpen((v) => !v);
                setStyleOpen(false);
                setSearchOpen(false);
                setMenuOpen(false);
              }}
            >
              <LayoutGrid className="h-4 w-4" />
              {chartCount > 1 ? <em>{chartCount}</em> : null}
            </button>
            {layoutOpen ? (
              <div className="wolf-term__layout-pop" role="listbox" aria-label="Chart layouts">
                <div className="wolf-term__layout-pop-title">Charts on screen</div>
                <div className="wolf-term__layout-grid">
                  {TERMINAL_CHART_COUNTS.map((count) => {
                    const { cols, rows } = chartLayoutPreview(count);
                    return (
                      <button
                        key={count}
                        type="button"
                        role="option"
                        aria-selected={count === chartCount}
                        className={`wolf-term__layout-option ${count === chartCount ? 'on' : ''}`}
                        title={`${count} chart${count === 1 ? '' : 's'}`}
                        onClick={() => {
                          onChartCountChange(count);
                          setLayoutOpen(false);
                        }}
                      >
                        <span
                          className="wolf-term__layout-preview"
                          style={{
                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                            gridTemplateRows: `repeat(${rows}, 1fr)`,
                          }}
                          aria-hidden
                        >
                          {Array.from({ length: count }, (_, i) => (
                            <i key={i} />
                          ))}
                        </span>
                        <b>{count}</b>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <button type="button" className="wolf-term__icon-btn" title="Fullscreen" onClick={goFullscreen}>
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="wolf-term__icon-btn"
            title="Snapshot"
            onClick={() => onScreenshot?.()}
          >
            <Camera className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="wolf-term__icon-btn"
            title="Reload chart data"
            onClick={onReload}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {indicatorsOpen ? (
        <div
          className="wolf-term__ind-backdrop"
          role="presentation"
          onClick={() => setIndicatorsOpen(false)}
        >
          <div
            className="wolf-term__ind-modal"
            role="dialog"
            aria-label="Indicators"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wolf-term__ind-modal-head">
              <b>Indicators</b>
              <button type="button" className="wolf-term__icon-btn" onClick={() => setIndicatorsOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="wolf-term__ind-modal-search">
              <Search className="h-3.5 w-3.5" />
              <input
                value={indQuery}
                onChange={(e) => setIndQuery(e.target.value)}
                placeholder="Search"
                autoFocus
              />
            </div>
            <div className="wolf-term__ind-modal-body">
              <aside>
                <button
                  type="button"
                  className={indCategory === 'wolf' ? 'on' : ''}
                  onClick={() => setIndCategory('wolf')}
                  title="Wolf AI proprietary indicators"
                >
                  Wolf
                </button>
                <button
                  type="button"
                  className={indCategory === 'technicals' ? 'on' : ''}
                  onClick={() => setIndCategory('technicals')}
                >
                  Technicals
                </button>
                <button
                  type="button"
                  className={indCategory === 'favourites' ? 'on' : ''}
                  onClick={() => setIndCategory('favourites')}
                >
                  Favourites
                </button>
              </aside>
              <div className="wolf-term__ind-list">
                {indCategory === 'technicals' ? (
                  filteredTechnicals.length ? (
                    filteredTechnicals.map((s) => {
                      const fav = isIndicatorFavorite(favorites, 'tech', s.id);
                      const unsupported = native && !nativeSupported.has(s.id);
                      return (
                        <div key={s.id} className="wolf-term__ind-row">
                          <label className="wolf-term__ind-row-main">
                            <input
                              type="checkbox"
                              checked={activeStudies.includes(s.id)}
                              onChange={() => toggleStudy(s.id)}
                              disabled={unsupported}
                            />
                            <span className="wolf-term__ind-copy">
                              <b>{s.label}</b>
                              {unsupported ? <em>Widget charts only</em> : null}
                            </span>
                          </label>
                          <button
                            type="button"
                            className={`wolf-term__ind-star ${fav ? 'on' : ''}`}
                            title={fav ? 'Remove from favourites' : 'Add to favourites'}
                            aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
                            onClick={() => toggleFav('tech', s.id)}
                          >
                            <Star className="h-3.5 w-3.5" fill={fav ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="wolf-term__ind-empty">No technicals match your search.</div>
                  )
                ) : null}

                {indCategory === 'wolf' ? (
                  <>
                    {isAdmin ? (
                      <div className="wolf-term__ind-wolf-admin">
                        <button
                          type="button"
                          className="wolf-term__ind-create"
                          onClick={openWolfCreate}
                          title="Create a Pine Script indicator for Wolf"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create Indicator
                        </button>
                        <span>Admin only · source stays encrypted for members</span>
                      </div>
                    ) : null}
                    {wolfLoading && !wolfRows.length ? (
                      <div className="wolf-term__ind-empty">Loading Wolf indicators…</div>
                    ) : wolfRows.length ? (
                      wolfRows.map((row) => {
                        const fav = isIndicatorFavorite(favorites, 'wolf', row.favId);
                        const on = activeWolfStudies.includes(row.studyId);
                        const busy = wolfAdminBusy === row.cmsId;
                        return (
                          <div key={row.key} className="wolf-term__ind-row wolf-term__ind-row--wolf">
                            <label className="wolf-term__ind-row-main">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleWolfStudy(row.studyId, row.title)}
                              />
                              <span className="wolf-term__ind-copy">
                                <b>{row.title}</b>
                                <em>{row.description}</em>
                              </span>
                            </label>
                            {isAdmin && row.cmsId ? (
                              <div className="wolf-term__ind-admin-acts">
                                <button
                                  type="button"
                                  className="wolf-term__ind-admin-btn"
                                  title="Edit Pine Script (admin)"
                                  disabled={busy}
                                  onClick={() => void openWolfEdit(row.cmsId!)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="wolf-term__ind-admin-btn danger"
                                  title="Delete indicator (admin)"
                                  disabled={busy}
                                  onClick={() => void deleteWolfIndicator(row.cmsId!, row.title)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className={`wolf-term__ind-star ${fav ? 'on' : ''}`}
                              title={fav ? 'Remove from favourites' : 'Add to favourites'}
                              aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
                              onClick={() => toggleFav('wolf', row.favId)}
                            >
                              <Star className="h-3.5 w-3.5" fill={fav ? 'currentColor' : 'none'} />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="wolf-term__ind-empty">
                        {wolfError
                          ? `${wolfError} — native Wolf packs still available after reload.`
                          : isAdmin
                            ? 'No custom Wolf indicators yet — tap Create Indicator.'
                            : 'No Wolf indicators match your search.'}
                      </div>
                    )}
                  </>
                ) : null}

                {indCategory === 'favourites' ? (
                  favouriteTechnicals.length || favouriteWolf.length ? (
                    <>
                      {favouriteTechnicals.map((s) => {
                        const fav = true;
                        return (
                          <div key={`tech-${s.id}`} className="wolf-term__ind-row">
                            <label className="wolf-term__ind-row-main">
                              <input
                                type="checkbox"
                                checked={activeStudies.includes(s.id)}
                                onChange={() => toggleStudy(s.id)}
                              />
                              <span className="wolf-term__ind-copy">
                                <b>{s.label}</b>
                                <em>Technical</em>
                              </span>
                            </label>
                            <button
                              type="button"
                              className={`wolf-term__ind-star ${fav ? 'on' : ''}`}
                              title="Remove from favourites"
                              onClick={() => toggleFav('tech', s.id)}
                            >
                              <Star className="h-3.5 w-3.5" fill="currentColor" />
                            </button>
                          </div>
                        );
                      })}
                      {favouriteWolf.map((item) => {
                        const studyId = wolfStudyIdFor(item);
                        const on = activeWolfStudies.includes(studyId);
                        return (
                          <div key={`wolf-${item.id}`} className="wolf-term__ind-row wolf-term__ind-row--wolf">
                            <label className="wolf-term__ind-row-main">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleWolfStudy(studyId, item.title)}
                              />
                              <span className="wolf-term__ind-copy">
                                <b>{item.title}</b>
                                <em>Wolf · plots on chart</em>
                              </span>
                            </label>
                            <button
                              type="button"
                              className="wolf-term__ind-star on"
                              title="Remove from favourites"
                              onClick={() => toggleFav('wolf', item.id)}
                            >
                              <Star className="h-3.5 w-3.5" fill="currentColor" />
                            </button>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="wolf-term__ind-empty">
                      No favourites yet. Tap the star on any Technical or Wolf indicator to pin it
                      here.
                    </div>
                  )
                ) : null}
              </div>
            </div>
            <div className="wolf-term__ind-modal-foot">
              <button type="button" onClick={() => onStudyChange(joinStudies([]))}>
                Clear all
              </button>
              <button type="button" className="primary" onClick={() => setIndicatorsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TerminalWolfCreatePanel
        open={wolfCreateOpen}
        editing={wolfEditing}
        onClose={() => {
          setWolfCreateOpen(false);
          setWolfEditing(null);
        }}
        onSaved={() => {
          refreshWolfList();
        }}
      />

      <TerminalSymbolSearch
        open={searchOpen}
        activeSymbol={symbol}
        onClose={() => setSearchOpen(false)}
        onPick={(tv) => {
          onSymbolChange(tv);
          setSymbolInput(tradingViewSymbolLabel(tv));
        }}
      />
    </>
  );
}
