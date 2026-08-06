/** Flip to true when Indicators should be visible again in the app + landing. */
export const SHOW_INDICATORS = true;

/**
 * Wolf Terminal — WIP. Show only on local Vite (`npm run dev`).
 * Production / preview builds hide the tab until chrome/height work is done.
 * Override: VITE_SHOW_TERMINAL=1
 */
export const SHOW_TERMINAL =
  import.meta.env.DEV || String(import.meta.env.VITE_SHOW_TERMINAL || '') === '1';
