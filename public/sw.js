// The BUILD_ID placeholder is replaced at build time (vite.config.ts), so every deployment changes this file:
// the browser installs the new worker, which drops the previous deployment's cache on activation.
const BUILD_ID = '__BUILD_ID__';
const CACHE_PREFIX = 'ash-inventory-shell-';
const CACHE = `${CACHE_PREFIX}${BUILD_ID}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg',
  '/logo_180.png', '/logo_192.png', '/logo_512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  // Only this app's earlier shell caches; other caches of the same origin are not ours to delete.
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

/**
 * Stores a successful response for offline starts. The write is kept alive with waitUntil so the worker is not
 * terminated mid-write; a failed write (e.g. quota) only loses the offline copy and never the live response.
 */
function remember(event, request, response) {
  if (response.ok && response.status === 200) {
    const copy = response.clone();
    event.waitUntil(caches.open(CACHE)
      .then((cache) => cache.put(request, copy))
      .catch((error) => console.warn('Offline shell cache write failed', request.url, error)));
  }
  return response;
}

/** Fresh HTML/config after a deployment; the cached copy only serves offline starts. */
function networkFirst(event, request, fallback) {
  return fetch(request, { cache: 'no-store' })
    .then((response) => remember(event, request, response))
    .catch(() => caches.match(request).then((cached) => cached || (fallback ? caches.match(fallback) : undefined)));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Authenticated API responses never enter the shared Cache API, and third-party resources
  // (map tiles, external images) are left to the browser's HTTP cache.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, request, '/index.html'));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    // Content-hashed bundles are immutable.
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => remember(event, request, response))));
    return;
  }
  event.respondWith(networkFirst(event, request));
});
