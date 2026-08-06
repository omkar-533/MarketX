import NativeChatChart from '../masterai/NativeChatChart';
import TradingViewChatChart from '../masterai/TradingViewChatChart';
import { usesNativeChart, type TvChartStyle, type TvInterval } from '../../utils/tradingViewSymbols';

export type TerminalChartHostProps = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  reloadKey: number;
  nativeFailed: boolean;
  onNativeUnavailable: () => void;
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
  onNativeUnavailable,
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
        onUnavailable={onNativeUnavailable}
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
