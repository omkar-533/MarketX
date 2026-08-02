export function getMarketProviderLabel(_provider?: string | null): string {
  return 'Live Market';
}

/** Map market provider id → price source tag used in UI */
export function priceSourceFromMarket(
  provider?: string | null,
): 'tradingview' | 'fyers' | 'none' {
  if (!provider) return 'none';
  if (provider.startsWith('tradingview')) return 'tradingview';
  if (provider.startsWith('fyers')) return 'fyers';
  return 'none';
}
