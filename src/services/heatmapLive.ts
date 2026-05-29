import {
  getStockHeatmapData,
  getSectorHeatmapData,
  getOIHeatmapData,
  type StockHeatmapItem,
  type SectorHeatmapItem,
  type OIHeatmapSnapshot,
} from '../data/marketData';
import { getMarketConnectionState, refreshMarketConnection } from './marketConnection';
import { refreshFnoLiveQuotesAsync } from './symbolLiveService';
import { fetchOptionChainLive, refreshOptionChainsLive } from './optionChainLiveService';
import { subscribeLiveSymbols } from './marketTickStream';
import { FNO_UNIVERSE } from '../data/fnoUniverse';

export const HEATMAP_OI_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'] as const;

export interface LiveHeatmapBundle {
  stocks: StockHeatmapItem[];
  sectors: SectorHeatmapItem[];
  oi: OIHeatmapSnapshot;
  fetchedAt: Date;
  live: boolean;
  quoteCount: number;
  oiStrikeCount: number;
}

function isLiveFeed(
  conn: ReturnType<typeof getMarketConnectionState>,
  stocks: StockHeatmapItem[],
  sectors: SectorHeatmapItem[],
  oi: OIHeatmapSnapshot,
): boolean {
  const quotesLive = stocks.some((s) => s.price > 0);
  const sectorsLive = sectors.some((s) => s.stockCount > 0 && Math.abs(s.changePercent) > 0);
  const oiLive = oi.strikes.some((s) => s.totalOi > 0);
  return Boolean(
    conn.fyersConnected &&
      conn.serverOk &&
      (conn.streamActive || quotesLive || sectorsLive || oiLive),
  );
}

/** Sync snapshot from in-memory Fyers cache (WebSocket ticks + last REST pull) */
export function buildHeatmapSnapshot(oiSymbol: string): LiveHeatmapBundle {
  const conn = getMarketConnectionState();
  const stocks = getStockHeatmapData();
  const sectors = getSectorHeatmapData();
  const oi = getOIHeatmapData(oiSymbol);

  return {
    stocks,
    sectors,
    oi,
    fetchedAt: new Date(),
    live: isLiveFeed(conn, stocks, sectors, oi),
    quoteCount: stocks.filter((s) => s.price > 0).length,
    oiStrikeCount: oi.strikes.length,
  };
}

/** Pull latest F&O quotes then rebuild sector aggregates from live stock moves */
export async function refreshHeatmapSectors(): Promise<SectorHeatmapItem[]> {
  await refreshFnoLiveQuotesAsync();
  return getSectorHeatmapData();
}

/** Full Fyers pull: quotes + all index option chains used on heatmap */
export async function fetchLiveHeatmap(
  oiSymbol: string = 'NIFTY',
  opts?: { forceOi?: boolean },
): Promise<LiveHeatmapBundle> {
  subscribeLiveSymbols(FNO_UNIVERSE.map((i) => i.symbol));

  await refreshMarketConnection();
  await refreshFnoLiveQuotesAsync();

  await refreshOptionChainsLive([...HEATMAP_OI_SYMBOLS]);
  await fetchOptionChainLive(oiSymbol, undefined, {
    force: opts?.forceOi ?? true,
    strikeWindow: 0,
  });

  await Promise.all(
    HEATMAP_OI_SYMBOLS.filter((sym) => sym !== oiSymbol).map((sym) =>
      fetchOptionChainLive(sym, undefined, { force: false, strikeWindow: 0 }),
    ),
  );

  return buildHeatmapSnapshot(oiSymbol);
}

/** Refresh active index option chain from Fyers (full strike ladder for OI heatmap) */
export async function refreshHeatmapOi(oiSymbol: string): Promise<OIHeatmapSnapshot> {
  subscribeLiveSymbols([oiSymbol]);
  await fetchOptionChainLive(oiSymbol, undefined, { force: true, strikeWindow: 0 });
  return getOIHeatmapData(oiSymbol);
}

/** Sectors + OI without full stock REST sweep (tab switch / fast tick) */
export async function refreshHeatmapTabLive(
  tab: 'sectors' | 'oi',
  oiSymbol: string,
): Promise<Partial<LiveHeatmapBundle>> {
  if (tab === 'sectors') {
    const sectors = await refreshHeatmapSectors();
    return { sectors, fetchedAt: new Date() };
  }
  const oi = await refreshHeatmapOi(oiSymbol);
  return { oi, fetchedAt: new Date(), oiStrikeCount: oi.strikes.length };
}
