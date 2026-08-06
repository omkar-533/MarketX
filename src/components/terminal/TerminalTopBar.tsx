import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CandlestickChart,
  ChevronDown,
  Maximize2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  NATIVE_STUDY_PRESETS,
  NATIVE_TIMEFRAMES,
  TV_CHART_STYLES,
  TV_STUDY_PRESETS,
  TV_TIMEFRAMES,
  joinStudies,
  parseStudies,
  parseTradingViewInput,
  tradingViewSymbolLabel,
  usesNativeChart,
  type TvChartStyle,
  type TvInterval,
} from '../../utils/tradingViewSymbols';
import { searchTerminalSymbols, type TerminalSymbolHit } from '../../services/terminalSymbolCatalog';

type IndCategory = 'technicals' | 'wolf';

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
  onTrade?: () => void;
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
  onTrade,
}: TerminalTopBarProps) {
  const native = usesNativeChart(symbol);
  const timeframes = native ? NATIVE_TIMEFRAMES : TV_TIMEFRAMES;
  const studyPresets = native ? NATIVE_STUDY_PRESETS : TV_STUDY_PRESETS;

  const [symbolInput, setSymbolInput] = useState(() => tradingViewSymbolLabel(symbol));
  const [searchOpen, setSearchOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [indQuery, setIndQuery] = useState('');
  const [indCategory, setIndCategory] = useState<IndCategory>('technicals');

  const searchRef = useRef<HTMLDivElement>(null);
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

  const hits = useMemo(() => searchTerminalSymbols(symbolInput, 20), [symbolInput]);

  const filteredTechnicals = useMemo(() => {
    const q = indQuery.trim().toLowerCase();
    if (!q) return studyPresets;
    return studyPresets.filter((s) => s.label.toLowerCase().includes(q) || s.id.includes(q));
  }, [studyPresets, indQuery]);

  useEffect(() => {
    setHighlight(0);
  }, [symbolInput, searchOpen]);

  useEffect(() => {
    if (indicatorsOpen) setIndCategory('technicals');
  }, [indicatorsOpen]);

  useEffect(() => {
    if (!searchOpen && !styleOpen && !menuOpen && !indicatorsOpen) return;
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (searchOpen && !searchRef.current?.contains(t)) setSearchOpen(false);
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
  }, [searchOpen, styleOpen, menuOpen, indicatorsOpen]);

  const pickHit = (hit: TerminalSymbolHit) => {
    onSymbolChange(hit.tvSymbol);
    setSymbolInput(hit.label);
    setSearchOpen(false);
  };

  const submitSymbol = () => {
    const next = parseTradingViewInput(symbolInput);
    if (next !== symbol) onSymbolChange(next);
    else setSymbolInput(tradingViewSymbolLabel(symbol));
    setSearchOpen(false);
  };

  const toggleStudy = (id: string) => {
    const next = activeStudies.includes(id)
      ? activeStudies.filter((s) => s !== id)
      : [...activeStudies, id];
    onStudyChange(joinStudies(next));
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

          <div className="wolf-term__search" ref={searchRef}>
            <button
              type="button"
              className="wolf-term__chip wolf-term__chip--symbol"
              onClick={() => {
                setSearchOpen(true);
                setStyleOpen(false);
              }}
            >
              <Search className="h-3.5 w-3.5" />
              <span>{tradingViewSymbolLabel(symbol)}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
            {searchOpen ? (
              <div className="wolf-term__search-menu" role="listbox">
                <form
                  className="wolf-term__symbol"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (hits[highlight]) pickHit(hits[highlight]);
                    else submitSymbol();
                  }}
                >
                  <input
                    autoFocus
                    value={symbolInput}
                    onChange={(e) => setSymbolInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlight((h) => Math.min(h + 1, Math.max(0, hits.length - 1)));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlight((h) => Math.max(0, h - 1));
                      }
                    }}
                    className="wolf-term__symbol-input"
                    aria-label="Chart symbol"
                    spellCheck={false}
                    placeholder="Search symbol…"
                  />
                </form>
                {hits.length === 0 ? (
                  <div className="wolf-term__search-empty">No match — press Enter for raw symbol</div>
                ) : (
                  hits.map((hit, i) => (
                    <button
                      key={hit.tvSymbol}
                      type="button"
                      role="option"
                      aria-selected={i === highlight}
                      className={`wolf-term__search-item ${i === highlight ? 'on' : ''}`}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pickHit(hit)}
                    >
                      <b>{hit.label}</b>
                      <span>{hit.name}</span>
                      <em>{hit.group}</em>
                    </button>
                  ))
                )}
              </div>
            ) : null}
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
          <button
            type="button"
            className="wolf-term__btn-trade"
            title="Paper trade"
            onClick={() => onTrade?.()}
          >
            Trade
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
                  className={indCategory === 'technicals' ? 'on' : ''}
                  onClick={() => setIndCategory('technicals')}
                >
                  Technicals
                </button>
                <button
                  type="button"
                  className={indCategory === 'wolf' ? 'on' : ''}
                  onClick={() => setIndCategory('wolf')}
                  disabled={!native}
                  title={native ? 'Wolf proprietary indicators' : 'Available on native charts only'}
                >
                  Wolf
                </button>
              </aside>
              <div className="wolf-term__ind-list">
                {indCategory === 'technicals' ? (
                  filteredTechnicals.map((s) => (
                    <label key={s.id} className="wolf-term__ind-row">
                      <input
                        type="checkbox"
                        checked={activeStudies.includes(s.id)}
                        onChange={() => toggleStudy(s.id)}
                      />
                      <span>{s.label}</span>
                    </label>
                  ))
                ) : (
                  <div className="wolf-term__ind-empty">
                    Wolf indicators ship next — technicals are live now.
                  </div>
                )}
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
    </>
  );
}
