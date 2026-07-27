/**
 * Google Apps Script — paste into Extensions → Apps Script on your Sheet.
 *
 * Setup (IMPORTANT — wrong access = 403 HTML error on submit):
 * 1. Create a Google Sheet with header row:
 *    Timestamp | TradingView ID | Indicator | Indicator ID | User Name | Email | Mobile | User ID
 * 2. Extensions → Apps Script → paste this file → Save
 * 3. Deploy → New deployment → type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone   ← must be "Anyone", NOT "Anyone with Google account"
 * 4. Authorize when Google asks
 * 5. Copy the Web App URL (.../exec) into Render: GOOGLE_SHEETS_TV_ACCESS_URL=...
 * 6. After any script edit: Deploy → Manage deployments → Edit (pencil) → New version → Deploy
 */

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const data = JSON.parse(e.postData.contents || '{}');
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.tradingViewId || '',
      data.indicatorTitle || '',
      data.indicatorId || '',
      data.userName || '',
      data.userEmail || '',
      data.userMobile || '',
      data.userId || '',
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('Wolf Trade AI — TradingView access sheet OK');
}
