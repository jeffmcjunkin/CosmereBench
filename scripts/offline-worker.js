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
      // A reader can leave an old round open without delaying the next edition.
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const previous = (await caches.keys()).filter(
        (key) => key.startsWith(prefix) && key !== cacheName,
      );
      // An open page can still request assets with the previous build's hash.
      await Promise.all(previous.slice(0, -1).map((key) => caches.delete(key)));
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
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (url.href.startsWith(new URL("assets/", scope).href)) {
        const previous = await caches.match(event.request);
        if (previous) return previous;
      }
      return fetch(event.request);
    })(),
  );
});
