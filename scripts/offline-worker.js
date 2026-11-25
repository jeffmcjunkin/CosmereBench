const scope = self.registration.scope;
const prefix = "cosmerebench-" + new URL(scope).pathname + "-";
const cacheName = prefix + "__BUILD_HASH__";
const files = /* PRECACHE */ [];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      try {
        await cache.addAll(
          files.map((p) => new Request(new URL(p, scope), { cache: "reload" })),
        );
      } catch (error) {
        await caches.delete(cacheName);
        throw error;
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((k) => k.startsWith(prefix) && k !== cacheName)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !url.href.startsWith(scope)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      if (
        event.request.mode === "navigate" &&
        (url.pathname === new URL(scope).pathname ||
          url.pathname === new URL("index.html", scope).pathname)
      ) {
        const entry = await cache.match(new URL("index.html", scope));
        if (entry) return entry;
      }
      return (await cache.match(event.request)) || fetch(event.request);
    })(),
  );
});
