/** NSE F&O regular session (IST) — shared server-side */

export function getIstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

export function isNseFnoMarketOpen(at = getIstNow()) {
  const day = at.getDay();
  if (day === 0 || day === 6) return false;
  const mins = at.getHours() * 60 + at.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}
