/**
 * Public API for Wolf Pine engine (server-only).
 */

import { runEngine } from './engine.mjs';
import { detectVersion } from './util.mjs';

export { detectVersion } from './util.mjs';
export { runEngine };

/**
 * Stable entry used by appAuthRoutes.
 * @param {string} source
 * @param {Array} bars
 * @param {Record<string, string|number|boolean>} [inputOverrides]
 * @param {{ maxBars?: number, timeLimitMs?: number, maxDrawings?: number }} [opts]
 */
export function runPineScript(source, bars, inputOverrides = {}, opts = {}) {
  const maxBars = opts.maxBars ?? 5000;
  const timeLimitMs = opts.timeLimitMs ?? 8000;
  const maxDrawings = opts.maxDrawings ?? 200;

  try {
    return runEngine(source, bars, inputOverrides, { maxBars, timeLimitMs, maxDrawings, debug: opts.debug });
  } catch (err) {
    return {
      version: detectVersion(source),
      plots: [],
      hlines: [],
      shapes: [],
      drawings: [],
      warnings: [`Engine error: ${err?.message || err}`],
    };
  }
}
