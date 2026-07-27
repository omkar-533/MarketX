/**
 * Google Apps Script — paste into Extensions → Apps Script on your Sheet.
 *
 * Setup:
 * 1. Create a Google Sheet with header row:
 *    Timestamp | TradingView ID | Indicator | Indicator ID | User Name | Email | Mobile | User ID
 * 2. Extensions → Apps Script → paste this file
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web App URL into Render env: GOOGLE_SHEETS_TV_ACCESS_URL=...
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
