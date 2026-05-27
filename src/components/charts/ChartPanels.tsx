import { memo } from 'react';
import type { ChartDataSource, ChartIndicator, ChartTimeframe, ChartType } from '../../types/chart';
import ProChart from './ProChart';

export type ChartPanelsProps = {
  symbol: string;
  secondarySymbol: string;
  layout: 'single' | 'dual';
  timeframe: ChartTimeframe;
  chartType: ChartType;
  indicators: ChartIndicator[];
  dataSource: ChartDataSource;
  fullscreen: boolean;
};

function ChartPanels({
  symbol,
  secondarySymbol,
  layout,
  timeframe,
  chartType,
  indicators,
  dataSource,
  fullscreen,
}: ChartPanelsProps) {
  const panel = (sym: string, key: string) => (
    <div
      key={key}
      className="flex flex-col flex-1 min-h-0 min-w-0 rounded-xl border border-dark-border overflow-hidden bg-dark-surface h-full"
      style={{ minHeight: fullscreen ? undefined : 520 }}
    >
      <ProChart
        symbol={sym}
        timeframe={timeframe}
        chartType={chartType}
        indicators={indicators}
        dataSource={dataSource}
        className="h-full min-h-[480px]"
      />
    </div>
  );

  return (
    <div
      className={`flex-1 min-h-0 grid gap-2 ${
        layout === 'dual' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
      }`}
    >
      {panel(symbol, 'main')}
      {layout === 'dual' && panel(secondarySymbol, 'sec')}
    </div>
  );
}

export default memo(ChartPanels);
