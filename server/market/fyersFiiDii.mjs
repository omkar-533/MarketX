/**
 * FII/DII — not available on Fyers Data API.
 * Returns empty dataset (no NSE / Yahoo fallback).
 */
export async function fetchFyersFiiDii(_days = 30) {
  return {
    rows: [],
    source: 'fyers',
    available: false,
    message: 'FII/DII data is not provided by Fyers API',
    fetchedAt: new Date().toISOString(),
  };
}
