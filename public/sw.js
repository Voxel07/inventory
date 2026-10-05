// The BUILD_ID placeholder is replaced at build time (vite.config.ts), so every deployment changes this file:
// the browser installs the new worker, which drops the previous deployment's cache on activation.
const BUILD_ID = '__BUILD_ID__';
const CACHE = `ash-inventory-shell-${BUILD_ID}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function remember(request, response) {
  if (response.ok && response.status === 200) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

/** Fresh HTML/config after a deployment; the cached copy only serves offline starts. */
function networkFirst(request, fallback) {
  return fetch(request, { cache: 'no-store' })
    .then((response) => remember(request, response))
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
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    // Content-hashed bundles are immutable.
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => remember(request, response))));
    return;
  }
  event.respondWith(networkFirst(request));
});
