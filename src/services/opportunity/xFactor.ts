/**
 * X Factor — relative volume of the signal against its own recent average.
 *
 * Every desk card shows it in place of the Wolf score, and any card added later
 * gets it for free: baseHit() in opportunityScanners.ts stamps the value on each
 * hit, so nothing has to be registered here.
 *
 * A hit without the field — a board row saved before X Factor existed, or a bar
 * whose volume could not be measured — falls back to the score instead of
 * showing a made-up multiple.
 */
import type { OpportunityHit } from './opportunityTypes';

export function xFactorOf(hit: Pick<OpportunityHit, 'meta'>): number | null {
  const raw = Number(hit.meta?.xFactor);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function formatXFactor(value: number): string {
  return `${value.toFixed(1)}×`;
}
