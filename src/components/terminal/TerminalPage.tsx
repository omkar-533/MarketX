import { useCallback, useEffect, useState } from 'react';
import { ListOrdered, RefreshCw, X } from 'lucide-react';
import {
  loadTerminalState,
  saveTerminalState,
  type TerminalState,
} from '../../services/terminalState';
import { usesNativeChart, type TvChartStyle, type TvInterval } from '../../utils/tradingViewSymbols';
import TerminalTopBar from './TerminalTopBar';
import TerminalChartHost from './TerminalChartHost';
import TerminalTvEmbed from './TerminalTvEmbed';
import TerminalWatchlist from './TerminalWatchlist';

export type TerminalPageProps = {
  onNavigate?: (tab: string) => void;
};

/**
 * Wolf Terminal desk.
 * NSE/BSE/crypto/FX → native chart (free TV embed blocks Indian symbols).
 * Other symbols → TradingView Advanced Chart widget.
 */
export default function TerminalPage({ onNavigate }: TerminalPageProps) {
  const [state, setState] = useState<TerminalState>(() => loadTerminalState());
  const [reloadKey, setReloadKey] = useState(0);
  const [nativeFailed, setNativeFailed] = useState(false);
  const [watchOpen, setWatchOpen] = useState(() => loadTerminalState().watchlistOpen);

  const native = usesNativeChart(state.symbol) && !nativeFailed;

  useEffect(() => {
    saveTerminalState({ ...state, watchlistOpen: watchOpen });
  }, [state, watchOpen]);

  useEffect(() => {
    setNativeFailed(false);
  }, [state.symbol]);

  const patch = useCallback((partial: Partial<TerminalState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const onSymbolChange = useCallback((symbol: string) => {
    setState((prev) => {
      const watchlist = prev.watchlist.includes(symbol)
        ? prev.watchlist
        : [symbol, ...prev.watchlist].slice(0, 40);
      return { ...prev, symbol, watchlist };
    });
  }, []);

  const watchAside = watchOpen ? (
    <aside className="wolf-term__wl-side">
      <TerminalWatchlist
        symbols={state.watchlist}
        activeSymbol={state.symbol}
        onSelect={onSymbolChange}
        onAdd={(tv) =>
          setState((prev) => ({
            ...prev,
            watchlist: prev.watchlist.includes(tv)
              ? prev.watchlist
              : [...prev.watchlist, tv].slice(0, 40),
          }))
        }
        onRemove={(tv) =>
          setState((prev) => ({
            ...prev,
            watchlist:
              prev.watchlist.length <= 1
                ? prev.watchlist
                : prev.watchlist.filter((s) => s !== tv),
          }))
        }
      />
    </aside>
  ) : null;

  const exitActions = (
    <div className="wolf-term__exitbar-actions">
      <button
        type="button"
        className={`wolf-term__exitbar-btn ${watchOpen ? 'on' : ''}`}
        title="Watchlist"
        onClick={() => setWatchOpen((v) => !v)}
      >
        <ListOrdered className="h-3.5 w-3.5" />
        Watchlist
      </button>
      <button
        type="button"
        className="wolf-term__exitbar-btn"
        title="Reload chart"
        onClick={() => setReloadKey((k) => k + 1)}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </button>
      <button
        type="button"
        className="wolf-term__exitbar-btn"
        title="Exit terminal"
        onClick={() => onNavigate?.('wolf-ai')}
      >
        <X className="h-3.5 w-3.5" />
        Exit
      </button>
    </div>
  );

  if (!native) {
    return (
      <div className={`wolf-term wolf-term--tv ${watchOpen ? '' : 'wolf-term--wl-closed'}`}>
        <header className="wolf-term__exitbar">
          <button
            type="button"
            className="wolf-term__logo"
            title="Back to Wolf app"
            onClick={() => onNavigate?.('wolf-ai')}
          >
            W
          </button>
          <span className="wolf-term__exitbar-title">Wolf Terminal</span>
          <span className="wolf-term__exitbar-hint">TradingView widget</span>
          {exitActions}
        </header>
        <div className="wolf-term__body">
          <div className="wolf-term__chart">
            <TerminalTvEmbed
              symbol={state.symbol}
              interval={state.interval}
              study={state.study}
              chartStyle={state.chartStyle}
              reloadKey={reloadKey}
            />
          </div>
          {watchAside}
        </div>
      </div>
    );
  }

  return (
    <div className={`wolf-term wolf-term--native ${watchOpen ? '' : 'wolf-term--wl-closed'}`}>
      <header className="wolf-term__exitbar">
        <button
          type="button"
          className="wolf-term__logo"
          title="Back to Wolf app"
          onClick={() => onNavigate?.('wolf-ai')}
        >
          W
        </button>
        <span className="wolf-term__exitbar-title">Wolf Terminal</span>
        <span className="wolf-term__exitbar-hint">Native · NSE data via our feed</span>
        {exitActions}
      </header>

      <TerminalTopBar
        symbol={state.symbol}
        interval={state.interval}
        study={state.study}
        chartStyle={state.chartStyle}
        onSymbolChange={onSymbolChange}
        onIntervalChange={(interval: TvInterval) => patch({ interval })}
        onStudyChange={(study) => patch({ study })}
        onChartStyleChange={(chartStyle: TvChartStyle) => patch({ chartStyle })}
        onReload={() => setReloadKey((k) => k + 1)}
        onExitApp={() => onNavigate?.('wolf-ai')}
      />

      <div className="wolf-term__body">
        <div className="wolf-term__chart">
          <TerminalChartHost
            symbol={state.symbol}
            interval={state.interval}
            study={state.study}
            chartStyle={state.chartStyle}
            reloadKey={reloadKey}
            nativeFailed={nativeFailed}
            onNativeUnavailable={() => setNativeFailed(true)}
          />
        </div>
        {watchAside}
      </div>
    </div>
  );
}
