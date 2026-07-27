/**
 * Forward TradingView access requests to a Google Sheet via Apps Script web app.
 * Set GOOGLE_SHEETS_TV_ACCESS_URL to the deployed Web App URL (doPost).
 */

function webhookUrl() {
  return String(process.env.GOOGLE_SHEETS_TV_ACCESS_URL || '').trim();
}

export function isTvAccessSheetConfigured() {
  return Boolean(webhookUrl());
}

/**
 * @param {{
 *   tradingViewId: string,
 *   indicatorId: string,
 *   indicatorTitle: string,
 *   userId?: string,
 *   userName?: string,
 *   userEmail?: string,
 *   userMobile?: string,
 * }} row
 */
export async function appendTvAccessRequest(row) {
  const url = webhookUrl();
  if (!url) {
    const err = new Error(
      'Google Sheet is not configured yet. Ask the admin to set GOOGLE_SHEETS_TV_ACCESS_URL.',
    );
    err.status = 503;
    throw err;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    tradingViewId: String(row.tradingViewId || '').trim(),
    indicatorId: String(row.indicatorId || '').trim(),
    indicatorTitle: String(row.indicatorTitle || '').trim(),
    userId: String(row.userId || '').trim(),
    userName: String(row.userName || '').trim(),
    userEmail: String(row.userEmail || '').trim(),
    userMobile: String(row.userMobile || '').trim(),
  };

  const res = await fetch(url, {
    method: 'POST',
    // text/plain avoids CORS preflight quirks with Google Apps Script redirects
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      'User-Agent': 'WolfTradeAI/1.0',
    },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  const text = await res.text().catch(() => '');
  const looksLikeHtml = /^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text);
  if (!res.ok || looksLikeHtml) {
    const err = new Error(
      res.status === 403 || looksLikeHtml
        ? 'Google Sheet webhook blocked (403). Redeploy Apps Script as Web app: Execute as Me, Who has access = Anyone, then paste the new /exec URL.'
        : text.slice(0, 200) || 'Could not update Google Sheet',
    );
    err.status = 502;
    throw err;
  }

  return payload;
}
