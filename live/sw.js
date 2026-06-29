// Kill-switch service worker — removes itself and any cached app shell.
// We no longer use a service worker (the page is always fetched fresh over the network).
// Any device still running an old caching worker will, on its next update check, receive
// THIS file, which purges all caches, unregisters itself, and reloads open tabs onto the
// live network version. After that there is no service worker and nothing is cached.
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try { var ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k); })); } catch (err) {}
    try { await self.registration.unregister(); } catch (err) {}
    try {
      var cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(function (c) { try { c.navigate(c.url); } catch (err) {} });
    } catch (err) {}
  })());
});
