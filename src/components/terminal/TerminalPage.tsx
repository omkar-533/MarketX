import { useCallback, useEffect, useState } from 'react';
import {
  loadTerminalState,
  saveTerminalState,
  TERMINAL_OPEN_SYMBOL_EVENT,
  type TerminalState,
} from '../../services/terminalState';
import {
  resizeChartSymbols,
  type TerminalChartCount,
} from '../../services/terminalChartLayouts';
import { type TvChartStyle, type TvInterval } from '../../utils/tradingViewSymbols';
import TerminalTopBar from './TerminalTopBar';
import TerminalChartGrid from './TerminalChartGrid';
import TerminalRightDock, { type RightPanel } from './TerminalRightDock';
import TerminalBottomBar from './TerminalBottomBar';

export type TerminalPageProps = {
  onNavigate?: (tab: string) => void;
};

/**
 * Wolf Terminal — TradingView-style desk chrome over native / widget chart kernels.
 */
export default function TerminalPage({ onNavigate }: TerminalPageProps) {
  const [state, setState] = useState<TerminalState>(() => loadTerminalState());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    saveTerminalState(state);
  }, [state]);

  const patch = useCallback((partial: Partial<TerminalState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const onSymbolChange = useCallback((symbol: string) => {
    setState((prev) => {
      const watchlist = prev.watchlist.includes(symbol)
        ? prev.watchlist
        : [symbol, ...prev.watchlist].slice(0, 40);
      const idx = Math.min(prev.activeChartIndex, Math.max(0, prev.chartCount - 1));
      const chartSymbols = [...prev.chartSymbols];
      while (chartSymbols.length < prev.chartCount) {
        chartSymbols.push(symbol);
      }
      chartSymbols[idx] = symbol;
      return { ...prev, symbol, watchlist, chartSymbols };
    });
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const sym = (e as CustomEvent<{ symbol?: string }>).detail?.symbol;
      if (sym) onSymbolChange(String(sym));
    };
    window.addEventListener(TERMINAL_OPEN_SYMBOL_EVENT, onOpen);
    return () => window.removeEventListener(TERMINAL_OPEN_SYMBOL_EVENT, onOpen);
  }, [onSymbolChange]);

  const onChartCountChange = useCallback((chartCount: TerminalChartCount) => {
    setState((prev) => {
      const chartSymbols = resizeChartSymbols(
        prev.chartSymbols,
        chartCount,
        prev.watchlist,
        prev.symbol,
      );
      const activeChartIndex = Math.min(prev.activeChartIndex, chartCount - 1);
      return {
        ...prev,
        chartCount,
        chartSymbols,
        activeChartIndex,
        symbol: chartSymbols[activeChartIndex] || prev.symbol,
      };
    });
  }, []);

  const onActiveChartIndexChange = useCallback((activeChartIndex: number) => {
    setState((prev) => {
      if (prev.activeChartIndex === activeChartIndex) return prev;
      return {
        ...prev,
        activeChartIndex,
        symbol: prev.chartSymbols[activeChartIndex] || prev.symbol,
      };
    });
  }, []);

  const onClearIndicators = useCallback(() => patch({ study: 'none' }), [patch]);
  const onApplyStudy = useCallback((study: string) => patch({ study }), [patch]);
  const onStudyChange = useCallback((study: string) => patch({ study }), [patch]);
  const onReload = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div
      className={`wolf-term wolf-term--pro wolf-term--native${
        state.rightPanel ? '' : ' wolf-term--panel-closed'
      }${state.chartCount > 1 ? ' wolf-term--multi' : ''}`}
      style={{ height: '100%', minHeight: 0 }}
    >
      <TerminalTopBar
        symbol={state.symbol}
        interval={state.interval}
        study={state.study}
        chartStyle={state.chartStyle}
        chartCount={state.chartCount}
        onSymbolChange={onSymbolChange}
        onIntervalChange={(interval: TvInterval) => patch({ interval })}
        onStudyChange={(study) => patch({ study })}
        onChartStyleChange={(chartStyle: TvChartStyle) => patch({ chartStyle })}
        onChartCountChange={onChartCountChange}
        onReload={onReload}
        onExitApp={() => onNavigate?.('live-wolf')}
        onNavigate={onNavigate}
      />

      <div className="wolf-term__body">
        <div className="wolf-term__chart">
          <TerminalChartGrid
            chartCount={state.chartCount}
            chartSymbols={state.chartSymbols}
            activeIndex={state.activeChartIndex}
            onActiveIndexChange={onActiveChartIndexChange}
            interval={state.interval}
            study={state.study}
            chartStyle={state.chartStyle}
            reloadKey={reloadKey}
            logScale={state.logScale}
            rangePreset={state.activeRange}
            onClearIndicators={onClearIndicators}
            onApplyStudy={onApplyStudy}
            onStudyChange={onStudyChange}
            onNavigate={onNavigate}
          />
        </div>
        <TerminalRightDock
          panel={state.rightPanel}
          onPanelChange={(rightPanel: RightPanel) => patch({ rightPanel })}
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
      </div>

      <TerminalBottomBar
        activeRange={state.activeRange}
        onRangeChange={(activeRange) => patch({ activeRange })}
        logScale={state.logScale}
        onToggleLog={() => patch({ logScale: !state.logScale })}
      />
    </div>
  );
}
