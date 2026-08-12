import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_KEY = 'wolf_chunk_reload_v1';

/** True when a Vite/Rollup hashed chunk is missing after a new deploy (stale tab). */
export function isStaleChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const name = error instanceof Error ? error.name : '';
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed|ChunkLoadError|error loading dynamically imported module|CSS_CHUNK_LOAD_FAILED/i.test(
    `${name} ${msg}`,
  );
}

/** Hard-reload once per tab session so the browser picks up the new asset map. */
export function reloadOnceForStaleChunk(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === '1') return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    /* still reload */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_cr', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
  return true;
}

export function clearStaleChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * React.lazy wrapper: retry once, then auto-reload on stale hashed chunks
 * so users never sit on "Failed to fetch dynamically imported module".
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      clearStaleChunkReloadFlag();
      return mod;
    } catch (first) {
      await new Promise((r) => window.setTimeout(r, 350));
      try {
        const mod = await factory();
        clearStaleChunkReloadFlag();
        return mod;
      } catch (second) {
        if (isStaleChunkError(second) || isStaleChunkError(first)) {
          if (reloadOnceForStaleChunk()) {
            // Keep Suspense pending while navigation happens.
            return new Promise(() => undefined);
          }
        }
        throw second;
      }
    }
  });
}
