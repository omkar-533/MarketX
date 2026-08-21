/**
 * X Factor — relative volume of the signal against its own recent average.
 *
 * Only the volume-driven cards swap it in for the Wolf score. A board row saved
 * before the field existed simply has no X Factor: those fall back to the score
 * instead of showing a made-up multiple.
 */
import type { OpportunityHit, OpportunityScannerId } from './opportunityTypes';

export const X_FACTOR_SCANNERS: OpportunityScannerId[] = ['morning_sprint', 'opening_drive'];

const SCANNERS = new Set<string>(X_FACTOR_SCANNERS);

export function showsXFactor(scannerId: string): boolean {
  return SCANNERS.has(scannerId);
}

export function xFactorOf(hit: Pick<OpportunityHit, 'scannerId' | 'meta'>): number | null {
  if (!SCANNERS.has(hit.scannerId)) return null;
  const raw = Number(hit.meta?.xFactor);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function formatXFactor(value: number): string {
  return `${value.toFixed(1)}×`;
}
