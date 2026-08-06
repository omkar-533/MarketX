const ALERTS_KEY = 'wolf_chart_price_alerts';
const TEMPLATE_KEY = 'wolf_chart_templates';
const CLIP_PRICE_KEY = 'wolf_chart_clip_price';

export type ChartPriceAlert = {
  id: string;
  symbol: string;
  price: number;
  condition: string;
  createdAt: string;
};

export type ChartTemplate = {
  id: string;
  name: string;
  savedAt: string;
  /** Serialized drawings JSON from useChartDrawings storage, if any. */
  drawingsJson?: string;
  study?: string;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function listChartPriceAlerts(): ChartPriceAlert[] {
  return readJson<ChartPriceAlert[]>(ALERTS_KEY, []);
}

export const CHART_ALERTS_CHANGED_EVENT = 'wolf:chart-alerts-changed';

function emitChartAlertsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHART_ALERTS_CHANGED_EVENT));
}

export function addChartPriceAlert(
  symbol: string,
  price: number,
  opts?: { condition?: string },
): ChartPriceAlert {
  const alert: ChartPriceAlert = {
    id: `ca-${Date.now()}`,
    symbol,
    price,
    condition:
      opts?.condition ||
      `Crossing ${price.toLocaleString('en-IN', { maximumFractionDigits: 4 })}`,
    createdAt: new Date().toISOString(),
  };
  const next = [alert, ...listChartPriceAlerts()].slice(0, 80);
  localStorage.setItem(ALERTS_KEY, JSON.stringify(next));
  emitChartAlertsChanged();
  return alert;
}

export function removeChartPriceAlert(id: string): void {
  localStorage.setItem(
    ALERTS_KEY,
    JSON.stringify(listChartPriceAlerts().filter((a) => a.id !== id)),
  );
  emitChartAlertsChanged();
}

export function clearChartPriceAlerts(): void {
  localStorage.setItem(ALERTS_KEY, JSON.stringify([]));
  emitChartAlertsChanged();
}

export function rememberCopiedPrice(price: number) {
  try {
    sessionStorage.setItem(CLIP_PRICE_KEY, String(price));
  } catch {
    /* ignore */
  }
}

export function peekCopiedPrice(): number | null {
  try {
    const raw = sessionStorage.getItem(CLIP_PRICE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function listChartTemplates(): ChartTemplate[] {
  return readJson<ChartTemplate[]>(TEMPLATE_KEY, []);
}

export function saveChartTemplate(tpl: Omit<ChartTemplate, 'id' | 'savedAt'>): ChartTemplate {
  const entry: ChartTemplate = {
    ...tpl,
    id: `ct-${Date.now()}`,
    savedAt: new Date().toISOString(),
  };
  const next = [entry, ...listChartTemplates()].slice(0, 12);
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  return entry;
}

export function deleteChartTemplate(id: string) {
  localStorage.setItem(
    TEMPLATE_KEY,
    JSON.stringify(listChartTemplates().filter((t) => t.id !== id)),
  );
}
