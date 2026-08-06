import { useCallback, useEffect, useState } from 'react';
import {
  loadTerminalState,
  saveTerminalState,
  type TerminalState,
} from '../../services/terminalState';
import { queueTerminalPaperTrade } from '../../services/paperTradingBridge';
import { usesNativeChart, type TvChartStyle, type TvInterval } from '../../utils/tradingViewSymbols';
import TerminalTopBar from './TerminalTopBar';
import TerminalChartHost from './TerminalChartHost';
import TerminalTvEmbed from './TerminalTvEmbed';
import TerminalRightDock, { type RightPanel } from './TerminalRightDock';
import TerminalTradeStrip from './TerminalTradeStrip';
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
  const [nativeFailed, setNativeFailed] = useState(false);

  const preferNative = usesNativeChart(state.symbol);
  const native = preferNative && !nativeFailed;

  useEffect(() => {
    saveTerminalState(state);
  }, [state]);

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

  const goPaper = useCallback(
    (side: 'BUY' | 'SELL', qty = 1) => {
      queueTerminalPaperTrade({
        tvSymbol: state.symbol,
        side,
        qty: Math.max(1, Math.round(qty) || 1),
        at: new Date().toISOString(),
      });
      onNavigate?.('papertrading');
    },
    [onNavigate, state.symbol],
  );

  const chart = native ? (
    <TerminalChartHost
      symbol={state.symbol}
      interval={state.interval}
      study={state.study}
      chartStyle={state.chartStyle}
      reloadKey={reloadKey}
      nativeFailed={nativeFailed}
      logScale={state.logScale}
      rangePreset={state.activeRange}
      onNativeUnavailable={() => setNativeFailed(true)}
    />
  ) : (
    <TerminalTvEmbed
      symbol={state.symbol}
      interval={state.interval}
      study={state.study}
      chartStyle={state.chartStyle}
      reloadKey={reloadKey}
    />
  );

  return (
    <div
      className={`wolf-term wolf-term--pro ${native ? 'wolf-term--native' : 'wolf-term--tv'}${
        state.rightPanel ? '' : ' wolf-term--panel-closed'
      }`}
      style={{ height: '100%', minHeight: 0 }}
    >
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
        onTrade={() => goPaper('BUY', 1)}
      />

      <div className="wolf-term__body">
        <div className="wolf-term__chart">{chart}</div>
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

      <div className="wolf-term__trade-row">
        <TerminalTradeStrip
          symbol={state.symbol}
          onTrade={(side, qty) => goPaper(side, qty)}
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
