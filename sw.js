/**
 * Legacy no-op service worker.
 * App no longer registers a SW (reload-loop fix).
 * If an old client still has this file cached, do nothing harmful.
 */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.registration.unregister()),
  );
});

// No fetch handler — never intercept navigation / assets
