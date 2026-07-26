/** APMI service worker — bump CACHE on every UI-critical release */
const CACHE = 'apmi-shell-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Network only — never serve stale JS/HTML for the shell
  event.respondWith(fetch(event.request));
});
