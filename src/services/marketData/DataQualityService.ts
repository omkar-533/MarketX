/**
 * DataQualityService — validate OHLC before scoring / setups.
 */
import type { Candle } from '../radar/radarTypes';
import type { DataQualityIssue, DataQualityReport, NormalizedQuote } from './types';

export function validateCandles(candles: Candle[]): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  if (!candles.length) {
    return {
      ok: false,
      warning: 'DATA_QUALITY_WARNING',
      issues: ['INCOMPLETE_DATA'],
      candleCount: 0,
    };
  }

  const seen = new Set<number>();
  let lastTs = -Infinity;
  for (const c of candles) {
    if (!(c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)) {
      issues.push('INVALID_OHLC');
      break;
    }
    if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) {
      issues.push('INVALID_OHLC');
      break;
    }
    if (seen.has(c.timestamp)) {
      issues.push('DUPLICATE_CANDLES');
      break;
    }
    seen.add(c.timestamp);
    if (c.timestamp < lastTs) {
      issues.push('TIMESTAMP_ORDER');
      break;
    }
    lastTs = c.timestamp;
  }

  // Heuristic gap check — flag if >15% of expected bars missing from span
  if (candles.length >= 10) {
    const step = medianStep(candles);
    if (step > 0) {
      const span = candles[candles.length - 1].timestamp - candles[0].timestamp;
      const expected = Math.floor(span / step) + 1;
      if (expected > 0 && candles.length / expected < 0.85) {
        issues.push('MISSING_CANDLES');
      }
    }
  }

  const uniqueIssues = [...new Set(issues)];
  const ok = uniqueIssues.length === 0;
  return {
    ok,
    warning: ok ? undefined : 'DATA_QUALITY_WARNING',
    issues: uniqueIssues,
    candleCount: candles.length,
  };
}

export function validateQuote(quote: NormalizedQuote, maxAgeMs = 60_000): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  if (!quote.symbol || !(quote.lastPrice > 0)) issues.push('INVALID_SYMBOL');
  if (Date.now() - quote.timestamp > maxAgeMs) issues.push('STALE_QUOTE');
  const ok = issues.length === 0;
  return {
    ok,
    warning: ok ? undefined : 'DATA_QUALITY_WARNING',
    issues,
    candleCount: 0,
  };
}

function medianStep(candles: Candle[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    diffs.push(candles[i].timestamp - candles[i - 1].timestamp);
  }
  if (!diffs.length) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/**
 * Deduplicate + sort ascending by timestamp.
 */
export function normalizeCandleSeries(candles: Candle[]): Candle[] {
  const byTs = new Map<number, Candle>();
  for (const c of candles) {
    if (!Number.isFinite(c.timestamp)) continue;
    byTs.set(c.timestamp, c);
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}
