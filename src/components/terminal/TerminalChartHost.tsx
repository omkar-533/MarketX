import NativeChatChart from '../masterai/NativeChatChart';
import TradingViewChatChart from '../masterai/TradingViewChatChart';
import type { TerminalPaperHandoff } from '../../services/paperTradingBridge';
import { usesNativeChart, type TvChartStyle, type TvInterval } from '../../utils/tradingViewSymbols';
import type { ChartLevel } from '../../utils/chartAnnotations';

export type TerminalChartHostProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
  nativeFailed: boolean;
  logScale?: boolean;
  rangePreset?: string;
  /** Drawing rail — hide on inactive multi-chart panes. */
  showRail?: boolean;
  /** Optional WOLF key levels on native chart. */
  levels?: ChartLevel[];
  onNativeUnavailable: () => void;
  onClearIndicators?: () => void;
  onApplyStudy?: (study: string) => void;
  onStudyChange?: (study: string) => void;
  onPaperTrade?: (handoff: TerminalPaperHandoff) => void;
  onNavigate?: (tab: string) => void;
  needsLiveDataConnect?: boolean;
  onConnectLiveData?: () => void;
};

/**
 * Chart kernel host.
 * Free TradingView embed blocks NSE/BSE (and several others) — those stay native.
 */
export default function TerminalChartHost({
  symbol,
  interval,
  study,
  chartStyle,
  reloadKey,
  nativeFailed,
  logScale = false,
  rangePreset,
  showRail = true,
  levels,
  onNativeUnavailable,
  onClearIndicators,
  onApplyStudy,
  onStudyChange,
  onPaperTrade,
  onNavigate,
  needsLiveDataConnect,
  onConnectLiveData,
}: TerminalChartHostProps) {
  const preferNative = usesNativeChart(symbol);

  if (preferNative) {
    if (nativeFailed) {
      return (
        <div className="wolf-term__tv-status">
          Native chart unavailable for {symbol}. Try Refresh — free TradingView embed cannot show this NSE symbol.
        </div>
      );
    }
    return (
      <NativeChatChart
        symbol={symbol}
        interval={interval}
        study={study}
        chartStyle={chartStyle}
        reloadKey={reloadKey}
        fillHeight
        showRail={showRail}
        enableHistoryScroll
        logScale={logScale}
        rangePreset={rangePreset}
        levels={levels}
        onUnavailable={onNativeUnavailable}
        onClearIndicators={onClearIndicators}
        onApplyStudy={onApplyStudy}
        onStudyChange={onStudyChange}
        onPaperTrade={onPaperTrade}
        onNavigate={onNavigate}
        needsLiveDataConnect={needsLiveDataConnect}
        onConnectLiveData={onConnectLiveData}
      />
    );
  }

  return (
    <div className="wolf-term__tv-fallback">
      <TradingViewChatChart
        symbol={symbol}
        interval={interval}
        study={study}
        chartStyle={chartStyle}
        reloadKey={reloadKey}
      />
    </div>
  );
}
