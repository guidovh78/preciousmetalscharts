// Service worker for the live. price app — pass-through, NEVER caches.
// A fetch listener exists only so the app stays installable ("Add to Home Screen");
// it does not call respondWith, so every request goes straight to the network and the
// page is always the latest. On activate it deletes any old caches left by previous
// versions, so devices that were stuck on a cached page get cleaned up automatically.
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

// Pass-through: present (for installability) but never intercepts → no caching.
self.addEventListener('fetch', function () {});
