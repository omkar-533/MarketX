export type WolfFnoWall = {
  strike: number;
  oi: number;
};

export type WolfFnoCard = {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  available: boolean;
  reason?: string;
  expiry: string | null;
  daysToExpiry: number | null;
  spot: number | null;
  dayChangePct: number | null;
  futLtp: number | null;
  basis: number | null;
  basisPct: number | null;
  pcr: number | null;
  maxPain: number | null;
  maxPainVsSpot: number | null;
  atmStrike: number | null;
  atmIv: number | null;
  atmStraddle: number | null;
  callWall: WolfFnoWall | null;
  putWall: WolfFnoWall | null;
  ceOi: number | null;
  peOi: number | null;
  ceOiChg: number | null;
  peOiChg: number | null;
  strikeCount: number;
};

export type WolfFnoDesk = {
  fetchedAt: number;
  marketOpen: boolean;
  mode?: string;
  cards: WolfFnoCard[];
};
