const ZERO_SVG_Y = 25;
const Y_SCALE = 0.7;

export function toSvgY(pnl: number): number {
  return ZERO_SVG_Y - pnl * Y_SCALE;
}

export function toSvgX(x: number): number {
  return x;
}

function pt(x: number, pnl: number): string {
  return `${toSvgX(x)},${toSvgY(pnl)}`;
}

function linePath(points: [number, number][]): string {
  if (!points.length) return '';
  return `M ${points.map(([x, y]) => pt(x, y)).join(' L ')}`;
}

/** Insert zero-crossings so we can split profit vs loss segments */
function densifyAtZero(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    out.push(points[i]);
    if (i >= points.length - 1) continue;
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if ((y1 < 0 && y2 > 0) || (y1 > 0 && y2 < 0)) {
      const t = (0 - y1) / (y2 - y1);
      const x0 = x1 + t * (x2 - x1);
      out.push([x0, 0]);
    }
  }
  return out;
}

export interface PayoffSvgPaths {
  fullPath: string;
  profitStroke: string;
  lossStroke: string;
  profitFill: string;
  lossFill: string;
}

export function buildPayoffSvgPaths(points: [number, number][]): PayoffSvgPaths {
  const dense = densifyAtZero(points);
  const fullPath = linePath(dense);

  const profitCurve: [number, number][] = [];
  const lossCurve: [number, number][] = [];

  dense.forEach(([x, y]) => {
    if (y > 0) profitCurve.push([x, y]);
    else if (y < 0) lossCurve.push([x, y]);
    else {
      profitCurve.push([x, 0]);
      lossCurve.push([x, 0]);
    }
  });

  const profitSegments: [number, number][][] = [];
  const lossSegments: [number, number][][] = [];
  let curProfit: [number, number][] = [];
  let curLoss: [number, number][] = [];

  dense.forEach(([x, y]) => {
    if (y > 0) {
      curProfit.push([x, y]);
      if (curLoss.length) {
        lossSegments.push(curLoss);
        curLoss = [];
      }
    } else if (y < 0) {
      curLoss.push([x, y]);
      if (curProfit.length) {
        profitSegments.push(curProfit);
        curProfit = [];
      }
    } else {
      if (curProfit.length) {
        profitSegments.push(curProfit);
        curProfit = [];
      }
      if (curLoss.length) {
        lossSegments.push(curLoss);
        curLoss = [];
      }
    }
  });
  if (curProfit.length) profitSegments.push(curProfit);
  if (curLoss.length) lossSegments.push(curLoss);

  const profitFillParts: string[] = [];
  profitSegments.forEach((seg) => {
    if (seg.length < 2) return;
    const first = seg[0];
    const last = seg[seg.length - 1];
    profitFillParts.push(
      `${linePath(seg)} L ${pt(last[0], 0)} L ${pt(first[0], 0)} Z`,
    );
  });

  const lossFillParts: string[] = [];
  lossSegments.forEach((seg) => {
    if (seg.length < 2) return;
    const first = seg[0];
    const last = seg[seg.length - 1];
    lossFillParts.push(
      `${linePath(seg)} L ${pt(last[0], 0)} L ${pt(first[0], 0)} Z`,
    );
  });

  return {
    fullPath,
    profitStroke: profitSegments.map(linePath).filter(Boolean).join(' '),
    lossStroke: lossSegments.map(linePath).filter(Boolean).join(' '),
    profitFill: profitFillParts.join(' '),
    lossFill: lossFillParts.join(' '),
  };
}

export const PAYOFF_CHART = {
  zeroY: ZERO_SVG_Y,
  profitGreen: '#16a34a',
  profitGreenBright: '#22c55e',
  profitGreenLight: '#4ade80',
  profitAreaFill: '#22c55e',
  lossRed: '#dc2626',
  lossRedBright: '#ef4444',
  lossRedLight: '#f87171',
  lossAreaFill: '#ef4444',
};
