/** NSE equity + F&O regular session (IST) */

const IST = 'Asia/Kolkata';

const WEEKDAY_TO_JS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** IST wall-clock parts via Intl (no fragile Date.parse of locale strings). */
export function getIstParts(at: Date = new Date()): {
  day: number;
  hours: number;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  let hours = Number(get('hour'));
  if (hours === 24) hours = 0;
  return {
    day: WEEKDAY_TO_JS[weekday] ?? new Date(at.toLocaleString('en-US', { timeZone: IST })).getDay(),
    hours,
    minutes: Number(get('minute')),
  };
}

/** @deprecated Prefer getIstParts — kept for callers that still expect a Date. */
export function getIstNow(): Date {
  const { hours, minutes } = getIstParts();
  const base = new Date();
  // Approximate IST Date for legacy callers; session checks use getIstParts.
  const asUtc = new Date(base.toLocaleString('en-US', { timeZone: IST }));
  asUtc.setHours(hours, minutes, 0, 0);
  return asUtc;
}

export function isNseFnoMarketOpen(at: Date = new Date()): boolean {
  const { day, hours, minutes } = getIstParts(at);
  if (day === 0 || day === 6) return false;
  const mins = hours * 60 + minutes;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function marketSessionLabel(): string {
  return isNseFnoMarketOpen() ? 'Market open' : 'Market closed';
}
