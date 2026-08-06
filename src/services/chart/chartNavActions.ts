import type { IChartApi } from 'lightweight-charts';

/**
 * TradingView.com zooms around the *rightmost* visible point (live edge),
 * not the cursor / midpoint (confirmed by TV's Lightweight Charts team).
 * One click ≈ ±2.5× (barSpacing / 10) — same step unit LWC uses for wheel zoom.
 */
const ZOOM_STEP = 2.5;
const MIN_VISIBLE_BARS = 8;
const MAX_VISIBLE_BARS = 8_000;

/** Zoom in (+) or out (−), anchored on the right edge of the viewport. */
export function tvZoom(chart: IChartApi, direction: 'in' | 'out') {
  const ts = chart.timeScale();
  const range = ts.getVisibleLogicalRange();
  if (!range) return;

  const right = range.to;
  const width = Math.max(2, range.to - range.from);
  // LWC: newBarSpacing = barSpacing * (1 + scale/10); visible bars ∝ 1/spacing
  const scale = direction === 'in' ? ZOOM_STEP : -ZOOM_STEP;
  const ratio = 1 + scale / 10;
  if (ratio <= 0.15) return;

  const nextWidth = Math.min(MAX_VISIBLE_BARS, Math.max(MIN_VISIBLE_BARS, width / ratio));
  ts.setVisibleLogicalRange({ from: right - nextWidth, to: right });
}

/**
 * TradingView-style wheel on the right price axis: zoom price range in/out
 * around an optional anchor (cursor price), otherwise the visible midpoint.
 */
export function tvZoomPrice(
  chart: IChartApi,
  direction: 'in' | 'out',
  anchorPrice?: number | null,
) {
  const ps = chart.priceScale('right');
  const vis = ps.getVisibleRange();
  if (!vis || !(vis.to > vis.from)) return;

  ps.setAutoScale(false);
  const span = vis.to - vis.from;
  if (!(span > 0)) return;

  const mid =
    typeof anchorPrice === 'number' && Number.isFinite(anchorPrice)
      ? anchorPrice
      : (vis.from + vis.to) / 2;
  const factor = direction === 'in' ? 0.88 : 1.14;
  const nextSpan = Math.max(span * 1e-12, span * factor);
  const topShare = Math.max(0.05, Math.min(0.95, (vis.to - mid) / span));
  const botShare = 1 - topShare;
  const from = mid - nextSpan * botShare;
  const to = mid + nextSpan * topShare;
  if (!(to > from)) return;
  ps.setVisibleRange({ from, to });
}

/**
 * Soft-expand a locked price window so a live tip outside the view stays visible
 * without re-enabling autoScale thrash.
 */
export function ensurePriceVisible(
  chart: IChartApi,
  high: number,
  low: number,
  padRatio = 0.04,
) {
  if (!(high >= low) || !Number.isFinite(high) || !Number.isFinite(low)) return;
  const ps = chart.priceScale('right');
  const vis = ps.getVisibleRange();
  if (!vis || !(vis.to > vis.from)) return;
  const pad = (vis.to - vis.from) * padRatio;
  let from = vis.from;
  let to = vis.to;
  if (high > to - pad) to = high + pad;
  if (low < from + pad) from = low - pad;
  if (from === vis.from && to === vis.to) return;
  if (!(to > from)) return;
  ps.setAutoScale(false);
  ps.setVisibleRange({ from, to });
}

/**
 * Scroll ← older / → newer by ~½ viewport (TV date-nav feel).
 * Instant (not 1s LWC animation) so hold-to-repeat stays crisp like TradingView.
 * scrollPosition = rightOffset: larger → more history (left); smaller → realtime.
 */
export function tvScroll(chart: IChartApi, direction: 'left' | 'right') {
  const ts = chart.timeScale();
  const range = ts.getVisibleLogicalRange();
  if (!range) return;

  const viewport = Math.max(5, range.to - range.from);
  const step = Math.max(5, Math.round(viewport * 0.5));
  const cur = ts.scrollPosition();
  const next = direction === 'left' ? cur + step : cur - step;
  ts.scrollToPosition(next, false);
}

/**
 * TV `timeScaleReset` / Alt+R: restore default bar spacing + right margin,
 * jump to realtime edge, and re-enable price auto-scale.
 * (fitContent is NOT TradingView reset — that flattens all history.)
 */
export function tvResetView(chart: IChartApi) {
  chart.priceScale('right').setAutoScale(true);
  chart.timeScale().resetTimeScale();
}
