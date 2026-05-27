function normCdf(x: number): number {
  const a1 = 0.319381530;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const L = Math.abs(x);
  const K = 1 / (1 + 0.2316419 * L);
  const w =
    1 -
    (1 / Math.sqrt(2 * Math.PI)) *
      Math.exp((-L * L) / 2) *
      (a1 * K + a2 * K ** 2 + a3 * K ** 3 + a4 * K ** 4 + a5 * K ** 5);
  return x < 0 ? 1 - w : w;
}

/** Black-Scholes option price (₹ per unit) */
export function blackScholesPrice(
  spot: number,
  strike: number,
  daysToExpiry: number,
  iv: number,
  type: 'CE' | 'PE',
  interestRate = 0.065,
): number {
  const T = Math.max(daysToExpiry, 0) / 365;
  const intrinsic = type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  if (T <= 0.0001) return intrinsic;

  const sigma = Math.max(iv, 1) / 100;
  const r = interestRate;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  let price: number;
  if (type === 'CE') {
    price = spot * normCdf(d1) - strike * Math.exp(-r * T) * normCdf(d2);
  } else {
    price = strike * Math.exp(-r * T) * normCdf(-d2) - spot * normCdf(-d1);
  }
  return Math.round(Math.max(intrinsic, price) * 100) / 100;
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Black-Scholes Greeks */
export function calculateGreeks(
  spot: number,
  strike: number,
  daysToExpiry: number,
  iv: number,
  type: 'CE' | 'PE',
  interestRate = 0.065,
): { delta: number; gamma: number; theta: number; vega: number; rho: number } {
  const T = Math.max(daysToExpiry, 0.5) / 365;
  const sigma = Math.max(iv, 1) / 100;
  const r = interestRate;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normPdf(d1);

  const delta =
    type === 'CE' ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = nd1 / (spot * sigma * sqrtT);
  const thetaRaw =
    (-(spot * nd1 * sigma) / (2 * sqrtT) -
      r * strike * Math.exp(-r * T) * (type === 'CE' ? normCdf(d2) : normCdf(-d2))) /
    365;
  const vega = (spot * nd1 * sqrtT) / 100;
  const rho =
    (type === 'CE' ? 1 : -1) *
    ((strike * T * Math.exp(-r * T) * normCdf(type === 'CE' ? d2 : -d2)) / 100);

  const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

  return {
    delta: round(delta, 2),
    gamma: round(gamma, 4),
    theta: round(thetaRaw, 2),
    vega: round(vega, 2),
    rho: round(rho, 2),
  };
}

/** Mark-to-market for scenario (uses BS) */
export function estimateOptionPrice(
  spot: number,
  strike: number,
  type: 'CE' | 'PE',
  daysToExpiry: number,
  iv: number,
  interestRate = 0.065,
): number {
  return blackScholesPrice(spot, strike, daysToExpiry, iv, type, interestRate);
}
