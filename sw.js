const CACHE_NAME = "trix-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

// Cache-first для статики
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API не кэшируем
  if (url.pathname.startsWith("/api")) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      // кэшируем только GET и только same-origin
      if (req.method === "GET" && url.origin === self.location.origin) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      // если офлайн и нет кэша — хотя бы index
      return (await cache.match("./index.html")) || new Response("Offline", { status: 503 });
    }
  })());
});
