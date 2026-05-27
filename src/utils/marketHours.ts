/** NSE equity + F&O regular session (IST) */

export function getIstNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

export function isNseFnoMarketOpen(at: Date = getIstNow()): boolean {
  const day = at.getDay();
  if (day === 0 || day === 6) return false;
  const mins = at.getHours() * 60 + at.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function marketSessionLabel(): string {
  return isNseFnoMarketOpen() ? 'Market open' : 'Market closed';
}
