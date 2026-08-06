import NativeChatChart from '../masterai/NativeChatChart';
import TradingViewChatChart from '../masterai/TradingViewChatChart';
import type { TerminalPaperHandoff } from '../../services/paperTradingBridge';
import { usesNativeChart, type TvChartStyle, type TvInterval } from '../../utils/tradingViewSymbols';

export type TerminalChartHostProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
  nativeFailed: boolean;
  logScale?: boolean;
  rangePreset?: string;
  onNativeUnavailable: () => void;
  onClearIndicators?: () => void;
  onApplyStudy?: (study: string) => void;
  onStudyChange?: (study: string) => void;
  onPaperTrade?: (handoff: TerminalPaperHandoff) => void;
  onNavigate?: (tab: string) => void;
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
  onNativeUnavailable,
  onClearIndicators,
  onApplyStudy,
  onStudyChange,
  onPaperTrade,
  onNavigate,
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
        enableHistoryScroll
        logScale={logScale}
        rangePreset={rangePreset}
        onUnavailable={onNativeUnavailable}
        onClearIndicators={onClearIndicators}
        onApplyStudy={onApplyStudy}
        onStudyChange={onStudyChange}
        onPaperTrade={onPaperTrade}
        onNavigate={onNavigate}
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
