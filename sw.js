const CACHE_NAME = 'wfms-cache-v1';
const FILES = ['/', '/index.html', '/style.css', '/app.js', '/favicon.ico', '/manifest.json'];

// Install event: cache files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

// Activate event: clean old caches if needed
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch event: serve cache first, then network, fallback if both fail
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;

      return fetch(e.request).catch(err => {
        console.warn('ServiceWorker fetch failed for', e.request.url, err);

        // Optional: return cached index.html for navigation requests (SPA support)
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }

        // Fallback for other resources
        return new Response('Service unavailable', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
