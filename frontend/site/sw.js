// The phone app used to live at / with its service worker here; it moved to /join/.
// This worker replaces the old one on phones that still have it, then steps aside.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      // Only the old app's caches end with the root scope; /join/ keeps its own.
      for (const key of await caches.keys()) {
        if (key.endsWith(scope)) await caches.delete(key);
      }
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.navigate(client.url);
      }
    })(),
  );
});
