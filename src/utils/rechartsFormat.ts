/** Safe Recharts tooltip/value formatters (ValueType may be undefined). */
export function formatTooltipNumber(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
}

export function formatTooltipPair(val: unknown, name: unknown): [string, string] {
  return [formatTooltipNumber(val), String(name ?? '')];
}

export function formatTooltipPairCurrency(val: unknown, name: unknown): [string, string] {
  const n = typeof val === 'number' ? val : Number(val);
  const text = Number.isFinite(n) ? `₹${n.toFixed(2)}` : '—';
  return [text, String(name ?? '')];
}
