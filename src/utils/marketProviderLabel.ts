export function getMarketProviderLabel(_provider?: string | null): string {
  return 'Fyers API';
}

export function priceSourceFromMarket(provider?: string | null): 'fyers' | 'none' {
  if (provider === 'fyers' || provider === 'fyers-ws' || provider === 'fyers-cached') return 'fyers';
  return 'none';
}
