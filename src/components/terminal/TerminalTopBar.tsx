import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CandlestickChart,
  ChevronDown,
  Maximize2,
  RefreshCw,
  Search,
  Star,
  X,
} from 'lucide-react';
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
import { listIndicators, type IndicatorItem } from '../../services/indicatorLibrary';
import {
  isIndicatorFavorite,
  loadIndicatorFavorites,
  toggleIndicatorFavorite,
  type IndicatorFav,
} from '../../services/terminalIndicatorFavorites';
import {
  WOLF_NATIVE_PRESETS,
  isWolfStudyId,
  wolfStudyIdFor,
} from '../../services/chart/wolfIndicators';

type IndCategory = 'technicals' | 'wolf' | 'favourites';

export type TerminalTopBarProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: TvInterval) => void;
  onStudyChange: (study: string) => void;
  onChartStyleChange: (style: TvChartStyle) => void;
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
  onSymbolChange,
  onIntervalChange,
  onStudyChange,
  onChartStyleChange,
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
  const [indQuery, setIndQuery] = useState('');
  const [indCategory, setIndCategory] = useState<IndCategory>('technicals');
  const [favorites, setFavorites] = useState<IndicatorFav[]>(() => loadIndicatorFavorites());
  const [wolfItems, setWolfItems] = useState<IndicatorItem[]>([]);
  const [wolfLoading, setWolfLoading] = useState(false);
  const [wolfError, setWolfError] = useState<string | null>(null);

  const styleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  /** Native Wolf packs + CMS titles — every row plots on the Terminal chart. */
  const wolfRows = useMemo(() => {
    const rows: {
      key: string;
      studyId: string;
      title: string;
      description: string;
      favId: string;
    }[] = [];
    const seen = new Set<string>();

    for (const preset of WOLF_NATIVE_PRESETS) {
      seen.add(preset.id);
      rows.push({
        key: preset.id,
        studyId: preset.id,
        title: preset.label,
        description: 'Plots on Terminal chart',
        favId: preset.id,
      });
    }

    for (const item of wolfItems) {
      const studyId = wolfStudyIdFor(item);
      if (seen.has(studyId)) {
        // Prefer CMS title on the matching native pack row
        const existing = rows.find((r) => r.studyId === studyId);
        if (existing) {
          existing.title = item.title || existing.title;
          existing.description =
            item.description?.slice(0, 140) || existing.description;
          existing.favId = item.id;
        }
        continue;
      }
      seen.add(studyId);
      rows.push({
        key: item.id,
        studyId,
        title: item.title,
        description: item.description
          ? item.description.slice(0, 140) + (item.description.length > 140 ? '…' : '')
          : 'Wolf pack — plots on Terminal chart',
        favId: item.id,
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

  useEffect(() => {
    if (indicatorsOpen) {
      setIndCategory('technicals');
      setIndQuery('');
    }
  }, [indicatorsOpen]);

  useEffect(() => {
    if (!indicatorsOpen) return;
    let cancelled = false;
    setWolfLoading(true);
    setWolfError(null);
    void listIndicators()
      .then((items) => {
        if (!cancelled) setWolfItems(items.filter((i) => i.published !== false));
      })
      .catch((err) => {
        if (!cancelled) {
          setWolfError(err instanceof Error ? err.message : 'Could not load Wolf indicators');
          setWolfItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setWolfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [indicatorsOpen]);

  useEffect(() => {
    if (!styleOpen && !menuOpen && !indicatorsOpen) return;
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (styleOpen && !styleRef.current?.contains(t)) setStyleOpen(false);
      if (menuOpen && !menuRef.current?.contains(t)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setStyleOpen(false);
        setMenuOpen(false);
        setIndicatorsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [styleOpen, menuOpen, indicatorsOpen]);

  const toggleStudy = (id: string) => {
    const all = parseStudies(study);
    const next = all.includes(id) ? all.filter((s) => s !== id) : [...all, id];
    onStudyChange(joinStudies(next));
  };

  const toggleWolfStudy = (studyId: string) => {
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
          <div className="wolf-term__brand" ref={menuRef}>
            <button
              type="button"
              className="wolf-term__logo"
              title="Wolf menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              W
            </button>
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
                  Exit Terminal
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
                  className={indCategory === 'favourites' ? 'on' : ''}
                  onClick={() => setIndCategory('favourites')}
                >
                  Favourites
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
                  className={indCategory === 'wolf' ? 'on' : ''}
                  onClick={() => setIndCategory('wolf')}
                  title="Wolf AI proprietary indicators"
                >
                  Wolf
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
                  wolfLoading && !wolfRows.length ? (
                    <div className="wolf-term__ind-empty">Loading Wolf indicators…</div>
                  ) : wolfRows.length ? (
                    wolfRows.map((row) => {
                      const fav = isIndicatorFavorite(favorites, 'wolf', row.favId);
                      const on = activeWolfStudies.includes(row.studyId);
                      return (
                        <div key={row.key} className="wolf-term__ind-row wolf-term__ind-row--wolf">
                          <label className="wolf-term__ind-row-main">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleWolfStudy(row.studyId)}
                            />
                            <span className="wolf-term__ind-copy">
                              <b>{row.title}</b>
                              <em>{row.description}</em>
                            </span>
                          </label>
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
                        : 'No Wolf indicators match your search.'}
                    </div>
                  )
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
                                onChange={() => toggleWolfStudy(studyId)}
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
                      {favorites
                        .filter((f) => f.kind === 'wolf' && WOLF_NATIVE_PRESETS.some((p) => p.id === f.id))
                        .filter((f) => !favouriteWolf.some((item) => wolfStudyIdFor(item) === f.id || item.id === f.id))
                        .map((f) => {
                          const preset = WOLF_NATIVE_PRESETS.find((p) => p.id === f.id)!;
                          const on = activeWolfStudies.includes(preset.id);
                          return (
                            <div key={`wolf-preset-${preset.id}`} className="wolf-term__ind-row">
                              <label className="wolf-term__ind-row-main">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleWolfStudy(preset.id)}
                                />
                                <span className="wolf-term__ind-copy">
                                  <b>{preset.label}</b>
                                  <em>Wolf · plots on chart</em>
                                </span>
                              </label>
                              <button
                                type="button"
                                className="wolf-term__ind-star on"
                                title="Remove from favourites"
                                onClick={() => toggleFav('wolf', preset.id)}
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
