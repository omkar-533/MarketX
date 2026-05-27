import { getOptionChain, type OptionData } from '../data/marketData';

/** Strike row shape used by PCR / Max Pain panels */
export type StrikeData = {
  strike: number;
  cePrice: number;
  ceOI: number;
  ceVolume: number;
  ceIV: number;
  ceDelta: number;
  ceGamma: number;
  ceTheta: number;
  ceVega: number;
  pePrice: number;
  peOI: number;
  peVolume: number;
  peIV: number;
  peDelta: number;
  peGamma: number;
  peTheta: number;
  peVega: number;
  pcr: number;
};

function mapRow(row: OptionData): StrikeData {
  return {
    strike: row.strike,
    cePrice: row.ceLtp,
    ceOI: row.ceOi,
    ceVolume: row.ceVolume,
    ceIV: row.ceIv,
    ceDelta: row.ceDelta,
    ceGamma: row.ceGamma,
    ceTheta: row.ceTheta,
    ceVega: row.ceVega,
    pePrice: row.peLtp,
    peOI: row.peOi,
    peVolume: row.peVolume,
    peIV: row.peIv,
    peDelta: row.peDelta,
    peGamma: row.peGamma,
    peTheta: row.peTheta,
    peVega: row.peVega,
    pcr: row.pcr,
  };
}

export function getStrikeChain(symbol: string, spot?: number, expiry?: string): StrikeData[] {
  return getOptionChain(symbol, spot, expiry).map(mapRow);
}

export function calculateMaxPainFromStrikes(strikes: StrikeData[]): {
  maxPainStrike: number;
  painValues: { strike: number; pain: number }[];
} {
  if (!strikes.length) return { maxPainStrike: 0, painValues: [] };
  const painValues = strikes.map((s) => {
    let pain = 0;
    strikes.forEach((s2) => {
      if (s2.strike <= s.strike) pain += s2.ceOI * (s.strike - s2.strike);
      if (s2.strike >= s.strike) pain += s2.peOI * (s2.strike - s.strike);
    });
    return { strike: s.strike, pain: Math.round(pain) };
  });
  const minPain = painValues.reduce((min, p) => (p.pain < min.pain ? p : min), painValues[0]);
  return { maxPainStrike: minPain.strike, painValues };
}
