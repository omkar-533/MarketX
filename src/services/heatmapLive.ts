import {
  getStockHeatmapData,
  getSectorHeatmapData,
  getOIHeatmapData,
  type StockHeatmapItem,
  type SectorHeatmapItem,
  type OIHeatmapSnapshot,
} from '../data/marketData';

export interface LiveHeatmapBundle {
  stocks: StockHeatmapItem[];
  sectors: SectorHeatmapItem[];
  oi: OIHeatmapSnapshot;
  fetchedAt: Date;
}

/** Live refresh from market data engine (updates every poll). */
export async function fetchLiveHeatmap(oiSymbol: string = 'NIFTY'): Promise<LiveHeatmapBundle> {
  await new Promise((r) => setTimeout(r, 16));
  return {
    stocks: getStockHeatmapData(),
    sectors: getSectorHeatmapData(),
    oi: getOIHeatmapData(oiSymbol),
    fetchedAt: new Date(),
  };
}
