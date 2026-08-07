/**
 * Compatibility shim — routes keep importing from auth/pineEngine.mjs.
 * Implementation lives in server/pine/ (clean-room bar-by-bar VM).
 */

export { runPineScript, detectVersion, runEngine } from '../pine/index.mjs';
