/**
 * Stop level — the price a setup is not allowed to close through.
 *
 * A scanner opts in by putting `stopLevel` on the hit's meta. Wolf Hunters uses the
 * hunt candle's own extreme: closing back through the wick that did the sweeping
 * means the sweep failed. Cards read the value straight off the hit, so any scanner
 * added later shows a stop simply by stamping the same field.
 *
 * A hit without the field — an older board row, or a scanner that does not define a
 * stop — shows nothing rather than a guessed level.
 */
import type { OpportunityHit } from './opportunityTypes';

export function stopLevelOf(hit: Pick<OpportunityHit, 'meta'>): number | null {
  const raw = Number(hit.meta?.stopLevel);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** When the stop was taken out, else null while the setup is still alive. */
export function stoppedAtOf(hit: Pick<OpportunityHit, 'meta'>): number | null {
  const raw = Number(hit.meta?.stoppedAt);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}
