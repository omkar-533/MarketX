/**
 * Chart Identification — asset / timeframe from a Wolf screenshot reply.
 * Never invent: low confidence → UNCONFIRMED.
 */

export type WolfAssetClass =
  | 'INDEX'
  | 'STOCK'
  | 'ETF'
  | 'FUTURES'
  | 'OPTIONS'
  | 'FOREX'
  | 'CRYPTO'
  | 'COMMODITY'
  | 'BOND'
  | 'OTHER'
  | 'UNCONFIRMED';

export type ChartIdentity = {
  symbol: string;
  assetClass: WolfAssetClass;
  exchange: string;
  timeframe: string;
  chartPlatform: string;
  chartType: string;
  confidence: number;
  confirmed: boolean;
};

const FENCE_RE = /```(?:wolfidentity|chartid|identity)\s*([\s\S]*?)```/i;

function clampConf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asClass(raw: unknown): WolfAssetClass {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  const map: Record<string, WolfAssetClass> = {
    INDEX: 'INDEX',
    STOCK: 'STOCK',
    EQUITY: 'STOCK',
    ETF: 'ETF',
    FUTURES: 'FUTURES',
    FUTURE: 'FUTURES',
    OPTIONS: 'OPTIONS',
    OPTION: 'OPTIONS',
    FOREX: 'FOREX',
    FX: 'FOREX',
    CRYPTO: 'CRYPTO',
    COMMODITY: 'COMMODITY',
    COMMODITIES: 'COMMODITY',
    BOND: 'BOND',
    OTHER: 'OTHER',
    UNCONFIRMED: 'UNCONFIRMED',
  };
  return map[t] || 'UNCONFIRMED';
}

function pickField(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*\\*{0,2}${label}\\*{0,2}\\s*[:：-]\\s*([^\\n]+)`,
      'i',
    );
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim().replace(/^\*+|\*+$/g, '').trim();
  }
  return '';
}

function fromObject(raw: Record<string, unknown>): ChartIdentity | null {
  const asset =
    raw.asset && typeof raw.asset === 'object'
      ? (raw.asset as Record<string, unknown>)
      : raw;
  const symbol = String(asset.symbol || asset.ticker || '').trim();
  const timeframe = String(asset.timeframe || asset.tf || asset.interval || '').trim();
  const confidence = clampConf(
    Number(asset.confidence ?? raw.confidence ?? (symbol ? 55 : 0)),
  );
  if (!symbol && !timeframe && confidence < 20) return null;
  return {
    symbol: symbol || 'UNCONFIRMED',
    assetClass: asClass(asset.asset_class || asset.assetClass || asset.class),
    exchange: String(asset.exchange || '').trim(),
    timeframe: timeframe || 'UNCONFIRMED',
    chartPlatform: String(asset.chart_platform || asset.platform || '').trim(),
    chartType: String(asset.chart_type || asset.chartType || '').trim(),
    confidence,
    confirmed: confidence >= 60 && Boolean(symbol) && !/^unconfirmed$/i.test(symbol),
  };
}

/** Strip identity fence and parse ChartIdentity when present. */
export function parseChartIdentity(text: string): { identity: ChartIdentity | null; text: string } {
  const raw = String(text || '');
  const fence = raw.match(FENCE_RE);
  let identity: ChartIdentity | null = null;
  let cleaned = raw;

  if (fence?.[1]) {
    cleaned = raw.replace(fence[0], '\n').trim();
    try {
      const parsed = JSON.parse(fence[1].trim()) as Record<string, unknown>;
      identity = fromObject(parsed);
    } catch {
      identity = null;
    }
  }

  if (!identity) {
    const symbol = pickField(cleaned, ['Detected Symbol', 'Symbol', 'Instrument']);
    const timeframe = pickField(cleaned, ['Detected Timeframe', 'Timeframe', 'TF']);
    const assetClass = pickField(cleaned, ['Asset Class', 'Asset']);
    const confRaw = pickField(cleaned, ['Identity Confidence', 'Detection Confidence']);
    const conf = clampConf(Number(confRaw.match(/\d+/)?.[0] || (symbol ? 50 : 0)));
    if (symbol || timeframe) {
      identity = {
        symbol: symbol || 'UNCONFIRMED',
        assetClass: asClass(assetClass),
        exchange: '',
        timeframe: timeframe || 'UNCONFIRMED',
        chartPlatform: '',
        chartType: '',
        confidence: conf,
        confirmed: conf >= 60 && Boolean(symbol),
      };
    }
  }

  return { identity, text: cleaned };
}

export function chartIdentityLabel(id: ChartIdentity | null | undefined): string {
  if (!id) return 'CHART';
  const sym = id.symbol && id.symbol !== 'UNCONFIRMED' ? id.symbol : 'Chart';
  const tf = id.timeframe && id.timeframe !== 'UNCONFIRMED' ? id.timeframe : '';
  return tf ? `${sym} · ${tf}` : sym;
}
