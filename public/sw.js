const CACHE_NAME = "quiz-app-v3";
const APP_SHELL = [
  "/",
  "/tablet",
  "/screen",
  "/style.css",
  "/common.js",
  "/pwa.js",
  "/sfx.js",
  "/manifest.json",
  "/favicon.svg",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("quiz-app-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/audio/"))
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const path = url.pathname;
        const fallback =
          path === "/"
            ? "/"
            : path === "/tablet"
              ? "/tablet"
              : path.startsWith("/screen")
                ? "/screen"
                : "/";
        return (await cache.match(fallback)) || Response.error();
      }),
    );
    return;
  }

  if (
    url.pathname === "/style.css" ||
    url.pathname === "/common.js" ||
    url.pathname === "/pwa.js" ||
    url.pathname === "/sfx.js" ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/favicon.png" ||
    /^\/icon-(192|512)\.png$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(request).then(async (response) => {
          if (response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, copy);
          }
          return response;
        });
      }),
    );
  }
});
