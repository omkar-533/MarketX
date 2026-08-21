/**
 * Per-card timeframes.
 *
 * The desk no longer has one global timeframe: every card sits on a timeframe its
 * own scanner is built for. Anything outside that list is refused rather than
 * silently painting a card that its scanner can never fill.
 */
import {
  OPPORTUNITY_SCANNERS,
  type OpportunityScannerId,
  type OpportunityTimeframe,
} from './opportunityTypes';

/**
 * The timeframe the shared board is always built on — the client's scan target.
 * Every card on the desk is an hourly rule, so a 5m board would be fetched, scanned
 * and posted for nothing while both cards waited on a second round trip.
 */
export const PRIMARY_TIMEFRAME: OpportunityTimeframe = '1h';

const BY_ID = new Map<string, OpportunityTimeframe[]>(
  OPPORTUNITY_SCANNERS.map((s) => [s.id, s.timeframes]),
);

export function scannerTimeframes(scannerId: string): OpportunityTimeframe[] {
  return BY_ID.get(scannerId) ?? [PRIMARY_TIMEFRAME];
}

export function defaultScannerTimeframe(scannerId: string): OpportunityTimeframe {
  return scannerTimeframes(scannerId)[0] ?? PRIMARY_TIMEFRAME;
}

/** Keeps a card on a timeframe its scanner runs on, whatever it was handed. */
export function coerceScannerTimeframe(
  scannerId: string,
  timeframe: OpportunityTimeframe | undefined,
): OpportunityTimeframe {
  if (timeframe && scannerTimeframes(scannerId).includes(timeframe)) return timeframe;
  return defaultScannerTimeframe(scannerId);
}

export type CardTimeframes = Partial<Record<OpportunityScannerId, OpportunityTimeframe>>;

export function defaultCardTimeframes(): CardTimeframes {
  const out: CardTimeframes = {};
  for (const s of OPPORTUNITY_SCANNERS) out[s.id] = defaultScannerTimeframe(s.id);
  return out;
}

/** Distinct boards the desk has to load for the current card selection. */
export function timeframesInUse(cardTf: CardTimeframes): OpportunityTimeframe[] {
  const seen = new Set<OpportunityTimeframe>();
  for (const s of OPPORTUNITY_SCANNERS) {
    seen.add(coerceScannerTimeframe(s.id, cardTf[s.id]));
  }
  return [...seen];
}
